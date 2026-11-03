// "Lưu phiếu thu hồi" (returns-and-compensation design D1, D2, D7): one
// transaction writes the ledger lines, the return note, its photos, the
// compensation note and the activity rows. The draft id comes first so a
// resend never posts twice; the contract is locked before anything is read,
// as postDelivery does, so returns and deliveries of one contract run in turn.
import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  compensationNote,
  inventoryCost,
  location,
  returnNote,
  returnNoteLine,
  returnPhoto,
  site,
} from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import { DomainValueError } from "@/domain/errors";
import { toMoney, type Money } from "@/domain/money";
import type { MovementDraft } from "@/domain/movement";
import { parseQuantity, sumByUnit } from "@/domain/quantity";
import {
  allocateReturn,
  assertReturnLines,
  RETURN_MESSAGES,
  RETURN_NOTE_MAX,
  RETURN_NOTE_PREFIX,
  RETURN_PLATE_MAX,
  returnedMilli,
  type OnSite,
  type ReturnCounts,
  type ReturnLineInput,
  type ScrapPricing,
} from "@/domain/return-note";
import { PHOTO_MAX_PER_NOTE, PHOTO_MESSAGES } from "@/domain/return-photo";
import { postedReturnSummary } from "@/domain/return-summary";
import { can } from "@/domain/permissions";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  isUniqueViolation,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import {
  ContractFieldError,
  forbidden,
  run,
  type ContractActor,
  type Tx,
} from "@/lib/contracts/common";
import { lockContract } from "@/lib/contracts/records";
import { createCompensation } from "@/lib/compensations/create";
import {
  db3,
  isUuid,
  itemFacts,
  onSiteByItemCondition,
  RETURN_DOCUMENT_TYPE,
  type ItemFacts,
} from "@/lib/deliveries/records";
import { nextDocumentCode } from "@/lib/inventory/counter";
import { postMovements } from "@/lib/inventory/post";
import { currentScrapPrice } from "@/lib/receiving/scrap-price";

export const POST_RETURN_MESSAGES = {
  draftId: "Thiếu mã nháp của điện thoại.",
  draftOfOther: "Mã nháp này đã dùng cho một phiếu khác.",
  contract: "Bạn chọn công trình trả hàng.",
  item: "Mã hàng không thuộc công trình này.",
} as const;

export interface ReturnLineBody {
  itemId?: string;
  good?: string;
  repair?: string;
  scrap?: string;
  lost?: string;
}

export interface PostReturnBody {
  clientDraftId?: string;
  contractId?: string;
  yardLocationId?: string;
  vehiclePlate?: string | null;
  note?: string | null;
  /** When the phone tapped "Lưu phiếu thu hồi"; information only. */
  savedOnDeviceAt?: string | null;
  lines?: ReturnLineBody[];
  /** Photos sent before with the same draft id, in their order. */
  photoIds?: string[];
}

export interface PostedReturn {
  code: string;
  businessDate: string;
  compensationCode: string | null;
  replayed: boolean;
}

export interface PostReturnOptions {
  now?: Date;
}

const field = (message: string, name: string) =>
  new ContractFieldError(message, name);

/** Answered 422 so the phone sends the photos again (design D4, D13). */
export const PHOTOS_EXPIRED = "PHOTOS_EXPIRED";

function photosExpired(ids: readonly string[]): never {
  throw new ServiceFailure({
    ok: false,
    status: 422,
    error: PHOTO_MESSAGES.expired,
    details: { code: PHOTOS_EXPIRED, expiredPhotoIds: [...ids] },
  });
}

function assertReceiver(actor: ContractActor): void {
  if (!can(actor.role, "returns.receive")) {
    throw new ServiceFailure(forbidden());
  }
}

async function replayOf(
  tx: Pick<Database, "select">,
  actor: ContractActor,
  draftId: string,
): Promise<PostedReturn | null> {
  const [row] = await tx
    .select({
      id: returnNote.id,
      code: returnNote.code,
      businessDate: returnNote.businessDate,
      postedBy: returnNote.postedBy,
    })
    .from(returnNote)
    .where(eq(returnNote.clientDraftId, draftId));
  if (!row) return null;
  if (row.postedBy !== actor.id) {
    throw new ServiceFailure(conflict(POST_RETURN_MESSAGES.draftOfOther));
  }
  const [made] = await tx
    .select({ code: compensationNote.code })
    .from(compensationNote)
    .where(eq(compensationNote.returnNoteId, row.id));
  return {
    code: row.code,
    businessDate: row.businessDate,
    compensationCode: made?.code ?? null,
    replayed: true,
  };
}

function readMilli(
  value: string | undefined,
  info: ItemFacts,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return 0;
  try {
    return parseQuantity(value, info.unit).milli;
  } catch (error: unknown) {
    if (error instanceof DomainValueError) throw field(error.message, name);
    throw error;
  }
}

