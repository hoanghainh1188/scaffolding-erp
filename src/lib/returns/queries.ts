// Reading return notes (returns-and-compensation design D8, D11, D12): the
// M4 contract list and contract (no money), the D6 timeline rows, the desktop
// detail with the value lost, and the M1 / M7 lists. Photos are listed by id;
// their bytes are read only by the photo route.
import { and, asc, desc, eq, ilike, inArray, lt, or } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  compensationNote,
  compensationNoteLine,
  contract,
  customer,
  inventoryLedger,
  item,
  location,
  returnNote,
  returnNoteLine,
  returnPhoto,
  site,
  user,
} from "@/db/schema";
import { toBusinessDate, type BusinessDate } from "@/domain/business-date";
import {
  compensationTotal,
  type CompensationKind,
  type CompensationStatus,
} from "@/domain/compensation";
import { can, canContract } from "@/domain/permissions";
import type { QuantityUnit, UnitAmount } from "@/domain/quantity";
import { sumByUnit } from "@/domain/quantity";
import { returnValueSummary } from "@/domain/return-note";
import { returnedText } from "@/domain/return-summary";
import { notFound, ok, type ServiceResult } from "@/lib/catalog/common";
import { forbidden, type ContractActor } from "@/lib/contracts/common";
import { waitingExchanges } from "@/lib/exchanges/records";
import {
  isUuid,
  milliOf,
  RETURN_DOCUMENT_TYPE,
  siteMovements,
} from "@/lib/deliveries/records";

type Reader = Pick<Database, "select" | "selectDistinct">;
type ReadingActor = Pick<ContractActor, "role" | "contractScope">;

/** Reads return notes on the desktop (rental contracts) or on the phone. */
export function canReadReturns(actor: ReadingActor): boolean {
  return (
    canContract(actor, "RENTAL", "view") || can(actor.role, "returns.receive")
  );
}

const onSiteTotals = async (db: Reader, contractId: string) => {
  const sums = new Map<string, number>();
  for (const row of await siteMovements(db, contractId)) {
    sums.set(row.itemId, (sums.get(row.itemId) ?? 0) + row.milli);
  }
  return sums;
};

async function unitsOf(
  db: Reader,
  ids: readonly string[],
): Promise<Map<string, { code: string; name: string; unit: QuantityUnit }>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: item.id, code: item.code, name: item.name, unit: item.unit })
    .from(item)
    .where(inArray(item.id, [...new Set(ids)]));
  return new Map(
    rows.map((row) => [
      row.id,
      { code: row.code, name: row.name, unit: row.unit as QuantityUnit },
    ]),
  );
}

export interface ReturnContractRow {
  contractId: string;
  contractCode: string;
  siteName: string;
  customerName: string;
  onSite: UnitAmount[];
}

