// What a revision holds (contracts design D2, D9): terms, kits, lines,
// compensation prices, deposits and the delivery plan. Checking a body
// against the catalog (held FOR SHARE), writing a draft revision's rows
// (delete + insert), reading them back, and the shape amendments compare.
import { asc, eq, inArray } from "drizzle-orm";

import {
  contractCompensation,
  contractDeliveryBatch,
  contractDeliveryBatchLine,
  contractDeposit,
  contractKit,
  contractLine,
  item,
  kit,
  kitComponent,
} from "@/db/schema";
import { isBusinessDate } from "@/domain/business-date";
import type { ContractType } from "@/domain/contract";
import {
  byWeight,
  checkPrice,
  checkSaleLine,
  explodeKits,
  LINE_MESSAGES,
  PRICING_UNITS,
  vatRate,
  type PricingUnit,
} from "@/domain/contract-lines";
import type { ContentBatch, RevisionContent } from "@/domain/contract-revision";
import {
  hasStandardWeight,
  parseQuantity,
  quantityFromDb,
  quantityToDb,
  toQuantity,
  formatQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { DEFAULT_MIN_RENTAL_DAYS } from "@/domain/rental";
import { optionalText } from "@/lib/catalog/common";

import { ContractFieldError, type Tx } from "./common";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LINES = 200;
const MAX_KITS = 50;
const MAX_DEPOSITS = 10;
const MAX_BATCHES = 20;

export const CONTENT_MESSAGES = {
  item: "Chọn mã hàng",
  kit: "Chọn bộ",
  itemArchived: (code: string) => `Mã ${code} đã ngừng dùng.`,
  kitArchived: (code: string) => `Bộ ${code} đã ngừng dùng.`,
  kitOnSale: "Hợp đồng bán chọn từng mã hàng, không chọn theo bộ.",
  tooMany: (max: number, what: string) => `Tối đa ${max} ${what}.`,
  startDate: "Nhập ngày bắt đầu.",
  date: "Ngày không hợp lệ (dd/mm/yyyy).",
  endBeforeStart: "Ngày kết thúc phải sau ngày bắt đầu.",
  minDays: "Thuê tối thiểu từ 1 đến 365 ngày.",
  paymentTerms: "Hạn thanh toán từ 0 đến 365 ngày.",
  noteTooLong: "Ghi chú dài tối đa 1000 ký tự.",
  depositAmount: "Số tiền cọc phải lớn hơn 0 ₫.",
  depositMethod: "Chọn hình thức cọc (tiền mặt hoặc chuyển khoản).",
  guarantee: "Bảo lãnh cần ngân hàng, số chứng thư, giá trị và ngày hết hạn.",
  depositKind: "Chọn loại cọc (cọc tiền hoặc bảo lãnh).",
  batchItem: (code: string) =>
    `Mã ${code} chưa có trên hợp đồng. Bạn thêm dòng hàng trước.`,
  batchKit: (code: string) =>
    `Bộ ${code} chưa có trên hợp đồng. Bạn thêm bộ trước.`,
  batchLine: "Mỗi dòng của đợt giao chọn một bộ hoặc một mã hàng.",
  batchNoteTooLong: "Ghi chú đợt giao dài tối đa 200 ký tự.",
  quantity: "Số lượng không hợp lệ",
} as const;

const field = (message: string, name: string) =>
  new ContractFieldError(message, name);

// ----------------------------------------------------------- bodies

export interface TermsBody {
  signedDate?: string | null;
  startDate?: string;
  endDate?: string | null;
  minRentalDays?: number | null;
  paymentTermsDays?: number;
  vatEnabled?: boolean;
  vatRate?: string | null;
  companyTruck?: boolean;
  freightPerTrip?: number | null;
  note?: string | null;
}

export interface LineBody {
  itemId?: string;
  condition?: string | null;
  pricingUnit?: string;
  /** Rental: pieces added outside kits ("0" for kit-only); sale: quantity. */
  quantity?: string;
  /** Omitted: keep the saved price, else the catalog one. */
  price?: number | null;
}

export interface ContentBody {
  kits?: { kitId?: string; quantity?: number }[];
  lines?: LineBody[];
  compensations?: {
    itemId?: string;
    lostPrice?: number | null;
    damagePrice?: number | null;
  }[];
  /** "Lấy lại bảng chung": copy the catalog prices again. */
  refreshCompensation?: boolean;
  deposits?: {
    kind?: string;
    amount?: number;
    method?: string | null;
    bankName?: string | null;
    guaranteeNumber?: string | null;
    expiryDate?: string | null;
  }[];
  batches?: {
    plannedDate?: string;
    note?: string | null;
    lines?: {
      kitId?: string | null;
      itemId?: string | null;
      quantity?: string;
    }[];
  }[];
}

// ----------------------------------------------------------- stored rows

export interface Terms {
  signedDate: string | null;
  startDate: string;
  endDate: string | null;
  minRentalDays: number | null;
  billingCycle: string | null;
  paymentTermsDays: number;
  vatEnabled: boolean;
  vatRate: string | null;
  companyTruck: boolean;
  freightPerTrip: number | null;
  note: string | null;
}

export interface StoredLine {
  itemId: string;
  condition: string | null;
  pricingUnit: string;
  ownQuantity: string;
  quantity: string;
  price: number | null;
  catalogPrice: number | null;
}

export interface StoredCompensation {
  itemId: string;
  lostPrice: number | null;
  damagePrice: number | null;
  catalogLostPrice: number | null;
  catalogDamagePrice: number | null;
}

export interface StoredDeposit {
  kind: string;
  amount: number;
  method: string | null;
  bankName: string | null;
  guaranteeNumber: string | null;
  expiryDate: string | null;
}

export interface StoredBatch {
  plannedDate: string;
  note: string | null;
  lines: { kitId: string | null; itemId: string | null; quantity: string }[];
}

export interface StoredContent {
  kits: { kitId: string; quantity: number }[];
  lines: StoredLine[];
  compensations: StoredCompensation[];
  deposits: StoredDeposit[];
  batches: StoredBatch[];
}

export const EMPTY_CONTENT: StoredContent = {
  kits: [],
  lines: [],
  compensations: [],
  deposits: [],
  batches: [],
};

// ----------------------------------------------------------- terms

function dateOrNull(value: string | null | undefined, name: string) {
  const text = optionalText(value);
  if (text !== null && !isBusinessDate(text)) {
    throw field(CONTENT_MESSAGES.date, name);
  }
  return text;
}

function wholeIn(
  value: number,
  min: number,
  max: number,
  message: string,
  name: string,
) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw field(message, name);
  }
  return value;
}

