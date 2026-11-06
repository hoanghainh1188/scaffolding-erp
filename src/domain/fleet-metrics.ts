// Rental stock of D15 (management-reports design D4; spec fleet-metrics;
// 0.2 #108, #109, #114). The rental stock of a day is the New and Good
// stock at every location at the end of that day; averages are day sums
// over the days of the period. Losses are the tonnes lost, returned as
// scrap or returned for repair, per 100 tonnes of average rental stock.
// Pure functions: the readers in src/lib/reports/ feed them.
import { roundHalfUp } from "./average-cost";
import { addDays, type BusinessDate } from "./business-date";
import { lineWeightKgMilli } from "./landed-cost";
import { hasStandardWeight, isPieceUnit, type QuantityUnit } from "./quantity";

/** Rows the D15 tables show before "N mã khác" (spec management-reports). */
export const REPORT_ROW_LIMIT = 10;

/** Losses are given per this many tonnes of rental stock (0.2 #108). */
export const LOSS_BASE_TONS = 100;

export interface FleetItem {
  itemId: string;
  code: string;
  name: string;
  unit: QuantityUnit;
  standardWeightKg: string | null;
}

/** New + Good stock of an item, at sites or elsewhere, in thousandths. */
export interface FleetBalance {
  itemId: string;
  onSite: boolean;
  milli: number;
}

/** The change of that stock on one Vietnam day. */
export interface FleetDelta extends FleetBalance {
  date: BusinessDate;
}

/** Day sums of one item: Σ end-of-day stock over the days counted. */
export interface DaySums {
  totalMilliDays: number;
  siteMilliDays: number;
}

export interface FleetMonth {
  month: string;
  days: number;
  byItem: ReadonlyMap<string, DaySums>;
}

/**
 * Rolls the opening stock forward day by day from `from` to `to` and adds
 * each end-of-day stock to the month of that day.
 */
export function dailyFleet(
  opening: readonly FleetBalance[],
  deltas: readonly FleetDelta[],
  from: BusinessDate,
  to: BusinessDate,
): FleetMonth[] {
  const total = new Map<string, number>();
  const site = new Map<string, number>();
  const add = (row: FleetBalance) => {
    total.set(row.itemId, (total.get(row.itemId) ?? 0) + row.milli);
    if (row.onSite) {
      site.set(row.itemId, (site.get(row.itemId) ?? 0) + row.milli);
    }
  };
  opening.forEach(add);
  const byDay = new Map<string, FleetDelta[]>();
  for (const delta of deltas) {
    if (delta.date < from || delta.date > to) continue;
    const day = byDay.get(delta.date);
    if (day) day.push(delta);
    else byDay.set(delta.date, [delta]);
  }
  const months: {
    month: string;
    days: number;
    byItem: Map<string, DaySums>;
  }[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    byDay.get(day)?.forEach(add);
    const month = day.slice(0, 7);
    let current = months.at(-1);
    if (current?.month !== month) {
      current = { month, days: 0, byItem: new Map() };
      months.push(current);
    }
    current.days += 1;
    for (const [itemId, milli] of total) {
      const sums = current.byItem.get(itemId) ?? {
        totalMilliDays: 0,
        siteMilliDays: 0,
      };
      current.byItem.set(itemId, {
        totalMilliDays: sums.totalMilliDays + milli,
        siteMilliDays: sums.siteMilliDays + (site.get(itemId) ?? 0),
      });
    }
  }
  return months;
}

export interface FleetSums {
  days: number;
  byItem: ReadonlyMap<string, DaySums>;
}

/** The day sums of some months: the period, the year to date. */
export function sumFleet(
  months: readonly FleetMonth[],
  wanted: readonly string[],
): FleetSums {
  const keep = new Set(wanted);
  const byItem = new Map<string, DaySums>();
  let days = 0;
  for (const month of months) {
    if (!keep.has(month.month)) continue;
    days += month.days;
    for (const [itemId, sums] of month.byItem) {
      const sum = byItem.get(itemId) ?? { totalMilliDays: 0, siteMilliDays: 0 };
      byItem.set(itemId, {
        totalMilliDays: sum.totalMilliDays + sums.totalMilliDays,
        siteMilliDays: sum.siteMilliDays + sums.siteMilliDays,
      });
    }
  }
  return { days, byItem };
}

