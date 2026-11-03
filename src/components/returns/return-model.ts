// M4 draft model (returns spec "Chia tình trạng khi trả", "Nháp thu hồi trên
// máy"; design D13): what the storekeeper typed per item, the split check
// and the body sent to the server. Pure, so it is tested without a phone.
import {
  formatQuantity,
  parseQuantity,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import type { DraftPhoto } from "@/lib/drafts/outbox";

export const SPLIT_FIELDS = ["good", "repair", "scrap", "lost"] as const;
export type SplitField = (typeof SPLIT_FIELDS)[number];

export const SPLIT_LABELS: Readonly<Record<SplitField, string>> = {
  good: "Tốt",
  repair: "Chờ sửa",
  scrap: "Phế liệu",
  lost: "Mất",
};

export interface ReturnItem {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  onSiteMilli: number;
}

/** Texts as typed, so a half-typed number survives a reload. */
export interface CountedLine {
  total: string;
  good: string;
  repair: string;
  scrap: string;
  lost: string;
}

export interface ReturnPayload {
  contractId: string;
  yardLocationId: string;
  vehiclePlate: string;
  note: string;
  /** Items the storekeeper opened, in the order they were opened. */
  opened: string[];
  lines: Record<string, CountedLine>;
  photos: DraftPhoto[];
  savedOnDeviceAt: string | null;
  /** The waiting exchange this note brings back; null when unticked. */
  exchangeId?: string | null;
  /** Set when the note was confirmed: what the outbox sends. */
  body?: object;
}

export const emptyLine = (): CountedLine => ({
  total: "",
  good: "",
  repair: "",
  scrap: "",
  lost: "",
});

export function milliOf(text: string | undefined, unit: QuantityUnit): number {
  if (!text || text.trim() === "") return 0;
  try {
    return parseQuantity(text, unit).milli;
  } catch {
    return 0;
  }
}

const amount = (milli: number, unit: QuantityUnit) =>
  `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;

export interface LineCheck {
  returnedMilli: number;
  splitMilli: number;
  lostMilli: number;
  /** Tốt + Chờ sửa + Phế liệu = tổng trả về, and not above the site. */
  ok: boolean;
  /** Nothing typed at all. */
  empty: boolean;
  text: string;
}

/** "Đã chia đủ 100 cái", "Còn 5 cái chưa phân loại", or what is too many. */
export function checkLine(item: ReturnItem, line: CountedLine): LineCheck {
  const returnedMilli = milliOf(line.total, item.unit);
  const splitMilli =
    milliOf(line.good, item.unit) +
    milliOf(line.repair, item.unit) +
    milliOf(line.scrap, item.unit);
  const lostMilli = milliOf(line.lost, item.unit);
  const empty = returnedMilli === 0 && splitMilli === 0 && lostMilli === 0;
  if (returnedMilli + lostMilli > item.onSiteMilli) {
    return {
      returnedMilli,
      splitMilli,
      lostMilli,
      ok: false,
      empty,
      text: `Trả về và mất (${amount(returnedMilli + lostMilli, item.unit)}) nhiều hơn số đang ở công trình (${amount(item.onSiteMilli, item.unit)})`,
    };
  }
  if (splitMilli < returnedMilli) {
    return {
      returnedMilli,
      splitMilli,
      lostMilli,
      ok: false,
      empty,
      text: `Còn ${amount(returnedMilli - splitMilli, item.unit)} chưa phân loại`,
    };
  }
  if (splitMilli > returnedMilli) {
    return {
      returnedMilli,
      splitMilli,
      lostMilli,
      ok: false,
      empty,
      text: `Đã chia ${amount(splitMilli, item.unit)}, nhiều hơn tổng trả về ${amount(returnedMilli, item.unit)}`,
    };
  }
  return {
    returnedMilli,
    splitMilli,
    lostMilli,
    ok: true,
    empty,
    text: empty
      ? "Chưa đếm"
      : returnedMilli > 0
        ? `Đã chia đủ ${amount(returnedMilli, item.unit)}`
        : `Mất ${amount(lostMilli, item.unit)}`,
  };
}

/** "2/3 mã đã đếm". */
export function progressText(
  items: readonly ReturnItem[],
  payload: ReturnPayload,
): string {
  const counted = items.filter(
    (item) => !checkLine(item, payload.lines[item.itemId] ?? emptyLine()).empty,
  ).length;
  return `${counted}/${items.length} mã đã đếm`;
}

/** Whether "Lưu phiếu thu hồi" may be pressed, and why not. */
export function blockers(
  items: readonly ReturnItem[],
  payload: ReturnPayload,
): string[] {
  const checks = items.map((item) => ({
    item,
    check: checkLine(item, payload.lines[item.itemId] ?? emptyLine()),
  }));
  const wrong = checks
    .filter(({ check }) => !check.ok)
    .map(({ item, check }) => `${item.code}: ${check.text}.`);
  if (wrong.length > 0) return wrong;
  if (checks.every(({ check }) => check.empty)) {
    return ["Nhập số trả về hoặc số mất của ít nhất một mã."];
  }
  return [];
}

/**
 * A new total: Tốt follows it while nothing went to Chờ sửa / Phế liệu and
 * Tốt still equals the old total, so a plain count needs no split.
 */
export function withTotal(line: CountedLine, total: string): CountedLine {
  const follows =
    line.repair === "" &&
    line.scrap === "" &&
    (line.good === "" || line.good === line.total);
  return { ...line, total, good: follows ? total : line.good };
}

/** The body of POST /api/m/returns (the outbox adds the draft and photos). */
export function bodyOf(
  items: readonly ReturnItem[],
  payload: ReturnPayload,
  savedOnDeviceAt: string,
): object {
  return {
    contractId: payload.contractId,
    yardLocationId: payload.yardLocationId,
    vehiclePlate: payload.vehiclePlate.trim() || null,
    note: payload.note.trim() || null,
    savedOnDeviceAt,
    ...(payload.exchangeId ? { exchangeId: payload.exchangeId } : {}),
    lines: items.flatMap((item) => {
      const line = payload.lines[item.itemId];
      if (!line || checkLine(item, line).empty) return [];
      return [
        {
          itemId: item.itemId,
          good: line.good || "0",
          repair: line.repair || "0",
          scrap: line.scrap || "0",
          lost: line.lost || "0",
        },
      ];
    }),
  };
}