/**
 * The terms of a body (contracts spec "Điều khoản hợp đồng", "VAT"):
 * missing payment terms take the customer's default, a rental's minimum
 * takes DEFAULT_MIN_RENTAL_DAYS.
 */
export function checkTerms(
  type: ContractType,
  body: TermsBody,
  defaults: { paymentTermsDays: number },
): Terms {
  const startDate = dateOrNull(body.startDate, "startDate");
  if (startDate === null) throw field(CONTENT_MESSAGES.startDate, "startDate");
  const endDate =
    type === "RENTAL" ? dateOrNull(body.endDate, "endDate") : null;
  if (endDate !== null && endDate <= startDate) {
    throw field(CONTENT_MESSAGES.endBeforeStart, "endDate");
  }
  const minRentalDays =
    type === "RENTAL"
      ? wholeIn(
          body.minRentalDays ?? DEFAULT_MIN_RENTAL_DAYS,
          1,
          365,
          CONTENT_MESSAGES.minDays,
          "minRentalDays",
        )
      : null;
  const paymentTermsDays = wholeIn(
    body.paymentTermsDays ?? defaults.paymentTermsDays,
    0,
    365,
    CONTENT_MESSAGES.paymentTerms,
    "paymentTermsDays",
  );
  let rate: string | null;
  try {
    rate = vatRate(body.vatEnabled ?? false, body.vatRate);
  } catch (error: unknown) {
    throw field((error as Error).message, "vatRate");
  }
  const companyTruck = body.companyTruck ?? false;
  let freight: number | null = null;
  if (companyTruck) {
    try {
      freight = checkPrice(body.freightPerTrip);
    } catch (error: unknown) {
      throw field((error as Error).message, "freightPerTrip");
    }
  }
  const note = optionalText(body.note);
  if (note && note.length > 1000) {
    throw field(CONTENT_MESSAGES.noteTooLong, "note");
  }
  return {
    signedDate: dateOrNull(body.signedDate, "signedDate"),
    startDate,
    endDate,
    minRentalDays,
    billingCycle: type === "RENTAL" ? "MONTH_END" : null,
    paymentTermsDays,
    vatEnabled: body.vatEnabled ?? false,
    vatRate: rate,
    companyTruck,
    freightPerTrip: freight,
    note,
  };
}

