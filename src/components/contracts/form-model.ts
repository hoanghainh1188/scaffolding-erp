// D5a / D5b form state as plain data (contracts design D9): rows by item for
// a rental (kits bring their parts), sale rows by item + condition + unit,
// and the body the API takes. Pure, so the arithmetic shown on screen is
// unit tested; the server checks everything again.
import { DomainValueError } from "@/domain/errors";
import { byWeight, differs, saleLineAmount } from "@/domain/contract-lines";
import { toMoney } from "@/domain/money";
import {
  parseQuantity,
  quantityFromDb,
  quantityToDb,
  formatQuantityForInput,
  type QuantityUnit,
} from "@/domain/quantity";
import { dailyTotal, monthDisplay, type MonthFigure } from "@/domain/rental";

import type { FormOptions, RevisionView } from "@/lib/contracts/queries";

export type ItemOption = FormOptions["items"][number];
export type KitOption = FormOptions["kits"][number];

export interface KitRow {
  key: number;
  kitId: string;
  quantity: string;
}

/** A rental row: one per item. `own` is what is added outside kits. */
export interface RentRow {
  key: number;
  itemId: string;
  own: string;
  price: string;
}

export interface SaleRow {
  key: number;
  itemId: string;
  condition: string;
  pricingUnit: "ITEM" | "KG";
  quantity: string;
  price: string;
}

export interface CompensationRow {
  lost: string;
  damage: string;
}

export interface DepositRow {
  key: number;
  kind: "CASH" | "GUARANTEE";
  amount: string;
  method: "CASH" | "TRANSFER";
  bankName: string;
  guaranteeNumber: string;
  expiryDate: string;
}

export interface BatchLineRow {
  key: number;
  /** "kit:<id>" or "item:<id>" */
  ref: string;
  quantity: string;
}

export interface BatchRow {
  key: number;
  plannedDate: string;
  note: string;
  lines: BatchLineRow[];
}

export interface ContentState {
  kits: KitRow[];
  rent: RentRow[];
  sale: SaleRow[];
  compensations: Record<string, CompensationRow>;
  deposits: DepositRow[];
  batches: BatchRow[];
}

let counter = 0;
export const nextKey = (): number => (counter += 1);

/** "1.250.000", "1250000" → 1250000; "" → null; anything else → NaN. */
export function readMoney(text: string): number | null {
  const plain = text.replace(/[\s.₫đ]/g, "");
  if (plain === "") return null;
  return /^\d+$/.test(plain) ? Number(plain) : Number.NaN;
}

const moneyText = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

/** Pieces each kit row brings, per item. */
export function kitParts(
  kits: readonly KitRow[],
  kitOf: ReadonlyMap<string, KitOption>,
): Map<string, number> {
  const parts = new Map<string, number>();
  for (const row of kits) {
    const count = Number(row.quantity);
    if (!Number.isInteger(count) || count < 1) continue;
    for (const part of kitOf.get(row.kitId)?.components ?? []) {
      parts.set(
        part.itemId,
        (parts.get(part.itemId) ?? 0) + part.quantity * count,
      );
    }
  }
  return parts;
}

/** Rows after the kits changed: new parts get a row, empty ones go. */
export function syncRentRows(
  rows: readonly RentRow[],
  parts: ReadonlyMap<string, number>,
  itemOf: ReadonlyMap<string, ItemOption>,
): RentRow[] {
  const kept = rows.filter(
    (row) =>
      parts.has(row.itemId) || (Number(row.own) || 0) > 0 || row.own === "",
  );
  const known = new Set(kept.map((row) => row.itemId));
  const added = [...parts.keys()]
    .filter((itemId) => !known.has(itemId))
    .map((itemId) => ({
      key: nextKey(),
      itemId,
      own: "0",
      price: moneyText(itemOf.get(itemId)?.dailyRentalPrice),
    }));
  return [...added, ...kept];
}

function milliOf(text: string, unit: QuantityUnit): number {
  try {
    return parseQuantity(text || "0", unit).milli;
  } catch {
    return 0;
  }
}

export interface Preview {
  /** Total pieces per rental row (own + kits), in thousandths. */
  totals: Map<number, number>;
  dayRent: number;
  months: MonthFigure[];
  /** Sale total; null while a price is missing. */
  saleTotal: number | null;
  offCatalog: { rent: number; compensation: number };
}