export const LOSS_KINDS = ["loss", "scrap", "repair"] as const;
export type LossKind = (typeof LOSS_KINDS)[number];

/** Pieces lost, returned as scrap or for repair in one month (positive). */
export interface LossSum {
  month: string;
  itemId: string;
  kind: LossKind;
  milli: number;
}

const kgOf = (item: FleetItem, milli: number) =>
  lineWeightKgMilli(item.unit, milli, item.standardWeightKg);

/** Items whose unit has a weight but whose standard weight is missing. */
export const weightless = (item: FleetItem): boolean =>
  hasStandardWeight(item.unit) &&
  !(item.standardWeightKg && Number(item.standardWeightKg) > 0);

export interface LossRow {
  /** Null on the "N mã khác" and the total rows. */
  itemId: string | null;
  code: string;
  name: string;
  /** Kg-days of rental stock: the average is this ÷ days. */
  kgDays: number;
  days: number;
  lossKgMilli: number;
  scrapKgMilli: number;
  repairKgMilli: number;
  /** Items folded into this row (1 for an item). */
  count: number;
}

/** Average rental stock of a row, thousandths of a kg. */
export const averageKgMilli = (row: Pick<LossRow, "kgDays" | "days">) =>
  row.days > 0 ? Math.round(row.kgDays / row.days) : 0;

/** Hundredths of a tonne lost per 100 tonnes, or null without stock. */
export function lossPer100(row: LossRow): number | null {
  if (row.kgDays <= 0 || row.days <= 0) return null;
  const lost = row.lossKgMilli + row.scrapKgMilli + row.repairKgMilli;
  return Number(
    roundHalfUp(
      BigInt(lost) * BigInt(LOSS_BASE_TONS * 100) * BigInt(row.days),
      BigInt(row.kgDays),
    ),
  );
}