// ----------------------------------------------------------- catalog

interface ItemInfo {
  id: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  status: string;
  dailyRentalPrice: number | null;
  lostPrice: number | null;
  damagePrice: number | null;
}

/** Items FOR SHARE in id order (the order postings use: no deadlock). */
async function lockItems(tx: Tx, ids: readonly string[]) {
  const unique = [...new Set(ids)].sort();
  const rows = unique.length
    ? await tx
        .select({
          id: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
          status: item.status,
          dailyRentalPrice: item.dailyRentalPrice,
          lostPrice: item.lostPrice,
          damagePrice: item.damagePrice,
        })
        .from(item)
        .where(inArray(item.id, unique))
        .orderBy(asc(item.id))
        .for("share")
    : [];
  return new Map(
    rows.map((row) => [row.id, { ...row, unit: row.unit as QuantityUnit }]),
  );
}

async function lockKits(tx: Tx, ids: readonly string[]) {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return new Map<string, KitInfo>();
  const rows = await tx
    .select({ id: kit.id, code: kit.code, status: kit.status })
    .from(kit)
    .where(inArray(kit.id, unique))
    .orderBy(asc(kit.id))
    .for("share");
  const parts = await tx
    .select({
      kitId: kitComponent.kitId,
      itemId: kitComponent.itemId,
      quantity: kitComponent.quantity,
    })
    .from(kitComponent)
    .where(inArray(kitComponent.kitId, unique));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        components: parts
          .filter((part) => part.kitId === row.id)
          .map((part) => ({ itemId: part.itemId, quantity: part.quantity })),
      },
    ]),
  );
}

interface KitInfo {
  id: string;
  code: string;
  status: string;
  components: { itemId: string; quantity: number }[];
}

function uuidOf(
  value: string | null | undefined,
  message: string,
  name: string,
) {
  if (!value || !UUID.test(value)) throw field(message, name);
  return value;
}

function quantityOf(
  text: string | undefined,
  unit: QuantityUnit,
  name: string,
) {
  try {
    return parseQuantity(text ?? "", unit).milli;
  } catch (error: unknown) {
    throw field((error as Error).message || CONTENT_MESSAGES.quantity, name);
  }
}

function priceOf(value: number | null | undefined, name: string) {
  try {
    return checkPrice(value);
  } catch (error: unknown) {
    throw field((error as Error).message, name);
  }
}

const lineKeyOf = (line: {
  itemId: string;
  condition: string | null;
  pricingUnit: string;
}) => `${line.itemId}|${line.condition ?? ""}|${line.pricingUnit}`;

// ----------------------------------------------------------- content

/**
 * The rows a draft revision will hold, from a body. `previous` is what the
 * revision held before (or the copy an amendment starts from): it keeps
 * prices not sent again and the catalog values saved with them.
 */