/** M4 step 1: active rentals that still have goods at their site. */
export async function returnContracts(
  db: Reader,
  query: string | undefined,
): Promise<ReturnContractRow[]> {
  const text = query?.trim();
  const rows = await db
    .select({
      id: contract.id,
      code: contract.code,
      siteName: site.name,
      customerName: customer.name,
    })
    .from(contract)
    .innerJoin(site, eq(site.id, contract.siteId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .where(
      and(
        eq(contract.type, "RENTAL"),
        eq(contract.status, "ACTIVE"),
        text
          ? or(
              ilike(site.name, `%${text}%`),
              ilike(customer.name, `%${text}%`),
              ilike(contract.code, `%${text}%`),
            )
          : undefined,
      ),
    )
    .orderBy(asc(site.name));
  const result: ReturnContractRow[] = [];
  for (const row of rows) {
    const totals = await onSiteTotals(db, row.id);
    const items = await unitsOf(db, [...totals.keys()]);
    const onSite = sumByUnit(
      [...totals].flatMap(([itemId, milli]) =>
        milli > 0 ? [{ unit: items.get(itemId)?.unit ?? "PIECE", milli }] : [],
      ),
    );
    if (onSite.length === 0) continue;
    result.push({
      contractId: row.id,
      contractCode: row.code,
      siteName: row.siteName,
      customerName: row.customerName,
      onSite,
    });
  }
  return result;
}

export interface ReturnContract {
  contractId: string;
  contractCode: string;
  siteName: string;
  customerName: string;
  yards: { id: string; code: string; name: string }[];
  /** Waiting exchanges of the contract (site-operations D6), no price. */
  exchanges: {
    id: string;
    deliveryCode: string;
    expected: {
      itemId: string;
      code: string;
      unit: QuantityUnit;
      milli: number;
    }[];
  }[];
  items: {
    itemId: string;
    code: string;
    name: string;
    unit: QuantityUnit;
    onSiteMilli: number;
  }[];
}

/** M4 step 2: what is at the site of one contract, without any price. */
export async function returnContract(
  db: Reader,
  contractId: string,
): Promise<ServiceResult<ReturnContract>> {
  if (!isUuid(contractId)) return notFound();
  const [head] = await db
    .select({
      id: contract.id,
      code: contract.code,
      type: contract.type,
      status: contract.status,
      siteName: site.name,
      customerName: customer.name,
    })
    .from(contract)
    .innerJoin(site, eq(site.id, contract.siteId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .where(eq(contract.id, contractId));
  if (!head || head.type !== "RENTAL" || head.status !== "ACTIVE") {
    return notFound();
  }
  const totals = await onSiteTotals(db, head.id);
  const facts = await unitsOf(db, [...totals.keys()]);
  const yards = await db
    .select({ id: location.id, code: location.code, name: location.name })
    .from(location)
    .where(and(eq(location.type, "YARD"), eq(location.status, "ACTIVE")))
    .orderBy(asc(location.code));
  const waiting = await waitingExchanges(db, head.id);
  const expectedFacts = await unitsOf(
    db,
    waiting.flatMap((row) => row.expected.map((line) => line.itemId)),
  );
  return ok({
    contractId: head.id,
    contractCode: head.code,
    siteName: head.siteName,
    customerName: head.customerName,
    yards,
    exchanges: waiting.map((row) => ({
      id: row.id,
      deliveryCode: row.deliveryCode,
      expected: row.expected.map((line) => ({
        itemId: line.itemId,
        code: expectedFacts.get(line.itemId)?.code ?? "",
        unit: expectedFacts.get(line.itemId)?.unit ?? "PIECE",
        milli: line.milli,
      })),
    })),
    items: [...totals]
      .filter(([, milli]) => milli > 0)
      .map(([itemId, milli]) => {
        const info = facts.get(itemId);
        return {
          itemId,
          code: info?.code ?? "",
          name: info?.name ?? "",
          unit: info?.unit ?? "PIECE",
          onSiteMilli: milli,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code, "vi")),
  });
}

interface LineRow {
  itemId: string;
  good: string;
  repair: string;
  scrap: string;
  lost: string;
}

export interface ReturnLineView {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  goodMilli: number;
  repairMilli: number;
  scrapMilli: number;
  lostMilli: number;
}

async function linesOf(db: Reader, noteIds: readonly string[]) {
  if (noteIds.length === 0) return new Map<string, ReturnLineView[]>();
  const rows = await db
    .select({
      noteId: returnNoteLine.noteId,
      lineNo: returnNoteLine.lineNo,
      itemId: returnNoteLine.itemId,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      good: returnNoteLine.goodQuantity,
      repair: returnNoteLine.repairQuantity,
      scrap: returnNoteLine.scrapQuantity,
      lost: returnNoteLine.lostQuantity,
    })
    .from(returnNoteLine)
    .innerJoin(item, eq(item.id, returnNoteLine.itemId))
    .where(inArray(returnNoteLine.noteId, [...noteIds]))
    .orderBy(asc(returnNoteLine.lineNo));
  const byNote = new Map<string, ReturnLineView[]>();
  for (const row of rows) {
    const view: ReturnLineView = {
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unit: row.unit as QuantityUnit,
      ...milliCounts(row),
    };
    byNote.set(row.noteId, [...(byNote.get(row.noteId) ?? []), view]);
  }
  return byNote;
}

function milliCounts(row: Pick<LineRow, "good" | "repair" | "scrap" | "lost">) {
  return {
    goodMilli: milliOf(row.good),
    repairMilli: milliOf(row.repair),
    scrapMilli: milliOf(row.scrap),
    lostMilli: milliOf(row.lost),
  };
}

/** "trả 100 cái, mất 2 cái" of a note's lines. */
export function linesText(lines: readonly ReturnLineView[]): string {
  const returned = sumByUnit(
    lines.map((line) => ({
      unit: line.unit,
      milli: line.goodMilli + line.repairMilli + line.scrapMilli,
    })),
  ).filter((row) => row.milli > 0);
  const lost = sumByUnit(
    lines.map((line) => ({ unit: line.unit, milli: line.lostMilli })),
  ).filter((row) => row.milli > 0);
  return returnedText(returned, lost);
}

interface CompensationHead {
  id: string;
  code: string;
  status: CompensationStatus;
  /** Sum of the priced lines, or the amount due once approved. */
  amount: number;
}

async function compensationsOf(
  db: Reader,
  returnIds: readonly string[],
): Promise<Map<string, CompensationHead>> {
  if (returnIds.length === 0) return new Map();
  const notes = await db
    .select({
      id: compensationNote.id,
      code: compensationNote.code,
      status: compensationNote.status,
      returnNoteId: compensationNote.returnNoteId,
      amountDue: compensationNote.amountDue,
    })
    .from(compensationNote)
    .where(inArray(compensationNote.returnNoteId, [...returnIds]));
  const lines = notes.length
    ? await db
        .select({
          noteId: compensationNoteLine.noteId,
          kind: compensationNoteLine.kind,
          quantity: compensationNoteLine.quantity,
          unitPrice: compensationNoteLine.unitPrice,
        })
        .from(compensationNoteLine)
        .where(
          inArray(
            compensationNoteLine.noteId,
            notes.map((note) => note.id),
          ),
        )
    : [];
  return new Map(
    notes.map((note) => [
      note.returnNoteId,
      {
        id: note.id,
        code: note.code,
        status: note.status as CompensationStatus,
        amount:
          note.amountDue ??
          compensationTotal(
            lines
              .filter((line) => line.noteId === note.id)
              .map((line) => ({
                itemCode: "",
                kind: line.kind as CompensationKind,
                quantityMilli: milliOf(line.quantity),
                unitPrice: line.unitPrice,
              })),
          ),
      },
    ]),
  );
}

const vnDate = (at: Date | null) => (at ? toBusinessDate(at) : null);

export interface ReturnTimelineEntry {
  id: string;
  code: string;
  businessDate: BusinessDate;
  /** "trả 100 cái, mất 2 cái". */
  text: string;
  /** When the phone saved it, if another day than the return date. */
  phoneDifferentDay: Date | null;
  compensation: { code: string; status: CompensationStatus } | null;
}

/** D6: the return notes of a contract, latest first. */
export async function contractReturns(
  db: Reader,
  contractId: string,
): Promise<ReturnTimelineEntry[]> {
  const notes = await db
    .select({
      id: returnNote.id,
      code: returnNote.code,
      businessDate: returnNote.businessDate,
      savedOnDeviceAt: returnNote.savedOnDeviceAt,
    })
    .from(returnNote)
    .where(eq(returnNote.contractId, contractId))
    .orderBy(desc(returnNote.businessDate), desc(returnNote.code));
  const ids = notes.map((note) => note.id);
  const lines = await linesOf(db, ids);
  const made = await compensationsOf(db, ids);
  return notes.map((note) => {
    const phone = vnDate(note.savedOnDeviceAt);
    const compensation = made.get(note.id);
    return {
      id: note.id,
      code: note.code,
      businessDate: note.businessDate as BusinessDate,
      text: linesText(lines.get(note.id) ?? []),
      phoneDifferentDay:
        phone !== null && phone !== note.businessDate
          ? note.savedOnDeviceAt
          : null,
      compensation: compensation
        ? { code: compensation.code, status: compensation.status }
        : null,
    };
  });
}

export interface ReturnDetail {
  id: string;
  code: string;
  contract: { id: string; code: string };
  siteName: string;
  customerName: string;
  yard: { code: string; name: string };
  businessDate: BusinessDate;
  savedOnDeviceAt: Date | null;
  postedAt: Date;
  postedByName: string;
  vehiclePlate: string | null;
  note: string | null;
  lines: ReturnLineView[];
  photos: { id: string; caption: string | null }[];
  /** Desktop only: never sent to the phone (spec "M4 không hiện giá"). */
  values: { conditionLoss: number; lostValue: number } | null;
  /** Desktop only, like the values. */
  compensation: CompensationHead | null;
}

/** One return note by code; money only for those who read contracts. */
export async function returnDetail(
  db: Reader,
  actor: ReadingActor,
  code: string,
  options: { withValues: boolean },
): Promise<ServiceResult<ReturnDetail>> {
  if (!canReadReturns(actor)) return forbidden();
  const desktop = canContract(actor, "RENTAL", "view");
  if (options.withValues && !desktop) return forbidden();
  const [row] = await db
    .select({
      id: returnNote.id,
      code: returnNote.code,
      contractId: contract.id,
      contractCode: contract.code,
      siteName: site.name,
      customerName: customer.name,
      yardCode: location.code,
      yardName: location.name,
      businessDate: returnNote.businessDate,
      savedOnDeviceAt: returnNote.savedOnDeviceAt,
      postedAt: returnNote.postedAt,
      postedByName: user.name,
      vehiclePlate: returnNote.vehiclePlate,
      note: returnNote.note,
    })
    .from(returnNote)
    .innerJoin(contract, eq(contract.id, returnNote.contractId))
    .innerJoin(customer, eq(customer.id, contract.customerId))
    .innerJoin(location, eq(location.id, returnNote.yardLocationId))
    .innerJoin(user, eq(user.id, returnNote.postedBy))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(eq(returnNote.code, code));
  if (!row) return notFound();
  const lines = (await linesOf(db, [row.id])).get(row.id) ?? [];
  const photos = await db
    .select({ id: returnPhoto.id, caption: returnPhoto.caption })
    .from(returnPhoto)
    .where(eq(returnPhoto.returnNoteId, row.id))
    .orderBy(asc(returnPhoto.position));
  let values: ReturnDetail["values"] = null;
  if (options.withValues) {
    const posted = await db
      .select({
        movement: inventoryLedger.movement,
        amount: inventoryLedger.amount,
      })
      .from(inventoryLedger)
      .where(
        and(
          eq(inventoryLedger.documentType, RETURN_DOCUMENT_TYPE),
          eq(inventoryLedger.documentId, row.id),
        ),
      );
    values = returnValueSummary(posted);
  }
  const compensation = (await compensationsOf(db, [row.id])).get(row.id);
  return ok({
    id: row.id,
    code: row.code,
    contract: { id: row.contractId, code: row.contractCode },
    siteName: row.siteName ?? "",
    customerName: row.customerName,
    yard: { code: row.yardCode, name: row.yardName },
    businessDate: row.businessDate as BusinessDate,
    savedOnDeviceAt: row.savedOnDeviceAt,
    postedAt: row.postedAt,
    postedByName: row.postedByName,
    vehiclePlate: row.vehiclePlate,
    note: row.note,
    lines,
    photos,
    values,
    compensation: compensation && desktop ? compensation : null,
  });
}

export interface ReturnListRow {
  code: string;
  siteName: string;
  text: string;
  postedAt: Date;
}

export interface ReturnsByDay {
  days: { date: BusinessDate; notes: ReturnListRow[] }[];
  hasMore: boolean;
}

/** M7 (and M1 with `only`): posted return notes of the latest days. */
export async function returnsByDay(
  db: Reader,
  options: { before?: BusinessDate; days?: number; only?: BusinessDate } = {},
): Promise<ReturnsByDay> {
  const count = options.days ?? 2;
  const dates = options.only
    ? [{ date: options.only }]
    : await db
        .selectDistinct({ date: returnNote.businessDate })
        .from(returnNote)
        .where(
          options.before
            ? lt(returnNote.businessDate, options.before)
            : undefined,
        )
        .orderBy(desc(returnNote.businessDate))
        .limit(count + 1);
  const shown = dates.slice(0, count).map((row) => row.date);
  if (shown.length === 0) return { days: [], hasMore: false };
  const rows = await db
    .select({
      id: returnNote.id,
      code: returnNote.code,
      date: returnNote.businessDate,
      postedAt: returnNote.postedAt,
      siteName: site.name,
    })
    .from(returnNote)
    .innerJoin(contract, eq(contract.id, returnNote.contractId))
    .leftJoin(site, eq(site.id, contract.siteId))
    .where(inArray(returnNote.businessDate, shown))
    .orderBy(desc(returnNote.businessDate), desc(returnNote.postedAt));
  const lines = await linesOf(
    db,
    rows.map((row) => row.id),
  );
  return {
    days: shown.map((date) => ({
      date: date as BusinessDate,
      notes: rows
        .filter((row) => row.date === date)
        .map((row) => ({
          code: row.code,
          siteName: row.siteName ?? "",
          text: linesText(lines.get(row.id) ?? []),
          postedAt: row.postedAt,
        })),
    })),
    hasMore: !options.only && dates.length > count,
  };
}
