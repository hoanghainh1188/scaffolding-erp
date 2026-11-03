// "Xác nhận xe rời bãi" (deliveries design D2, D5, D9): one transaction
// writes the picks, the ledger lines, the note, the contract start and one
// activity row. The draft id comes first so a resend never posts twice.

import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  contract,
  deliveryNote,
  deliveryNoteLine,
  deliveryNotePick,
  user,
} from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import type { Condition } from "@/domain/condition";
import { transition as contractTransition } from "@/domain/contract";
import { byWeight } from "@/domain/contract-lines";
import {
  assertContractDeliverable,
  assertPicks,
  assertSaleWithinRemaining,
  DELIVERY_MESSAGES,
  lineKey,
  lineUnit,
  pickedMilli,
  remainingToDeliver,
  transition,
  type DeliveryStatus,
  type PickInput,
  type PickLine,
  type TermsLine,
} from "@/domain/delivery-note";
import { postedSummary, type NamedAmount } from "@/domain/delivery-summary";
import { DomainValueError } from "@/domain/errors";
import type { MovementDraft } from "@/domain/movement";
import { hasStandardWeight, parseQuantity } from "@/domain/quantity";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  isUniqueViolation,
  notFound,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import {
  ContractFieldError,
  run,
  type ContractActor,
  type Tx,
} from "@/lib/contracts/common";
import { lockContract } from "@/lib/contracts/records";
import { contractTermsAt } from "@/lib/contracts/terms";
import { postMovements } from "@/lib/inventory/post";

import {
  db3,
  DELIVERY_DOCUMENT_TYPE,
  doneByLine,
  findNote,
  isUuid,
  itemFacts,
  lockNote,
  readNoteContent,
  termsLines,
  type ItemFacts,
  type NoteRow,
  type StoredLine,
} from "./records";
import { assertPicker } from "./service";

export const POST_MESSAGES = {
  draftId: "Thiếu mã nháp của điện thoại.",
  draftOfOther: "Mã nháp này đã dùng cho một phiếu khác.",
  plate: "Bạn nhập biển số xe chở hàng.",
  plateLong: "Biển số xe tối đa 20 ký tự.",
  line: "Dòng nhặt không thuộc phiếu này.",
  staleOnPhone: (code: string) =>
    `Văn phòng đã đổi phiếu ${code} sau khi bạn bắt đầu nhặt. Bạn mở lại phiếu để nhặt theo số mới.`,
  postedBy: (code: string, time: string, name: string) =>
    `Phiếu ${code} đã xuất lúc ${time} do ${name} xác nhận.`,
} as const;

export interface PickBody {
  lineId?: string;
  condition?: string;
  quantity?: string;
  weighedKg?: string | null;
  piecesEstimated?: boolean;
}

export interface PostDeliveryBody {
  clientDraftId?: string;
  /** updated_at of the note when picking started (design D1). */
  startedVersion?: string;
  /** When the phone tapped the button; information only (design D2). */
  departedAt?: string | null;
  vehiclePlate?: string | null;
  picks?: PickBody[];
}

export interface PostedDelivery {
  code: string;
  businessDate: string;
  contractStarted: boolean;
  replayed: boolean;
}

export interface PostOptions {
  now?: Date;
}

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const field = (message: string, name: string) =>
  new ContractFieldError(message, name);

async function replayOf(
  tx: Pick<Database, "select">,
  actor: ContractActor,
  draftId: string,
): Promise<PostedDelivery | null> {
  const [row] = await tx
    .select({
      code: deliveryNote.code,
      businessDate: deliveryNote.businessDate,
      postedBy: deliveryNote.postedBy,
    })
    .from(deliveryNote)
    .where(eq(deliveryNote.clientDraftId, draftId));
  if (!row) return null;
  if (row.postedBy !== actor.id) {
    throw new ServiceFailure(conflict(POST_MESSAGES.draftOfOther));
  }
  return {
    code: row.code,
    businessDate: row.businessDate ?? "",
    contractStarted: false,
    replayed: true,
  };
}