export async function checkContent(
  tx: Tx,
  type: ContractType,
  body: ContentBody,
  previous: StoredContent,
): Promise<StoredContent> {
  const rawKits = body.kits ?? [];
  const rawLines = body.lines ?? [];
  const rawDeposits = body.deposits ?? [];
  const rawBatches = body.batches ?? [];
  if (rawKits.length > MAX_KITS) {
    throw field(CONTENT_MESSAGES.tooMany(MAX_KITS, "bộ"), "kits");
  }
  if (rawLines.length > MAX_LINES) {
    throw field(CONTENT_MESSAGES.tooMany(MAX_LINES, "dòng hàng"), "lines");
  }
  if (rawDeposits.length > MAX_DEPOSITS) {
    throw field(
      CONTENT_MESSAGES.tooMany(MAX_DEPOSITS, "khoản cọc"),
      "deposits",
    );
  }
  if (rawBatches.length > MAX_BATCHES) {
    throw field(CONTENT_MESSAGES.tooMany(MAX_BATCHES, "đợt giao"), "batches");
  }
  if (type === "SALE" && rawKits.length > 0) {
    throw field(CONTENT_MESSAGES.kitOnSale, "kits");
  }

  const kitIds = rawKits.map((entry, index) =>
    uuidOf(entry.kitId, CONTENT_MESSAGES.kit, `kits.${index}.kitId`),
  );
  const kits = await lockKits(tx, kitIds);
  const lineIds = rawLines.map((entry, index) =>
    uuidOf(entry.itemId, CONTENT_MESSAGES.item, `lines.${index}.itemId`),
  );
  const partIds = [...kits.values()].flatMap((entry) =>
    entry.components.map((part) => part.itemId),
  );
  const items = await lockItems(tx, [...lineIds, ...partIds]);

  rawKits.forEach((entry, index) => {
    const found = kits.get(entry.kitId ?? "");
    if (!found) throw field(CONTENT_MESSAGES.kit, `kits.${index}.kitId`);
    if (found.status !== "ACTIVE") {
      throw field(
        CONTENT_MESSAGES.kitArchived(found.code),
        `kits.${index}.kitId`,
      );
    }
  });
  const itemOf = (id: string, name: string): ItemInfo => {
    const found = items.get(id);
    if (!found) throw field(CONTENT_MESSAGES.item, name);
    if (found.status !== "ACTIVE") {
      throw field(CONTENT_MESSAGES.itemArchived(found.code), name);
    }
    return found;
  };

  const previousLines = new Map(
    previous.lines.map((line) => [lineKeyOf(line), line]),
  );
  let lines: StoredLine[];
  if (type === "RENTAL") {
    const own = rawLines.map((entry, index) => {
      const found = itemOf(entry.itemId ?? "", `lines.${index}.itemId`);
      return {
        itemId: found.id,
        itemCode: found.code,
        ownMilli: quantityOf(
          entry.quantity,
          found.unit,
          `lines.${index}.quantity`,
        ),
      };
    });
    const picks = rawKits.map((entry) => {
      const found = kits.get(entry.kitId ?? "")!;
      return {
        kitId: found.id,
        quantity: entry.quantity ?? 0,
        components: found.components,
      };
    });
    let exploded;
    try {
      exploded = explodeKits(picks, own);
    } catch (error: unknown) {
      throw field((error as Error).message, "lines");
    }
    const bodyLines = new Map(
      rawLines.map((entry) => [entry.itemId ?? "", entry]),
    );
    lines = exploded.map((entry) => {
      const found = itemOf(entry.itemId, "lines");
      const key = lineKeyOf({
        itemId: entry.itemId,
        condition: null,
        pricingUnit: "ITEM",
      });
      const old = previousLines.get(key);
      const sent = bodyLines.get(entry.itemId);
      const index = rawLines.findIndex((line) => line.itemId === entry.itemId);
      const price =
        sent && sent.price !== undefined
          ? priceOf(sent.price, `lines.${index}.price`)
          : (old?.price ?? found.dailyRentalPrice);
      return {
        itemId: entry.itemId,
        condition: null,
        pricingUnit: "ITEM",
        ownQuantity: quantityToDb(toQuantity(entry.ownMilli, found.unit)),
        quantity: quantityToDb(toQuantity(entry.quantityMilli, found.unit)),
        price,
        catalogPrice: old ? old.catalogPrice : found.dailyRentalPrice,
      };
    });
  } else {
    const seen = new Set<string>();
    lines = rawLines.map((entry, index) => {
      const name = `lines.${index}`;
      const found = itemOf(entry.itemId ?? "", `${name}.itemId`);
      const pricingUnit = (PRICING_UNITS as readonly string[]).includes(
        entry.pricingUnit ?? "ITEM",
      )
        ? ((entry.pricingUnit ?? "ITEM") as PricingUnit)
        : "ITEM";
      let condition: string;
      try {
        condition = checkSaleLine({
          itemCode: found.code,
          itemByKg: !hasStandardWeight(found.unit),
          hasStandardWeight: hasStandardWeight(found.unit),
          condition: entry.condition ?? null,
          pricingUnit,
        });
      } catch (error: unknown) {
        throw field((error as Error).message, `${name}.condition`);
      }
      const key = lineKeyOf({ itemId: found.id, condition, pricingUnit });
      if (seen.has(key)) {
        throw field(LINE_MESSAGES.lineTwice(found.code), `${name}.itemId`);
      }
      seen.add(key);
      const kg: QuantityUnit = "KG";
      const unit = byWeight(pricingUnit) ? kg : found.unit;
      const milli = quantityOf(entry.quantity, unit, `${name}.quantity`);
      if (milli <= 0) throw field(LINE_MESSAGES.quantity, `${name}.quantity`);
      const old = previousLines.get(key);
      const quantity = quantityToDb(toQuantity(milli, unit));
      return {
        itemId: found.id,
        condition,
        pricingUnit,
        ownQuantity: quantity,
        quantity,
        price:
          entry.price !== undefined
            ? priceOf(entry.price, `${name}.price`)
            : (old?.price ?? null),
        catalogPrice: null,
      };
    });
  }

  const compensations =
    type === "RENTAL" ? compensationRows(lines, items, body, previous) : [];
  const deposits = rawDeposits.map(checkDeposit);
  const batches = checkBatches(rawBatches, lines, rawKits, kits, items);
  return {
    kits: rawKits.map((entry) => ({
      kitId: entry.kitId ?? "",
      quantity: entry.quantity ?? 0,
    })),
    lines,
    compensations,
    deposits,
    batches,
  };
}