function readLines(
  body: readonly ReturnLineBody[],
  facts: ReadonlyMap<string, ItemFacts>,
): ReturnLineInput[] {
  return body.map((line, index) => {
    const info = line.itemId ? facts.get(line.itemId) : undefined;
    if (!info) throw field(POST_RETURN_MESSAGES.item, `lines.${index}.itemId`);
    const counts: ReturnCounts = {
      goodMilli: readMilli(line.good, info, `lines.${index}.good`),
      repairMilli: readMilli(line.repair, info, `lines.${index}.repair`),
      scrapMilli: readMilli(line.scrap, info, `lines.${index}.scrap`),
      lostMilli: readMilli(line.lost, info, `lines.${index}.lost`),
    };
    return { itemId: info.id, itemCode: info.code, unit: info.unit, counts };
  });
}

function optionalText(
  value: string | null | undefined,
  max: number,
  message: string,
  name: string,
): string | null {
  const text = value?.trim() ?? "";
  if (text === "") return null;
  if (text.length > max) throw field(message, name);
  return text;
}

/** The site and yard of the note: the contract's SITE, an active YARD. */
async function placesOf(
  tx: Tx,
  siteId: string | null,
  yardId: string | undefined,
): Promise<{ siteLocationId: string; siteName: string; yardId: string }> {
  const [work] = siteId
    ? await tx
        .select({ locationId: site.locationId, name: site.name })
        .from(site)
        .where(eq(site.id, siteId))
    : [];
  if (!work?.locationId) throw new DomainValueError(RETURN_MESSAGES.notRental);
  const [yard] = isUuid(yardId)
    ? await tx
        .select({
          id: location.id,
          type: location.type,
          status: location.status,
        })
        .from(location)
        .where(eq(location.id, yardId))
        .for("share")
    : [];
  if (!yard || yard.type !== "YARD" || yard.status !== "ACTIVE") {
    throw field(RETURN_MESSAGES.notYard, "yardLocationId");
  }
  return {
    siteLocationId: work.locationId,
    siteName: work.name,
    yardId: yard.id,
  };
}

/** Company averages of the items, by condition (null = never priced). */
async function averages(
  tx: Tx,
  itemIds: readonly string[],
): Promise<Map<string, Money | null>> {
  if (itemIds.length === 0) return new Map();
  const rows = await tx
    .select({
      itemId: inventoryCost.itemId,
      condition: inventoryCost.condition,
      avgCost: inventoryCost.avgCost,
    })
    .from(inventoryCost)
    .where(inArray(inventoryCost.itemId, [...itemIds]));
  return new Map(
    rows.map((row) => [
      `${row.itemId}|${row.condition}`,
      row.avgCost === null ? null : toMoney(row.avgCost),
    ]),
  );
}

async function scrapPricing(
  tx: Tx,
  lines: readonly ReturnLineInput[],
  facts: ReadonlyMap<string, ItemFacts>,
): Promise<Map<string, ScrapPricing>> {
  const withScrap = lines.filter((line) => line.counts.scrapMilli > 0);
  if (withScrap.length === 0) return new Map();
  const avg = await averages(
    tx,
    withScrap.map((line) => line.itemId),
  );
  const price = withScrap.some(
    (line) => (avg.get(`${line.itemId}|SCRAP`) ?? null) === null,
  )
    ? await currentScrapPrice(tx)
    : null;
  return new Map(
    withScrap.map((line) => {
      const info = facts.get(line.itemId) as ItemFacts;
      const of = (condition: string) =>
        avg.get(`${line.itemId}|${condition}`) ?? null;
      return [
        line.itemId,
        {
          scrapAvg: of("SCRAP"),
          siteAvg: { NEW: of("NEW"), GOOD: of("GOOD") },
          standardWeightKg:
            info.standardWeightMilli === null
              ? null
              : db3(info.standardWeightMilli),
          scrapPricePerKg: price?.pricePerKg ?? null,
        },
      ];
    }),
  );
}

/** Photos sent with this draft by this person, not yet on a note. */
async function draftPhotos(
  tx: Tx,
  actor: ContractActor,
  draftId: string,
  ids: readonly string[],
): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length > PHOTO_MAX_PER_NOTE) {
    throw field(PHOTO_MESSAGES.tooMany, "photoIds");
  }
  if (unique.some((id) => !isUuid(id)))
    photosExpired(unique.filter((id) => !isUuid(id)));
  if (unique.length === 0) return [];
  const rows = await tx
    .select({ id: returnPhoto.id })
    .from(returnPhoto)
    .where(
      and(
        inArray(returnPhoto.id, unique),
        eq(returnPhoto.clientDraftId, draftId),
        eq(returnPhoto.uploadedBy, actor.id),
        isNull(returnPhoto.returnNoteId),
      ),
    )
    .for("update");
  const found = new Set(rows.map((row) => row.id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) photosExpired(missing);
  return unique;
}

function readSavedAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