/** "1,06", or "—" without rental stock. */
export function hundredthsText(value: number | null): string {
  if (value === null) return "—";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100).toLocaleString("vi-VN")},${String(abs % 100).padStart(2, "0")}`;
}

function mergeLoss(rows: readonly LossRow[], code: string, name: string) {
  return rows.reduce<LossRow>(
    (sum, row) => ({
      ...sum,
      kgDays: sum.kgDays + row.kgDays,
      lossKgMilli: sum.lossKgMilli + row.lossKgMilli,
      scrapKgMilli: sum.scrapKgMilli + row.scrapKgMilli,
      repairKgMilli: sum.repairKgMilli + row.repairKgMilli,
      count: sum.count + row.count,
    }),
    {
      itemId: null,
      code,
      name,
      kgDays: 0,
      days: rows[0]?.days ?? 0,
      lossKgMilli: 0,
      scrapKgMilli: 0,
      repairKgMilli: 0,
      count: 0,
    },
  );
}

export interface LossTable {
  /** Every item with rental stock or a loss, average stock first. */
  rows: LossRow[];
  total: LossRow;
}

/** Losses of the period by item (spec fleet-metrics "Hao hụt"). */
export function lossTable(
  items: readonly FleetItem[],
  fleet: FleetSums,
  losses: readonly LossSum[],
  wanted: readonly string[],
): LossTable {
  const keep = new Set(wanted);
  const rows: LossRow[] = [];
  for (const item of items) {
    const sums = fleet.byItem.get(item.itemId);
    const lost = (kind: LossKind) =>
      kgOf(
        item,
        losses
          .filter(
            (row) =>
              row.itemId === item.itemId &&
              row.kind === kind &&
              keep.has(row.month),
          )
          .reduce((sum, row) => sum + row.milli, 0),
      );
    const row: LossRow = {
      itemId: item.itemId,
      code: item.code,
      name: item.name,
      kgDays: kgOf(item, sums?.totalMilliDays ?? 0),
      days: fleet.days,
      lossKgMilli: lost("loss"),
      scrapKgMilli: lost("scrap"),
      repairKgMilli: lost("repair"),
      count: 1,
    };
    if (
      row.kgDays > 0 ||
      row.lossKgMilli + row.scrapKgMilli + row.repairKgMilli > 0
    ) {
      rows.push(row);
    }
  }
  rows.sort(
    (a, b) => b.kgDays - a.kgDays || a.code.localeCompare(b.code, "vi"),
  );
  return { rows, total: mergeLoss(rows, "", "Cộng") };
}

/** The first `limit` rows and one "N mã khác" row for the rest. */
export function groupOthers<T>(
  rows: readonly T[],
  limit: number,
  merge: (rest: readonly T[]) => T,
): { shown: T[]; others: T | null } {
  if (rows.length <= limit) return { shown: [...rows], others: null };
  return {
    shown: rows.slice(0, limit),
    others: merge(rows.slice(limit)),
  };
}

/** The "N mã khác" row of the loss table. */
export const otherLosses = (rest: readonly LossRow[]): LossRow =>
  mergeLoss(rest, "", `${rest.length} mã khác`);

export interface UseRow {
  itemId: string | null;
  code: string;
  name: string;
  totalMilliDays: number;
  siteMilliDays: number;
  days: number;
  count: number;
}

/** Tenths of a percent at sites, or null without stock (0.2 #109). */
export function utilizationTenths(site: number, total: number): number | null {
  if (total <= 0) return null;
  return Number(roundHalfUp(BigInt(site) * 1000n, BigInt(total)));
}

/** Utilization by item, pieces only, highest first. */
export function useTable(
  items: readonly FleetItem[],
  fleet: FleetSums,
): UseRow[] {
  const rows: UseRow[] = [];
  for (const item of items) {
    if (!isPieceUnit(item.unit)) continue;
    const sums = fleet.byItem.get(item.itemId);
    if (!sums || sums.totalMilliDays <= 0) continue;
    rows.push({
      itemId: item.itemId,
      code: item.code,
      name: item.name,
      totalMilliDays: sums.totalMilliDays,
      siteMilliDays: sums.siteMilliDays,
      days: fleet.days,
      count: 1,
    });
  }
  const rate = (row: UseRow) =>
    utilizationTenths(row.siteMilliDays, row.totalMilliDays) ?? 0;
  return rows.sort(
    (a, b) => rate(b) - rate(a) || a.code.localeCompare(b.code, "vi"),
  );
}

/** The "N mã khác" row of the utilization table. */
export const otherUses = (rest: readonly UseRow[]): UseRow =>
  rest.reduce<UseRow>(
    (sum, row) => ({
      ...sum,
      totalMilliDays: sum.totalMilliDays + row.totalMilliDays,
      siteMilliDays: sum.siteMilliDays + row.siteMilliDays,
      count: sum.count + row.count,
    }),
    {
      itemId: null,
      code: "",
      name: `${rest.length} mã khác`,
      totalMilliDays: 0,
      siteMilliDays: 0,
      days: rest[0]?.days ?? 0,
      count: 0,
    },
  );

/** Average whole pieces of day sums (7.333,3 → 7.333). */
export const averagePieces = (milliDays: number, days: number): number =>
  days > 0 ? Math.round(milliDays / days / 1000) : 0;

export interface FleetTotals {
  /** Kg-days of all New and Good stock, and of the part at sites. */
  totalKgDays: number;
  siteKgDays: number;
  days: number;
  /** Items left out of the tonnes for lack of a standard weight. */
  weightless: number;
}

/** Tonnes of every item (0.2 #109: the whole stock in tonnes). */
export function fleetTotals(
  items: readonly FleetItem[],
  fleet: FleetSums,
): FleetTotals {
  let totalKgDays = 0;
  let siteKgDays = 0;
  let missing = 0;
  for (const item of items) {
    const sums = fleet.byItem.get(item.itemId);
    if (!sums || sums.totalMilliDays <= 0) continue;
    if (weightless(item)) missing += 1;
    totalKgDays += kgOf(item, sums.totalMilliDays);
    siteKgDays += kgOf(item, sums.siteMilliDays);
  }
  return { totalKgDays, siteKgDays, days: fleet.days, weightless: missing };
}