/** Compensation of every rental item: sent, kept, or copied (0.2 #49). */
function compensationRows(
  lines: readonly StoredLine[],
  items: ReadonlyMap<string, ItemInfo>,
  body: ContentBody,
  previous: StoredContent,
): StoredCompensation[] {
  const sent = new Map(
    (body.compensations ?? []).map((entry) => [entry.itemId ?? "", entry]),
  );
  const kept = new Map(
    previous.compensations.map((entry) => [entry.itemId, entry]),
  );
  return lines.map((line) => {
    const found = items.get(line.itemId)!;
    const fromCatalog = {
      itemId: line.itemId,
      lostPrice: found.lostPrice,
      damagePrice: found.damagePrice,
      catalogLostPrice: found.lostPrice,
      catalogDamagePrice: found.damagePrice,
    };
    if (body.refreshCompensation) return fromCatalog;
    const old = kept.get(line.itemId);
    const entry = sent.get(line.itemId);
    const base = old ?? fromCatalog;
    if (!entry) return base;
    return {
      ...base,
      lostPrice:
        entry.lostPrice !== undefined
          ? priceOf(entry.lostPrice, `compensations.${line.itemId}.lostPrice`)
          : base.lostPrice,
      damagePrice:
        entry.damagePrice !== undefined
          ? priceOf(
              entry.damagePrice,
              `compensations.${line.itemId}.damagePrice`,
            )
          : base.damagePrice,
    };
  });
}