/** What D5a shows while typing: day's rent, months, sale total, marks. */
export function previewContent(
  type: "RENTAL" | "SALE",
  content: ContentState,
  itemOf: ReadonlyMap<string, ItemOption>,
  kitOf: ReadonlyMap<string, KitOption>,
): Preview {
  const parts = kitParts(content.kits, kitOf);
  const totals = new Map<number, number>();
  const priced: { dailyPrice: number; quantityMilli: number }[] = [];
  let rentMarks = 0;
  for (const row of content.rent) {
    const unit = (itemOf.get(row.itemId)?.unit ?? "PIECE") as QuantityUnit;
    const milli = milliOf(row.own, unit) + (parts.get(row.itemId) ?? 0) * 1000;
    totals.set(row.key, milli);
    const price = readMoney(row.price);
    if (price !== null && !Number.isNaN(price)) {
      priced.push({ dailyPrice: price, quantityMilli: milli });
      if (differs(price, itemOf.get(row.itemId)?.dailyRentalPrice ?? null)) {
        rentMarks += 1;
      }
    }
  }
  const compensationMarks =
    type === "RENTAL"
      ? content.rent.filter((row) => {
          const entry = content.compensations[row.itemId];
          const found = itemOf.get(row.itemId);
          if (!entry || !found) return false;
          return (
            differs(readMoney(entry.lost), found.lostPrice) ||
            differs(readMoney(entry.damage), found.damagePrice)
          );
        }).length
      : 0;
  let saleTotal: number | null = 0;
  for (const row of content.sale) {
    const price = readMoney(row.price);
    if (price === null || Number.isNaN(price)) {
      saleTotal = null;
      continue;
    }
    const unit: QuantityUnit = byWeight(row.pricingUnit)
      ? "KG"
      : ((itemOf.get(row.itemId)?.unit ?? "PIECE") as QuantityUnit);
    if (saleTotal !== null) {
      saleTotal += saleLineAmount(milliOf(row.quantity, unit), toMoney(price));
    }
  }
  const dayRent = dailyTotal(priced);
  return {
    totals,
    dayRent,
    months: monthDisplay(dayRent),
    saleTotal: content.sale.length ? saleTotal : null,
    offCatalog: { rent: rentMarks, compensation: compensationMarks },
  };
}

/** Field errors found before sending; the server checks again. */
export type FieldErrors = Record<string, string>;

const quantityText = (
  text: string,
  unit: QuantityUnit,
  field: string,
  errors: FieldErrors,
) => {
  try {
    return quantityToDb(parseQuantity(text || "0", unit));
  } catch (problem) {
    if (!(problem instanceof DomainValueError)) throw problem;
    errors[field] = problem.message;
    return "0";
  }
};

const priceOf = (text: string, field: string, errors: FieldErrors) => {
  const value = readMoney(text);
  if (Number.isNaN(value)) {
    errors[field] = "Giá phải là số nguyên từ 0 ₫ trở lên.";
    return null;
  }
  return value;
};