async function postedByText(tx: Tx, note: NoteRow): Promise<string> {
  const [row] = note.postedBy
    ? await tx
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, note.postedBy))
    : [];
  return POST_MESSAGES.postedBy(
    note.code,
    note.postedAt ? timeFormatter.format(note.postedAt) : "",
    row?.name ?? "",
  );
}

function readQuantity(
  value: string | null | undefined,
  unit: ItemFacts["unit"],
  name: string,
): number {
  try {
    return parseQuantity(value ?? "", unit).milli;
  } catch (error: unknown) {
    if (error instanceof DomainValueError) throw field(error.message, name);
    throw error;
  }
}

/** The body's picks grouped under the note lines (rules in assertPicks). */
function pickLines(
  lines: readonly StoredLine[],
  facts: Map<string, ItemFacts>,
  picks: readonly PickBody[],
): PickLine[] {
  const byLine = new Map<string, PickInput[]>();
  picks.forEach((pick, index) => {
    const line = lines.find((row) => row.id === pick.lineId);
    if (!line) throw field(POST_MESSAGES.line, `picks.${index}.lineId`);
    const info = facts.get(line.itemId) as ItemFacts;
    const quantityMilli = readQuantity(
      pick.quantity,
      info.unit,
      `picks.${index}.quantity`,
    );
    if (quantityMilli === 0) return;
    const measuredByQuantity = !hasStandardWeight(info.unit);
    const weighed =
      pick.weighedKg === null ||
      pick.weighedKg === undefined ||
      pick.weighedKg.trim() === ""
        ? null
        : readQuantity(pick.weighedKg, "KG", `picks.${index}.weighedKg`);
    const entry: PickInput = {
      condition: pick.condition as Condition,
      quantityMilli,
      weighedMilli:
        measuredByQuantity && byWeight(line.pricingUnit ?? "")
          ? quantityMilli
          : weighed,
      piecesEstimated: pick.piecesEstimated === true && weighed !== null,
    };
    byLine.set(line.id, [...(byLine.get(line.id) ?? []), entry]);
  });
  return lines.map((line) => {
    const info = facts.get(line.itemId) as ItemFacts;
    return {
      lineId: line.id,
      itemCode: info.code,
      unit: info.unit,
      condition: line.condition,
      pricingUnit: line.pricingUnit,
      requestedMilli: line.requestedMilli,
      picks: byLine.get(line.id) ?? [],
    };
  });
}

function movementsOf(
  note: NoteRow,
  type: "RENTAL" | "SALE",
  description: string,
  lines: readonly PickLine[],
  facts: Map<string, ItemFacts>,
  storedLines: readonly StoredLine[],
): MovementDraft[] {
  const drafts: MovementDraft[] = [];
  for (const line of lines) {
    const stored = storedLines.find(
      (row) => row.id === line.lineId,
    ) as StoredLine;
    const info = facts.get(stored.itemId) as ItemFacts;
    for (const pick of line.picks) {
      if (type === "RENTAL") {
        const out = drafts.length;
        drafts.push({
          itemId: info.id,
          condition: pick.condition,
          locationId: note.sourceLocationId,
          movement: "DELIVERY_OUT",
          quantityMilli: -pick.quantityMilli,
          description,
        });
        drafts.push({
          itemId: info.id,
          condition: pick.condition,
          locationId: note.siteLocationId,
          movement: "DELIVERY_IN",
          quantityMilli: pick.quantityMilli,
          pairedWith: out,
          description,
        });
      } else {
        drafts.push({
          itemId: info.id,
          condition: pick.condition,
          locationId: note.sourceLocationId,
          movement: "SALE_OUT",
          quantityMilli: -pick.quantityMilli,
          ...(pick.weighedMilli !== null && hasStandardWeight(info.unit)
            ? { weighedKgMilli: pick.weighedMilli }
            : {}),
          description,
        });
      }
    }
  }
  return drafts;
}