function checkDeposit(
  entry: NonNullable<ContentBody["deposits"]>[number],
  index: number,
): StoredDeposit {
  const name = `deposits.${index}`;
  const amount = entry.amount ?? 0;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw field(CONTENT_MESSAGES.depositAmount, `${name}.amount`);
  }
  if (entry.kind === "CASH") {
    if (entry.method !== "CASH" && entry.method !== "TRANSFER") {
      throw field(CONTENT_MESSAGES.depositMethod, `${name}.method`);
    }
    return {
      kind: "CASH",
      amount,
      method: entry.method,
      bankName: null,
      guaranteeNumber: null,
      expiryDate: null,
    };
  }
  if (entry.kind === "GUARANTEE") {
    const bankName = optionalText(entry.bankName);
    const guaranteeNumber = optionalText(entry.guaranteeNumber);
    const expiryDate = optionalText(entry.expiryDate);
    if (
      !bankName ||
      !guaranteeNumber ||
      !expiryDate ||
      !isBusinessDate(expiryDate) ||
      bankName.length > 100 ||
      guaranteeNumber.length > 50
    ) {
      throw field(CONTENT_MESSAGES.guarantee, name);
    }
    return {
      kind: "GUARANTEE",
      amount,
      method: null,
      bankName,
      guaranteeNumber,
      expiryDate,
    };
  }
  throw field(CONTENT_MESSAGES.depositKind, `${name}.kind`);
}

function checkBatches(
  raw: NonNullable<ContentBody["batches"]>,
  lines: readonly StoredLine[],
  rawKits: NonNullable<ContentBody["kits"]>,
  kits: ReadonlyMap<string, KitInfo>,
  items: ReadonlyMap<string, ItemInfo>,
): StoredBatch[] {
  const onContract = new Set(lines.map((line) => line.itemId));
  const kitsOnContract = new Set(rawKits.map((entry) => entry.kitId ?? ""));
  const batches = raw.map((batch, index) => {
    const name = `batches.${index}`;
    const plannedDate = optionalText(batch.plannedDate);
    if (!plannedDate || !isBusinessDate(plannedDate)) {
      throw field(CONTENT_MESSAGES.date, `${name}.plannedDate`);
    }
    const note = optionalText(batch.note);
    if (note && note.length > 200) {
      throw field(CONTENT_MESSAGES.batchNoteTooLong, `${name}.note`);
    }
    const batchLines = (batch.lines ?? []).map((entry, lineIndex) => {
      const at = `${name}.lines.${lineIndex}`;
      const kitId = optionalText(entry.kitId);
      const itemId = optionalText(entry.itemId);
      if ((kitId === null) === (itemId === null)) {
        throw field(CONTENT_MESSAGES.batchLine, at);
      }
      if (kitId !== null) {
        const found = kits.get(kitId);
        if (!found || !kitsOnContract.has(kitId)) {
          throw field(CONTENT_MESSAGES.batchKit(found?.code ?? kitId), at);
        }
        const milli = quantityOf(entry.quantity, "PIECE", `${at}.quantity`);
        if (milli <= 0) throw field(LINE_MESSAGES.quantity, `${at}.quantity`);
        return {
          kitId,
          itemId: null,
          quantity: quantityToDb(toQuantity(milli, "PIECE")),
        };
      }
      if (!onContract.has(itemId ?? "")) {
        throw field(
          CONTENT_MESSAGES.batchItem(items.get(itemId ?? "")?.code ?? "này"),
          at,
        );
      }
      const found = items.get(itemId ?? "")!;
      const milli = quantityOf(entry.quantity, found.unit, `${at}.quantity`);
      if (milli <= 0) throw field(LINE_MESSAGES.quantity, `${at}.quantity`);
      return {
        kitId: null,
        itemId,
        quantity: quantityToDb(toQuantity(milli, found.unit)),
      };
    });
    return { plannedDate, note, lines: batchLines };
  });
  return [...batches].sort((a, b) =>
    a.plannedDate.localeCompare(b.plannedDate),
  );
}

// ----------------------------------------------------------- storage