/** The content part of the API body. */
export function contentBody(
  type: "RENTAL" | "SALE",
  content: ContentState,
  itemOf: ReadonlyMap<string, ItemOption>,
  refreshCompensation: boolean,
):
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const unitOf = (id: string) =>
    (itemOf.get(id)?.unit ?? "PIECE") as QuantityUnit;
  const lines =
    type === "RENTAL"
      ? content.rent.map((row, index) => ({
          itemId: row.itemId,
          quantity: quantityText(
            row.own,
            unitOf(row.itemId),
            `lines.${index}.quantity`,
            errors,
          ),
          price: priceOf(row.price, `lines.${index}.price`, errors),
        }))
      : content.sale.map((row, index) => ({
          itemId: row.itemId,
          condition: row.condition,
          pricingUnit: row.pricingUnit,
          quantity: quantityText(
            row.quantity,
            byWeight(row.pricingUnit) ? "KG" : unitOf(row.itemId),
            `lines.${index}.quantity`,
            errors,
          ),
          price: priceOf(row.price, `lines.${index}.price`, errors),
        }));
  const compensations =
    type === "RENTAL"
      ? content.rent.map((row) => {
          const entry = content.compensations[row.itemId] ?? {
            lost: "",
            damage: "",
          };
          return {
            itemId: row.itemId,
            lostPrice: priceOf(
              entry.lost,
              `compensations.${row.itemId}.lostPrice`,
              errors,
            ),
            damagePrice: priceOf(
              entry.damage,
              `compensations.${row.itemId}.damagePrice`,
              errors,
            ),
          };
        })
      : [];
  const deposits = content.deposits.map((row, index) => {
    const amount = readMoney(row.amount);
    if (amount === null || Number.isNaN(amount)) {
      errors[`deposits.${index}.amount`] = "Số tiền cọc phải lớn hơn 0 ₫.";
    }
    return row.kind === "CASH"
      ? { kind: "CASH", amount: amount ?? 0, method: row.method }
      : {
          kind: "GUARANTEE",
          amount: amount ?? 0,
          bankName: row.bankName,
          guaranteeNumber: row.guaranteeNumber,
          expiryDate: row.expiryDate || null,
        };
  });
  const batches = content.batches.map((batch, index) => ({
    plannedDate: batch.plannedDate,
    note: batch.note || null,
    lines: batch.lines
      .filter((line) => line.ref)
      .map((line, lineIndex) => {
        const [kind, id = ""] = line.ref.split(":");
        return kind === "kit"
          ? {
              kitId: id,
              quantity: quantityText(
                line.quantity,
                "PIECE",
                `batches.${index}.lines.${lineIndex}.quantity`,
                errors,
              ),
            }
          : {
              itemId: id,
              quantity: quantityText(
                line.quantity,
                unitOf(id),
                `batches.${index}.lines.${lineIndex}.quantity`,
                errors,
              ),
            };
      }),
  }));
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    body: {
      kits:
        type === "RENTAL"
          ? content.kits
              .filter((row) => row.kitId)
              .map((row) => ({
                kitId: row.kitId,
                quantity: Number(row.quantity) || 0,
              }))
          : [],
      lines,
      compensations,
      refreshCompensation,
      deposits,
      batches,
    },
  };
}

/** Form state from a saved revision (edit, amendment). */
export function contentFromRevision(view: RevisionView): ContentState {
  const text = (quantity: string, unit: string) =>
    formatQuantityForInput(quantityFromDb(quantity, unit as QuantityUnit));
  return {
    kits: view.kits.map((entry) => ({
      key: nextKey(),
      kitId: entry.kitId,
      quantity: String(entry.quantity),
    })),
    rent: view.lines
      .filter((line) => line.condition === null)
      .map((line) => ({
        key: nextKey(),
        itemId: line.itemId,
        own: text(line.ownQuantity, line.unit),
        price: moneyText(line.price),
      })),
    sale: view.lines
      .filter((line) => line.condition !== null)
      .map((line) => ({
        key: nextKey(),
        itemId: line.itemId,
        condition: line.condition ?? "GOOD",
        pricingUnit: byWeight(line.pricingUnit) ? "KG" : "ITEM",
        quantity: text(
          line.quantity,
          byWeight(line.pricingUnit) ? "KG" : line.unit,
        ),
        price: moneyText(line.price),
      })),
    compensations: Object.fromEntries(
      view.compensations.map((entry) => [
        entry.itemId,
        {
          lost: moneyText(entry.lostPrice),
          damage: moneyText(entry.damagePrice),
        },
      ]),
    ),
    deposits: view.deposits.map((entry) => ({
      key: nextKey(),
      kind: entry.kind === "GUARANTEE" ? "GUARANTEE" : "CASH",
      amount: String(entry.amount),
      method: entry.method === "CASH" ? "CASH" : "TRANSFER",
      bankName: entry.bankName ?? "",
      guaranteeNumber: entry.guaranteeNumber ?? "",
      expiryDate: entry.expiryDate ?? "",
    })),
    batches: view.batches.map((batch) => ({
      key: nextKey(),
      plannedDate: batch.plannedDate,
      note: batch.note ?? "",
      lines: batch.lines.map((line) => ({
        key: nextKey(),
        ref: line.kitId ? `kit:${line.kitId}` : `item:${line.itemId ?? ""}`,
        quantity: text(line.quantity, "KG"),
      })),
    })),
  };
}

export const EMPTY_STATE: ContentState = {
  kits: [],
  rent: [],
  sale: [],
  compensations: {},
  deposits: [],
  batches: [],
};

/** Compensation for a new rental row, copied from the catalog (0.2 #49). */
export function catalogCompensation(
  found: ItemOption | undefined,
): CompensationRow {
  return {
    lost: moneyText(found?.lostPrice),
    damage: moneyText(found?.damagePrice),
  };
}
