// Revisions of a contract (contracts design D2, D11): which approved copy
// applies on a day, where an amendment's effective date may fall, and what
// an amendment changes compared with the copy it was made from.
import type { FieldChange } from "./activity-changes";
import { formatBusinessDate } from "./business-date";
import { CONDITION_LABELS, type Condition } from "./condition";
import { byWeight, formatVatRate } from "./contract-lines";
import { DomainValueError } from "./errors";
import { formatMoney, toMoney } from "./money";
import {
  formatQuantity,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "./quantity";

export const REVISION_MESSAGES = {
  fixed:
    "Phụ lục không đổi được loại, nhà thầu, công trình, ngày ký hay ngày bắt đầu. Bạn lập hợp đồng mới nếu cần đổi những mục này.",
  dropLine: (code: string) =>
    `Phụ lục không bỏ được dòng hàng đã có (${code}). Bạn giữ dòng và sửa số lượng dự kiến.`,
  endBeforeEffective: (effective: string) =>
    `Ngày kết thúc dự kiến mới phải sau ngày hiệu lực của phụ lục (${formatBusinessDate(effective)}).`,
  noChange: "Phụ lục chưa có thay đổi nào.",
  beforeStart: (start: string) =>
    `Ngày hiệu lực không được trước ngày bắt đầu hợp đồng (${formatBusinessDate(start)}).`,
  beforeLastAmendment: (date: string) =>
    `Ngày hiệu lực không được trước ngày hiệu lực của phụ lục đã duyệt gần nhất (${formatBusinessDate(date)}).`,
  closedPeriod: (end: string) =>
    `Ngày hiệu lực phải sau ngày chốt kỳ gần nhất (${formatBusinessDate(end)}). Kỳ đã chốt không tính lại.`,
  saleDelivered: (day: string) =>
    `Ngày hiệu lực phải sau ngày giao hàng gần nhất (${formatBusinessDate(day)}). Hàng đã giao giữ VAT và hạn trả cũ.`,
} as const;

const fail = (message: string): never => {
  throw new DomainValueError(message);
};

// ----------------------------------------------------------- applying

export interface RevisionRef {
  number: number;
  status: string;
  /** YYYY-MM-DD */
  effectiveFrom: string;
}

/**
 * The revision that applies on `date`: the approved one with the latest
 * effective date ≤ date; on the same date the higher number wins (review
 * of PR 128). Before the start date the original applies. Null when not
 * even the original is approved.
 */
export function revisionAt<T extends RevisionRef>(
  revisions: readonly T[],
  date: string,
): T | null {
  const approved = revisions
    .filter((revision) => revision.status === "APPROVED")
    .sort(
      (a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom) || b.number - a.number,
    );
  return (
    approved.find((revision) => revision.effectiveFrom <= date) ??
    approved.find((revision) => revision.number === 0) ??
    null
  );
}

export interface EffectiveDateLimits {
  contractStart: string;
  /** Effective date of the latest approved amendment, if any. */
  lastApprovedEffective: string | null;
  /** Last day of the latest closed billing period, if any (0.2 #22). */
  lastClosedEnd: string | null;
  /**
   * Sale contracts: the latest posted delivery day (0.2 #89). Goods already
   * delivered keep the VAT and the due date of their delivery day.
   */
  lastSaleDelivery?: string | null;
}

/** Where an amendment may take effect (contract-amendments spec). */
export function assertEffectiveDate(
  effectiveFrom: string,
  limits: EffectiveDateLimits,
): void {
  if (effectiveFrom < limits.contractStart) {
    fail(REVISION_MESSAGES.beforeStart(limits.contractStart));
  }
  if (
    limits.lastApprovedEffective !== null &&
    effectiveFrom < limits.lastApprovedEffective
  ) {
    fail(REVISION_MESSAGES.beforeLastAmendment(limits.lastApprovedEffective));
  }
  if (limits.lastClosedEnd !== null && effectiveFrom <= limits.lastClosedEnd) {
    fail(REVISION_MESSAGES.closedPeriod(limits.lastClosedEnd));
  }
  const delivered = limits.lastSaleDelivery ?? null;
  if (delivered !== null && effectiveFrom <= delivered) {
    fail(REVISION_MESSAGES.saleDelivered(delivered));
  }
}

// ----------------------------------------------------------- comparing

export interface ContentLine {
  itemId: string;
  itemCode: string;
  unit: QuantityUnit;
  condition: string | null;
  pricingUnit: string;
  quantityMilli: number;
  price: number | null;
}

export interface ContentCompensation {
  itemId: string;
  itemCode: string;
  lostPrice: number | null;
  damagePrice: number | null;
}

export interface ContentDeposit {
  kind: string;
  amount: number;
  method: string | null;
  bankName: string | null;
  guaranteeNumber: string | null;
  expiryDate: string | null;
}

export interface ContentBatch {
  plannedDate: string;
  note: string | null;
  /** "150 BO-17 + 400 KU0,5": what the batch brings, as shown. */
  text: string;
}

/** Everything a revision holds, as an amendment compares it. */
export interface RevisionContent {
  type: string;
  customerId: string;
  siteId: string | null;
  signedDate: string | null;
  startDate: string;
  endDate: string | null;
  minRentalDays: number | null;
  paymentTermsDays: number;
  vatEnabled: boolean;
  /** "8.00" or null. */
  vatRate: string | null;
  companyTruck: boolean;
  freightPerTrip: number | null;
  lines: readonly ContentLine[];
  compensations: readonly ContentCompensation[];
  deposits: readonly ContentDeposit[];
  batches: readonly ContentBatch[];
}

const DEPOSIT_METHOD: Readonly<Record<string, string>> = {
  CASH: "tiền mặt",
  TRANSFER: "chuyển khoản",
};

const money = (value: number | null) =>
  value === null ? null : formatMoney(toMoney(value));
const date = (value: string | null) =>
  value === null ? null : formatBusinessDate(value);

const lineKey = (line: ContentLine) =>
  `${line.itemId}|${line.condition ?? ""}|${line.pricingUnit}`;

function lineName(line: ContentLine): string {
  const condition = line.condition
    ? ` ${CONDITION_LABELS[line.condition as Condition]}`
    : "";
  const byKg = byWeight(line.pricingUnit) ? " (theo kg)" : "";
  return `${line.itemCode}${condition}${byKg}`;
}

function quantityText(line: ContentLine): string {
  const kg: QuantityUnit = "KG";
  const unit = byWeight(line.pricingUnit) ? kg : line.unit;
  return `${formatQuantity(toQuantity(line.quantityMilli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;
}

function depositText(deposit: ContentDeposit): string {
  if (deposit.kind === "CASH") {
    return `Cọc tiền ${money(deposit.amount)} · ${DEPOSIT_METHOD[deposit.method ?? ""] ?? ""}`;
  }
  return `Bảo lãnh ${deposit.bankName ?? ""} ${deposit.guaranteeNumber ?? ""} · ${money(deposit.amount)} · hết hạn ${date(deposit.expiryDate)}`;
}

const vatText = (content: RevisionContent) =>
  content.vatEnabled && content.vatRate
    ? `Có · ${formatVatRate(content.vatRate)}`
    : "Không";

function change(
  field: string,
  label: string,
  before: string | null,
  after: string | null,
): FieldChange[] {
  return before === after ? [] : [{ field, label, before, after }];
}

function listChange(
  field: string,
  label: string,
  before: readonly string[],
  after: readonly string[],
): FieldChange[] {
  const from = before.join("; ") || null;
  const to = after.join("; ") || null;
  return change(field, label, from, to);
}

/** The rules of an amendment, checked by diffRevisions when given. */
export interface AmendmentRules {
  effectiveFrom: string;
}

/**
 * What `after` changes from `before`, field by field as D5b and the
 * activity log show it. With `amendment`, throws for what an amendment may
 * not change; without (a draft being edited), those changes are listed
 * too. An empty list means no change.
 */
export function diffRevisions(
  before: RevisionContent,
  after: RevisionContent,
  amendment?: AmendmentRules,
): FieldChange[] {
  if (amendment) checkAmendment(before, after, amendment.effectiveFrom);
  const changes: FieldChange[] = amendment
    ? []
    : [
        ...change("site", "Công trình", before.siteId, after.siteId),
        ...change(
          "signedDate",
          "Ngày ký",
          date(before.signedDate),
          date(after.signedDate),
        ),
        ...change(
          "startDate",
          "Ngày bắt đầu",
          date(before.startDate),
          date(after.startDate),
        ),
      ];
  const beforeLines = new Map(
    before.lines.map((line) => [lineKey(line), line]),
  );
  const afterKeys = new Set(after.lines.map(lineKey));
  for (const line of before.lines) {
    if (!afterKeys.has(lineKey(line))) {
      changes.push({
        field: `line.${lineKey(line)}`,
        label: `Bỏ ${lineName(line)}`,
        before: `${quantityText(line)} × ${money(line.price) ?? "–"}`,
        after: null,
      });
    }
  }
  for (const line of after.lines) {
    const old = beforeLines.get(lineKey(line));
    const name = lineName(line);
    if (!old) {
      changes.push({
        field: `line.${lineKey(line)}`,
        label: `Thêm ${name}`,
        before: null,
        after: `${quantityText(line)} × ${money(line.price) ?? "–"}`,
      });
      continue;
    }
    changes.push(
      ...change(
        `quantity.${lineKey(line)}`,
        `Số lượng ${name}`,
        quantityText(old),
        quantityText(line),
      ),
      ...change(
        `price.${lineKey(line)}`,
        `Giá ${name}`,
        money(old.price),
        money(line.price),
      ),
    );
  }
  const beforeComp = new Map(
    before.compensations.map((entry) => [entry.itemId, entry]),
  );
  for (const entry of after.compensations) {
    const old = beforeComp.get(entry.itemId);
    changes.push(
      ...change(
        `lost.${entry.itemId}`,
        `Giá mất ${entry.itemCode}`,
        money(old?.lostPrice ?? null),
        money(entry.lostPrice),
      ),
      ...change(
        `damage.${entry.itemId}`,
        `Giá hỏng ${entry.itemCode}`,
        money(old?.damagePrice ?? null),
        money(entry.damagePrice),
      ),
    );
  }
  changes.push(
    ...change(
      "endDate",
      "Kết thúc dự kiến",
      date(before.endDate),
      date(after.endDate),
    ),
    ...change(
      "minRentalDays",
      "Thuê tối thiểu",
      before.minRentalDays === null ? null : `${before.minRentalDays} ngày`,
      after.minRentalDays === null ? null : `${after.minRentalDays} ngày`,
    ),
    ...change(
      "paymentTermsDays",
      "Hạn thanh toán",
      `${before.paymentTermsDays} ngày`,
      `${after.paymentTermsDays} ngày`,
    ),
    ...change("vat", "VAT", vatText(before), vatText(after)),
    ...change(
      "transport",
      "Vận chuyển",
      before.companyTruck
        ? `Công ty gọi xe · ${money(before.freightPerTrip) ?? "–"}`
        : "Khách tự chở",
      after.companyTruck
        ? `Công ty gọi xe · ${money(after.freightPerTrip) ?? "–"}`
        : "Khách tự chở",
    ),
    ...listChange(
      "deposits",
      "Cọc và bảo lãnh",
      before.deposits.map(depositText),
      after.deposits.map(depositText),
    ),
    ...listChange(
      "batches",
      "Kế hoạch giao",
      before.batches.map((batch) => `${date(batch.plannedDate)} ${batch.text}`),
      after.batches.map((batch) => `${date(batch.plannedDate)} ${batch.text}`),
    ),
  );
  return changes;
}

function checkAmendment(
  before: RevisionContent,
  after: RevisionContent,
  effectiveFrom: string,
): void {
  if (
    before.type !== after.type ||
    before.customerId !== after.customerId ||
    before.siteId !== after.siteId ||
    before.signedDate !== after.signedDate ||
    before.startDate !== after.startDate
  ) {
    fail(REVISION_MESSAGES.fixed);
  }
  const afterLines = new Set(after.lines.map(lineKey));
  for (const line of before.lines) {
    if (!afterLines.has(lineKey(line))) {
      fail(REVISION_MESSAGES.dropLine(lineName(line)));
    }
  }
  if (
    after.endDate !== null &&
    after.endDate !== before.endDate &&
    after.endDate <= effectiveFrom
  ) {
    fail(REVISION_MESSAGES.endBeforeEffective(effectiveFrom));
  }
}

/** Submitting an amendment needs at least one change. */
export function assertChanged(changes: readonly FieldChange[]): void {
  if (changes.length === 0) fail(REVISION_MESSAGES.noChange);
}
