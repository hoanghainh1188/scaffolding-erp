// Texts of delivery notes (deliveries spec "Nhật ký thao tác phiếu xuất",
// D6, M1): "60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm" and the
// activity-log rows of creating and posting a note.
import { countText, joinParts } from "./activity-summary";
import { formatMoney, toMoney } from "./money";
import {
  formatQuantity,
  isPieceUnit,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "./quantity";

export interface NamedAmount {
  itemCode: string;
  itemName: string;
  unit: QuantityUnit;
  milli: number;
}

export interface KitAmount {
  kitName: string;
  quantity: number;
}

/** "khung" from "Khung giàn giáo 1,7m": the first word, lower case. */
export function shortItemName(name: string): string {
  const [first] = name.trim().split(/\s+/);
  return (first ?? name).toLocaleLowerCase("vi-VN");
}

/**
 * "120 khung, 80 chéo, 60 mâm". Short names clash (two kinds of khung)
 * fall back to the item code; units other than cái are spelled out.
 */
export function amountsText(rows: readonly NamedAmount[]): string {
  const shorts = rows.map((row) => shortItemName(row.itemName));
  return rows
    .map((row, index) => {
      const short = shorts[index] as string;
      const clash = shorts.filter((name) => name === short).length > 1;
      const name = clash ? row.itemCode : short;
      const qty = formatQuantity(toQuantity(row.milli, row.unit));
      return isPieceUnit(row.unit)
        ? `${qty} ${name}`
        : `${qty} ${QUANTITY_UNIT_LABELS[row.unit]} ${name}`;
    })
    .join(", ");
}

/** "60 bộ giàn giáo 1,7m" from the kit "Bộ giàn giáo 1,7m". */
export function kitsText(kits: readonly KitAmount[]): string {
  return kits
    .map((kit) => {
      const name = kit.kitName.trim();
      const lower = name.charAt(0).toLocaleLowerCase("vi-VN") + name.slice(1);
      return `${kit.quantity.toLocaleString("vi-VN")} ${lower}`;
    })
    .join(", ");
}

/** "60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm", or just the lines. */
export function batchText(
  kits: readonly KitAmount[],
  lines: readonly NamedAmount[],
): string {
  const parts = amountsText(lines);
  return kits.length === 0 ? parts : `${kitsText(kits)} = ${parts}`;
}

export interface OverAmount {
  itemCode: string;
  unit: QuantityUnit;
  milli: number;
}

function overText(over: readonly OverAmount[]): string | null {
  if (over.length === 0) return null;
  const parts = over.map((row) => {
    const qty = formatQuantity(toQuantity(row.milli, row.unit));
    return isPieceUnit(row.unit)
      ? `${qty} ${row.itemCode}`
      : `${qty} ${QUANTITY_UNIT_LABELS[row.unit]} ${row.itemCode}`;
  });
  return `vượt hợp đồng ${parts.join(", ")}`;
}

export interface CreatedSummaryInput {
  batchNo: number;
  kits: readonly KitAmount[];
  lineCount: number;
  freight: number | null;
  over: readonly OverAmount[];
}

/** "Đợt 3 · 60 bộ giàn giáo 1,7m = 3 mã · cước 1.800.000 ₫". */
export function createdSummary(input: CreatedSummaryInput): string {
  const lines = countText(input.lineCount, "mã");
  return joinParts(
    `Đợt ${input.batchNo}`,
    input.kits.length > 0 ? `${kitsText(input.kits)} = ${lines}` : lines,
    input.freight === null
      ? null
      : `cước ${formatMoney(toMoney(input.freight))}`,
    overText(input.over),
  );
}

export interface PostedSummaryInput {
  delivered: readonly NamedAmount[];
  short: readonly NamedAmount[];
  over: readonly OverAmount[];
  contractStarted: boolean;
}

/** "Xuất 120 khung, 80 chéo, 60 mâm · thiếu 40 chéo · hợp đồng sang Đang thực hiện". */
export function postedSummary(input: PostedSummaryInput): string {
  return joinParts(
    `Xuất ${amountsText(input.delivered)}`,
    input.short.length > 0 ? `thiếu ${amountsText(input.short)}` : null,
    overText(input.over),
    input.contractStarted ? "hợp đồng sang Đang thực hiện" : null,
  );
}