async function postInTransaction(
  tx: Tx,
  actor: ContractActor,
  body: PostReturnBody,
  draftId: string,
  now: Date,
): Promise<PostedReturn> {
  if (!isUuid(body.contractId)) {
    throw field(POST_RETURN_MESSAGES.contract, "contractId");
  }
  const locked = await lockContract(tx, body.contractId);
  // The same draft sent twice at once: the loser waited on the lock.
  const again = await replayOf(tx, actor, draftId);
  if (again) return again;
  if (locked.type !== "RENTAL" || locked.status !== "ACTIVE") {
    throw new DomainValueError(RETURN_MESSAGES.notRental);
  }
  const places = await placesOf(tx, locked.siteId, body.yardLocationId);
  const vehiclePlate = optionalText(
    body.vehiclePlate,
    RETURN_PLATE_MAX,
    RETURN_MESSAGES.plateLong,
    "vehiclePlate",
  );
  const note = optionalText(
    body.note,
    RETURN_NOTE_MAX,
    RETURN_MESSAGES.noteLong,
    "note",
  );

  const bodyLines = body.lines ?? [];
  const facts = await itemFacts(
    tx,
    bodyLines.flatMap((line) => (isUuid(line.itemId) ? [line.itemId] : [])),
  );
  const onSite = await onSiteByItemCondition(tx, locked.id);
  const lines = assertReturnLines(
    locked.code,
    readLines(bodyLines, facts),
    onSite as ReadonlyMap<string, OnSite>,
  );
  const photoIds = await draftPhotos(tx, actor, draftId, body.photoIds ?? []);

  const today: BusinessDate = toBusinessDate(now);
  const code = await nextDocumentCode(
    tx,
    RETURN_NOTE_PREFIX,
    Number(today.slice(0, 4)),
  );
  const noteId = randomUUID();
  const scrap = await scrapPricing(tx, lines, facts);
  const drafts: MovementDraft[] = lines.flatMap((line) =>
    allocateReturn({
      code,
      siteLocationId: places.siteLocationId,
      yardLocationId: places.yardId,
      line,
      onSite: onSite.get(line.itemId) as OnSite,
      ...(scrap.has(line.itemId) ? { scrap: scrap.get(line.itemId) } : {}),
    }),
  );
  const posting = await postMovements(
    tx,
    actor,
    {
      documentType: RETURN_DOCUMENT_TYPE,
      documentId: noteId,
      documentCode: code,
      businessDate: today,
      lines: drafts,
    },
    today,
  );

  await tx.insert(returnNote).values({
    id: noteId,
    code,
    contractId: locked.id,
    siteLocationId: places.siteLocationId,
    yardLocationId: places.yardId,
    businessDate: today,
    vehiclePlate,
    note,
    clientDraftId: draftId,
    postingId: posting.postingId,
    savedOnDeviceAt: readSavedAt(body.savedOnDeviceAt),
    postedBy: actor.id,
    postedAt: now,
  });
  await tx.insert(returnNoteLine).values(
    lines.map((line, index) => ({
      noteId,
      lineNo: index + 1,
      itemId: line.itemId,
      goodQuantity: db3(line.counts.goodMilli),
      repairQuantity: db3(line.counts.repairMilli),
      scrapQuantity: db3(line.counts.scrapMilli),
      lostQuantity: db3(line.counts.lostMilli),
    })),
  );
  for (const [position, id] of photoIds.entries()) {
    await tx
      .update(returnPhoto)
      .set({ returnNoteId: noteId, position })
      .where(eq(returnPhoto.id, id));
  }

  await logActivity(
    tx,
    actor,
    {
      action: "POST",
      document: { type: RETURN_DOCUMENT_TYPE, id: noteId, code },
      summary: postedReturnSummary(
        places.siteName,
        sumByUnit(
          lines.map((line) => ({
            unit: line.unit,
            milli: returnedMilli(line.counts),
          })),
        ).filter((row) => row.milli > 0),
        sumByUnit(
          lines.map((line) => ({
            unit: line.unit,
            milli: line.counts.lostMilli,
          })),
        ).filter((row) => row.milli > 0),
      ),
    },
    { now },
  );
  const compensation = await createCompensation(
    tx,
    actor,
    {
      contractId: locked.id,
      returnNoteId: noteId,
      returnCode: code,
      returnDate: today,
      lines,
      itemCodes: new Map(lines.map((line) => [line.itemId, line.itemCode])),
    },
    now,
  );
  return {
    code,
    businessDate: today,
    compensationCode: compensation?.code ?? null,
    replayed: false,
  };
}

/** "Lưu phiếu thu hồi" (spec returns). */
export function postReturn(
  db: Database,
  actor: ContractActor,
  body: PostReturnBody,
  options: PostReturnOptions = {},
): Promise<ServiceResult<PostedReturn>> {
  return run(async () => {
    assertReceiver(actor);
    if (!isUuid(body.clientDraftId)) {
      throw field(POST_RETURN_MESSAGES.draftId, "clientDraftId");
    }
    const draftId = body.clientDraftId;
    const replay = await replayOf(db, actor, draftId);
    if (replay) return ok(replay);
    const now = options.now ?? new Date();
    try {
      return ok(
        await db.transaction((tx) =>
          postInTransaction(tx, actor, body, draftId, now),
        ),
      );
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      const again = await replayOf(db, actor, draftId);
      if (!again) throw error;
      return ok(again);
    }
  });
}