/** Replaces the rows of a draft revision (the trigger guards approved ones). */
export async function writeContent(
  tx: Tx,
  revisionId: string,
  content: StoredContent,
): Promise<void> {
  await tx.delete(contractKit).where(eq(contractKit.revisionId, revisionId));
  await tx.delete(contractLine).where(eq(contractLine.revisionId, revisionId));
  await tx
    .delete(contractCompensation)
    .where(eq(contractCompensation.revisionId, revisionId));
  await tx
    .delete(contractDeposit)
    .where(eq(contractDeposit.revisionId, revisionId));
  await tx
    .delete(contractDeliveryBatch)
    .where(eq(contractDeliveryBatch.revisionId, revisionId));
  if (content.kits.length) {
    await tx
      .insert(contractKit)
      .values(content.kits.map((entry) => ({ ...entry, revisionId })));
  }
  if (content.lines.length) {
    await tx.insert(contractLine).values(
      content.lines.map((line, index) => ({
        ...line,
        revisionId,
        lineNo: index + 1,
      })),
    );
  }
  if (content.compensations.length) {
    await tx
      .insert(contractCompensation)
      .values(content.compensations.map((entry) => ({ ...entry, revisionId })));
  }
  if (content.deposits.length) {
    await tx.insert(contractDeposit).values(
      content.deposits.map((entry, index) => ({
        ...entry,
        revisionId,
        lineNo: index + 1,
      })),
    );
  }
  for (const [index, batch] of content.batches.entries()) {
    const [row] = await tx
      .insert(contractDeliveryBatch)
      .values({
        revisionId,
        seq: index + 1,
        plannedDate: batch.plannedDate,
        note: batch.note,
      })
      .returning({ id: contractDeliveryBatch.id });
    if (row && batch.lines.length) {
      await tx
        .insert(contractDeliveryBatchLine)
        .values(batch.lines.map((line) => ({ ...line, batchId: row.id })));
    }
  }
}

type Reader = Pick<Tx, "select">;

/** The rows of a revision, in their saved order. */
export async function readContent(
  tx: Reader,
  revisionId: string,
): Promise<StoredContent> {
  const [kits, lines, compensations, deposits, batches] = await Promise.all([
    tx
      .select({ kitId: contractKit.kitId, quantity: contractKit.quantity })
      .from(contractKit)
      .where(eq(contractKit.revisionId, revisionId)),
    tx
      .select({
        itemId: contractLine.itemId,
        condition: contractLine.condition,
        pricingUnit: contractLine.pricingUnit,
        ownQuantity: contractLine.ownQuantity,
        quantity: contractLine.quantity,
        price: contractLine.price,
        catalogPrice: contractLine.catalogPrice,
      })
      .from(contractLine)
      .where(eq(contractLine.revisionId, revisionId))
      .orderBy(asc(contractLine.lineNo)),
    tx
      .select({
        itemId: contractCompensation.itemId,
        lostPrice: contractCompensation.lostPrice,
        damagePrice: contractCompensation.damagePrice,
        catalogLostPrice: contractCompensation.catalogLostPrice,
        catalogDamagePrice: contractCompensation.catalogDamagePrice,
      })
      .from(contractCompensation)
      .where(eq(contractCompensation.revisionId, revisionId)),
    tx
      .select({
        kind: contractDeposit.kind,
        amount: contractDeposit.amount,
        method: contractDeposit.method,
        bankName: contractDeposit.bankName,
        guaranteeNumber: contractDeposit.guaranteeNumber,
        expiryDate: contractDeposit.expiryDate,
      })
      .from(contractDeposit)
      .where(eq(contractDeposit.revisionId, revisionId))
      .orderBy(asc(contractDeposit.lineNo)),
    tx
      .select({
        id: contractDeliveryBatch.id,
        plannedDate: contractDeliveryBatch.plannedDate,
        note: contractDeliveryBatch.note,
      })
      .from(contractDeliveryBatch)
      .where(eq(contractDeliveryBatch.revisionId, revisionId))
      .orderBy(asc(contractDeliveryBatch.seq)),
  ]);
  const batchLines = batches.length
    ? await tx
        .select({
          batchId: contractDeliveryBatchLine.batchId,
          kitId: contractDeliveryBatchLine.kitId,
          itemId: contractDeliveryBatchLine.itemId,
          quantity: contractDeliveryBatchLine.quantity,
        })
        .from(contractDeliveryBatchLine)
        .where(
          inArray(
            contractDeliveryBatchLine.batchId,
            batches.map((batch) => batch.id),
          ),
        )
    : [];
  return {
    kits,
    lines,
    compensations,
    deposits,
    batches: batches.map((batch) => ({
      plannedDate: batch.plannedDate,
      note: batch.note,
      lines: batchLines
        .filter((line) => line.batchId === batch.id)
        .map(({ kitId, itemId, quantity }) => ({ kitId, itemId, quantity })),
    })),
  };
}

