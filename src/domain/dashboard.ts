// D1 Tổng quan (dashboard-basic design D1, D3, D5, D8; 0.2 #90–#97). Pure
// rules the dashboard reads through: the greeting, the risk signs of a
// rental contract, pieces and tons on site, totals by region, months and the
// top 5. The readers in src/lib/dashboard/ feed them; nothing here is stored.
import {
  daysBetween,
  formatBusinessDate,
  type BusinessDate,
} from "./business-date";
import { lineWeightKgMilli } from "./landed-cost";
import { toMoney, type Money } from "./money";
import { can, canContract, type ContractUser } from "./permissions";
import {
  REGION_LABELS,
  REGIONS,
  UNKNOWN_REGION_LABEL,
  regionOf,
} from "./province";
import {
  formatByUnit,
  formatQuantity,
  toQuantity,
  type QuantityUnit,
  type UnitAmount,
} from "./quantity";
import type { Role } from "./role";

/** A loss this many days old or newer marks the site (0.2 #92). */
export const RISK_LOSS_DAYS = 30;

/** Rows of the fixed-height lists (design D6). */
export const DASHBOARD_LIST_LIMITS = {
  approvals: 5,
  risks: 5,
  stock: 6,
  top: 5,
} as const;

/** Months of the revenue chart, this month included (design D2). */
export const REVENUE_MONTHS = 6;

// ── Greeting ────────────────────────────────────────────────────────────

const WEEKDAYS = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
] as const;