function named(
  line: PickLine,
  facts: Map<string, ItemFacts>,
  storedLines: readonly StoredLine[],
  milli: number,
): NamedAmount {
  const stored = storedLines.find(
    (row) => row.id === line.lineId,
  ) as StoredLine;
  const info = facts.get(stored.itemId) as ItemFacts;
  return {
    itemCode: info.code,
    itemName: info.name,
    unit: lineUnit(line),
    milli,
  };
}

async function postInTransaction(
  tx: Tx,
  actor: ContractActor,
  noteRef: string,
  body: PostDeliveryBody,
  draftId: string,
  now: Date,
): Promise<PostedDelivery> {
  const found = await findNote(tx, noteRef);
  if (!found) throw new ServiceFailure(notFound());
  assertPicker(actor);
  const locked = await lockContract(tx, found.contractId);
  const note = await lockNote(tx, found.id);
  if (note.status === "POSTED") {
    // The same draft sent twice at once: the loser waited on the lock.
    if (note.clientDraftId === draftId && note.postedBy === actor.id) {
      return {
        code: note.code,
        businessDate: note.businessDate ?? "",
        contractStarted: false,
        replayed: true,
      };
    }
    throw new ServiceFailure(conflict(await postedByText(tx, note)));
  }
  transition(note.status as DeliveryStatus, "POST", note.code);
  if (
    !body.startedVersion ||
    new Date(body.startedVersion).getTime() !== note.updatedAt.getTime()
  ) {
    throw new ServiceFailure(conflict(POST_MESSAGES.staleOnPhone(note.code)));
  }
  assertContractDeliverable(locked.status);
  const plate = (body.vehiclePlate ?? note.vehiclePlate ?? "").trim();
  if (plate === "") throw field(POST_MESSAGES.plate, "vehiclePlate");
  if (plate.length > 20) throw field(POST_MESSAGES.plateLong, "vehiclePlate");

  const today: BusinessDate = toBusinessDate(now);
  const terms = await contractTermsAt(tx, locked.id, today);
  if (!terms) throw new DomainValueError(DELIVERY_MESSAGES.contractNotApproved);
  const tLines = await termsLines(tx, terms);
  const byKey = new Map<string, TermsLine>(
    tLines.map((line) => [
      lineKey(line.itemId, line.condition, line.pricingUnit),
      line,
    ]),
  );
  const content = await readNoteContent(tx, note.id);
  const facts = await itemFacts(
    tx,
    content.lines.map((line) => line.itemId),
  );
  for (const line of content.lines) {
    if (!byKey.has(lineKey(line.itemId, line.condition, line.pricingUnit))) {
      throw new DomainValueError(
        DELIVERY_MESSAGES.notOnContract(facts.get(line.itemId)?.code ?? ""),
      );
    }
  }
  const lines = pickLines(content.lines, facts, body.picks ?? []);
  const shortages = assertPicks(locked.type, lines);

  const remaining = remainingToDeliver({
    type: locked.type,
    terms: tLines,
    done: await doneByLine(tx, locked.type, locked.id),
    open: new Map(),
  });
  const remainingByKey = new Map(remaining.map((row) => [row.key, row]));
  const keyOf = (line: PickLine) => {
    const stored = content.lines.find(
      (row) => row.id === line.lineId,
    ) as StoredLine;
    return lineKey(stored.itemId, stored.condition, stored.pricingUnit);
  };
  if (locked.type === "SALE") {
    assertSaleWithinRemaining(
      lines
        .filter((line) => line.picks.length > 0)
        .map((line) => ({
          line: byKey.get(keyOf(line)) as TermsLine,
          deliveredMilli: pickedMilli(line),
          doneMilli: remainingByKey.get(keyOf(line))?.doneMilli ?? 0,
        })),
    );
  }
  const over =
    locked.type === "RENTAL"
      ? lines.flatMap((line) => {
          const extra =
            pickedMilli(line) -
            (remainingByKey.get(keyOf(line))?.remainingMilli ?? 0);
          return extra > 0
            ? [{ itemCode: line.itemCode, unit: lineUnit(line), milli: extra }]
            : [];
        })
      : [];

  const posting = await postMovements(
    tx,
    actor,
    {
      documentType: DELIVERY_DOCUMENT_TYPE,
      documentId: note.id,
      documentCode: note.code,
      businessDate: today,
      lines: movementsOf(
        note,
        locked.type,
        `Xuất ${locked.code} · đợt ${note.batchNo}`,
        lines,
        facts,
        content.lines,
      ),
    },
    today,
  );

  // Picks and sale prices go in while the note is still PICKING: the
  // trigger freezes every child row of a posted note.
  const pickRows = lines.flatMap((line) =>
    line.picks.map((pick) => ({
      lineId: line.lineId,
      condition: pick.condition,
      quantity: db3(pick.quantityMilli),
      weighedKg: pick.weighedMilli === null ? null : db3(pick.weighedMilli),
      piecesEstimated: pick.piecesEstimated,
    })),
  );
  if (pickRows.length > 0) await tx.insert(deliveryNotePick).values(pickRows);
  if (locked.type === "SALE") {
    const prices = new Map(
      terms.lines.map((line) => [
        lineKey(line.itemId, line.condition, line.pricingUnit),
        line.price,
      ]),
    );
    for (const line of content.lines) {
      await tx
        .update(deliveryNoteLine)
        .set({
          unitPrice:
            prices.get(
              lineKey(line.itemId, line.condition, line.pricingUnit),
            ) ?? 0,
        })
        .where(eq(deliveryNoteLine.id, line.id));
    }
  }
  await tx
    .update(deliveryNote)
    .set({
      status: "POSTED",
      clientDraftId: draftId,
      postingId: posting.postingId,
      businessDate: today,
      departedAt: readDepartedAt(body.departedAt),
      vehiclePlate: plate,
      contractRevisionId: terms.revisionId,
      postedBy: actor.id,
      postedAt: now,
      updatedAt: now,
    })
    .where(eq(deliveryNote.id, note.id));

  const contractStarted = locked.status === "APPROVED";
  if (contractStarted) {
    const next = contractTransition(
      { status: locked.status, hasDeliveries: false },
      "START",
    );
    await tx
      .update(contract)
      .set({ status: next, updatedAt: now })
      .where(eq(contract.id, locked.id));
  }
  await logActivity(
    tx,
    actor,
    {
      action: "POST",
      document: { type: DELIVERY_DOCUMENT_TYPE, id: note.id, code: note.code },
      summary: postedSummary({
        delivered: lines
          .filter((line) => line.picks.length > 0)
          .map((line) => named(line, facts, content.lines, pickedMilli(line))),
        short: shortages.map((row) => {
          const line = lines.find(
            (entry) => entry.lineId === row.lineId,
          ) as PickLine;
          return named(line, facts, content.lines, row.leftMilli);
        }),
        over,
        contractStarted,
      }),
      anomaly: over.length > 0,
    },
    { now },
  );
  return {
    code: note.code,
    businessDate: today,
    contractStarted,
    replayed: false,
  };
}

function readDepartedAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** "Xác nhận xe rời bãi": the note by id or code (spec deliveries). */
export function postDelivery(
  db: Database,
  actor: ContractActor,
  noteRef: string,
  body: PostDeliveryBody,
  options: PostOptions = {},
): Promise<ServiceResult<PostedDelivery>> {
  return run(async () => {
    if (!isUuid(body.clientDraftId)) {
      throw field(POST_MESSAGES.draftId, "clientDraftId");
    }
    const draftId = body.clientDraftId;
    const replay = await replayOf(db, actor, draftId);
    if (replay) return ok(replay);
    const now = options.now ?? new Date();
    try {
      const posted = await db.transaction((tx) =>
        postInTransaction(tx, actor, noteRef, body, draftId, now),
      );
      return ok(posted);
    } catch (error: unknown) {
      // Two sends of one draft raced past the locks: the loser reads what
      // the winner wrote.
      if (!isUniqueViolation(error)) throw error;
      const again = await replayOf(db, actor, draftId);
      if (!again) throw error;
      return ok(again);
    }
  });
}