// ----------------------------------------------------------- comparing

export interface HeadForCompare {
  type: string;
  customerId: string;
  siteId: string | null;
}

/** Codes of the items and kits a content names, for display. */
async function codesOf(tx: Reader, content: StoredContent) {
  const itemIds = [
    ...new Set([
      ...content.lines.map((line) => line.itemId),
      ...content.batches.flatMap((batch) =>
        batch.lines.flatMap((line) => (line.itemId ? [line.itemId] : [])),
      ),
    ]),
  ];
  const kitIds = [
    ...new Set(
      content.batches.flatMap((batch) =>
        batch.lines.flatMap((line) => (line.kitId ? [line.kitId] : [])),
      ),
    ),
  ];
  const [items, kits] = await Promise.all([
    itemIds.length
      ? tx
          .select({ id: item.id, code: item.code, unit: item.unit })
          .from(item)
          .where(inArray(item.id, itemIds))
      : [],
    kitIds.length
      ? tx
          .select({ id: kit.id, code: kit.code })
          .from(kit)
          .where(inArray(kit.id, kitIds))
      : [],
  ]);
  return {
    items: new Map(items.map((row) => [row.id, row])),
    kits: new Map(kits.map((row) => [row.id, row])),
  };
}

/** The shape diffRevisions compares (contract-revision.ts). */
export async function comparable(
  tx: Reader,
  head: HeadForCompare,
  terms: Terms,
  content: StoredContent,
): Promise<RevisionContent> {
  const { items, kits } = await codesOf(tx, content);
  const unitOf = (id: string) =>
    (items.get(id)?.unit ?? "PIECE") as QuantityUnit;
  const codeOf = (id: string) => items.get(id)?.code ?? id;
  const kg: QuantityUnit = "KG";
  return {
    ...head,
    signedDate: terms.signedDate,
    startDate: terms.startDate,
    endDate: terms.endDate,
    minRentalDays: terms.minRentalDays,
    paymentTermsDays: terms.paymentTermsDays,
    vatEnabled: terms.vatEnabled,
    vatRate: terms.vatRate,
    companyTruck: terms.companyTruck,
    freightPerTrip: terms.freightPerTrip,
    lines: content.lines.map((line) => {
      const unit = unitOf(line.itemId);
      return {
        itemId: line.itemId,
        itemCode: codeOf(line.itemId),
        unit,
        condition: line.condition,
        pricingUnit: line.pricingUnit,
        quantityMilli: quantityFromDb(
          line.quantity,
          byWeight(line.pricingUnit) ? kg : unit,
        ).milli,
        price: line.price,
      };
    }),
    compensations: content.compensations.map((entry) => ({
      itemId: entry.itemId,
      itemCode: codeOf(entry.itemId),
      lostPrice: entry.lostPrice,
      damagePrice: entry.damagePrice,
    })),
    deposits: content.deposits,
    batches: content.batches.map((batch): ContentBatch => ({
      plannedDate: batch.plannedDate,
      note: batch.note,
      text: batch.lines
        .map((line) => {
          const code = line.kitId
            ? (kits.get(line.kitId)?.code ?? line.kitId)
            : codeOf(line.itemId ?? "");
          const unit = line.kitId ? "PIECE" : unitOf(line.itemId ?? "");
          return `${formatQuantity(quantityFromDb(line.quantity, unit))} ${code}`;
        })
        .join(" + "),
    })),
  };
}