/** "Thứ Sáu, 06/11/2026" */
export function dayText(date: BusinessDate): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday] ?? ""}, ${formatBusinessDate(date)}`;
}

/** The title of D1 (0.2 #94): the director approves, others wait. */
export function greeting(name: string, role: Role, count: number): string {
  if (role === "DIRECTOR") {
    return count > 0
      ? `Chào ${name}, hôm nay có ${count} việc chờ bạn duyệt`
      : `Chào ${name}, hôm nay không có việc nào chờ bạn duyệt`;
  }
  return count > 0
    ? `Chào ${name}, có ${count} việc đang chờ Giám đốc duyệt`
    : `Chào ${name}, không có việc nào đang chờ Giám đốc duyệt`;
}

/** Title of the approvals block. */
export const approvalsTitle = (role: Role): string =>
  role === "DIRECTOR" ? "Chờ bạn duyệt" : "Đang chờ Giám đốc duyệt";

// ── Pieces and tons (design D8) ─────────────────────────────────────────

/** One item quantity on a site. */
export interface OnSiteLine {
  unit: QuantityUnit;
  /** Thousandths of the unit. */
  milli: number;
  standardWeightKg: string | null;
}

export interface OnSiteTotals {
  /** Thousandths of a piece: items counted in cái only. */
  piecesMilli: number;
  /** Thousandths of a kg: every item. */
  kgMilli: number;
}

/** "cái" adds PIECE items only; tons add every item (0.2 #97, design D8). */
export function onSiteTotals(lines: readonly OnSiteLine[]): OnSiteTotals {
  return lines.reduce<OnSiteTotals>(
    (sum, line) => ({
      piecesMilli: sum.piecesMilli + (line.unit === "PIECE" ? line.milli : 0),
      kgMilli:
        sum.kgMilli +
        lineWeightKgMilli(line.unit, line.milli, line.standardWeightKg),
    }),
    { piecesMilli: 0, kgMilli: 0 },
  );
}

/** "318,4": tons with one decimal, half up. */
export function tonsText(kgMilli: number): string {
  const tenths = Math.floor((Math.abs(kgMilli) + 50_000) / 100_000);
  const sign = kgMilli < 0 && tenths > 0 ? "-" : "";
  const whole = Math.floor(tenths / 10).toLocaleString("vi-VN");
  return `${sign}${whole},${tenths % 10}`;
}

/** "21.860": whole pieces. */
export const piecesText = (piecesMilli: number): string =>
  formatQuantity(toQuantity(piecesMilli, "PIECE"));

// ── Regions ─────────────────────────────────────────────────────────────

export interface SiteTotals extends OnSiteTotals {
  siteId: string;
  province: string | null;
}

export interface RegionRow extends OnSiteTotals {
  label: string;
  siteCount: number;
}

/** Rows by region (North, Central, South, then "Chưa rõ" if any) + total. */
export function regionTotals(sites: readonly SiteTotals[]): {
  rows: RegionRow[];
  total: RegionRow;
} {
  const held = sites.filter(
    (site) => site.piecesMilli !== 0 || site.kgMilli !== 0,
  );
  const rowOf = (label: string, group: readonly SiteTotals[]): RegionRow => ({
    label,
    siteCount: new Set(group.map((site) => site.siteId)).size,
    piecesMilli: group.reduce((sum, site) => sum + site.piecesMilli, 0),
    kgMilli: group.reduce((sum, site) => sum + site.kgMilli, 0),
  });
  const rows = REGIONS.map((region) =>
    rowOf(
      REGION_LABELS[region],
      held.filter((site) => regionOf(site.province) === region),
    ),
  );
  const unknown = held.filter((site) => regionOf(site.province) === null);
  if (unknown.length > 0) rows.push(rowOf(UNKNOWN_REGION_LABEL, unknown));
  return { rows, total: rowOf("Cộng", held) };
}

// ── Risk (0.2 #92, design D5) ───────────────────────────────────────────

export type RiskSign =
  | { kind: "OVERDUE"; days: number }
  | {
      kind: "LOSS";
      date: BusinessDate;
      items: { code: string; unit: QuantityUnit; milli: number }[];
    }
  | { kind: "PAST_END"; endDate: BusinessDate; onSite: UnitAmount[] };

/** A loss at most RISK_LOSS_DAYS days before today (Vietnam days). */
export function isRecentLoss(
  lossDate: BusinessDate,
  today: BusinessDate,
): boolean {
  const age = daysBetween(lossDate, today);
  return age >= 0 && age <= RISK_LOSS_DAYS;
}

/** The end date has passed and goods are still on site. */
export function isPastEnd(
  endDate: BusinessDate | null,
  today: BusinessDate,
  onSite: readonly UnitAmount[],
): boolean {
  if (!endDate || endDate >= today) return false;
  return onSite.some((amount) => amount.milli > 0);
}

const shortDate = (date: BusinessDate) => formatBusinessDate(date).slice(0, 5);

/** "Nợ quá hạn 36 ngày", "Mất 3 PK-KU ngày 20/10", "Hết hạn HĐ 31/10, còn 860 cái". */
export function riskLabel(sign: RiskSign): string {
  if (sign.kind === "OVERDUE") return `Nợ quá hạn ${sign.days} ngày`;
  if (sign.kind === "LOSS") {
    const items = sign.items
      .map(
        (entry) =>
          `${formatQuantity(toQuantity(entry.milli, entry.unit))} ${entry.code}`,
      )
      .join(", ");
    return `Mất ${items} ngày ${shortDate(sign.date)}`;
  }
  return `Hết hạn HĐ ${shortDate(sign.endDate)}, còn ${formatByUnit(sign.onSite)}`;
}

export interface RiskContract {
  siteId: string;
  siteCode: string;
  siteName: string;
  contractId: string;
  contractCode: string;
  customerName: string;
  signs: RiskSign[];
}

export interface RiskSite {
  siteId: string;
  siteCode: string;
  siteName: string;
  contracts: RiskContract[];
}

const overdueDaysOf = (contracts: readonly RiskContract[]) =>
  Math.max(
    0,
    ...contracts.flatMap((entry) =>
      entry.signs.flatMap((sign) =>
        sign.kind === "OVERDUE" ? [sign.days] : [],
      ),
    ),
  );

/** Risky contracts grouped by site; the longest overdue first, then name. */
export function riskBySite(contracts: readonly RiskContract[]): RiskSite[] {
  const sites = new Map<string, RiskSite>();
  for (const entry of contracts) {
    if (entry.signs.length === 0) continue;
    const site = sites.get(entry.siteId) ?? {
      siteId: entry.siteId,
      siteCode: entry.siteCode,
      siteName: entry.siteName,
      contracts: [],
    };
    sites.set(entry.siteId, {
      ...site,
      contracts: [...site.contracts, entry],
    });
  }
  return [...sites.values()].sort(
    (a, b) =>
      overdueDaysOf(b.contracts) - overdueDaysOf(a.contracts) ||
      a.siteName.localeCompare(b.siteName, "vi"),
  );
}

// ── Months and the top 5 ────────────────────────────────────────────────

/** Revenue of one day: rent (with rental freight) and sale, before VAT. */
export interface DayRevenue {
  date: BusinessDate;
  rent: Money;
  sale: Money;
}

export interface MonthRevenue {
  month: string;
  rent: Money;
  sale: Money;
  total: Money;
  /** Some rental period of the month is not closed (0.2 #90). */
  provisional: boolean;
}

/** Months in order, rent and sale kept apart, negatives kept. */
export function monthTotals(
  days: readonly DayRevenue[],
  months: readonly string[],
  openMonths: ReadonlySet<string>,
): MonthRevenue[] {
  return months.map((month) => {
    const inMonth = days.filter((day) => day.date.startsWith(`${month}-`));
    const rent = inMonth.reduce((sum, day) => sum + day.rent, 0);
    const sale = inMonth.reduce((sum, day) => sum + day.sale, 0);
    return {
      month,
      rent: toMoney(rent),
      sale: toMoney(sale),
      total: toMoney(rent + sale),
      provisional: openMonths.has(month),
    };
  });
}

export interface RankedCustomer {
  customerId: string;
  name: string;
  value: number;
}

/** The first `limit` customers by value, then name; zero is left out. */
export function topCustomers(
  rows: readonly RankedCustomer[],
  limit: number = DASHBOARD_LIST_LIMITS.top,
): RankedCustomer[] {
  return rows
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "vi"))
    .slice(0, limit);
}

/** "278,4 tr" for the month chart. */
export function millionsText(amount: number): string {
  const tenths = Math.round(amount / 100_000);
  const sign = tenths < 0 ? "-" : "";
  const abs = Math.abs(tenths);
  return `${sign}${Math.floor(abs / 10).toLocaleString("vi-VN")},${abs % 10} tr`;
}

// ── Blocks by role (design D1) ──────────────────────────────────────────

export interface DashboardBlocks {
  /** Money blocks: overdue, revenue, top 5, money of the lookup (0.2 #91). */
  money: boolean;
  /** Risky sites and the site lookup: rental contracts the viewer reads. */
  rentals: boolean;
  stock: boolean;
}

/** Which blocks a viewer gets; the server reads nothing else (design D1). */
export function blocksFor(viewer: ContractUser): DashboardBlocks {
  return {
    money: can(viewer.role, "receivables.view"),
    rentals: canContract(viewer, "RENTAL", "view"),
    stock: can(viewer.role, "inventory.view"),
  };
}
