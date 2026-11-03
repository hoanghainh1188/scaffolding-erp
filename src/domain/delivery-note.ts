// Delivery notes (deliveries design D1, D3–D5): the status table, kits split
// into parts, "còn phải giao", what a picker may confirm and the scrap piece
// estimate. Pure: the service reads the rows and calls these.
import { roundHalfUp } from "./average-cost";
import { CONDITION_LABELS, type Condition } from "./condition";
import {
  byWeight,
  explodeKits,
  type KitPick,
  type OwnLine,
  type PricingUnit,
  type SaleCondition,
  saleLineAmount,
} from "./contract-lines";
import { formatBusinessDate, type BusinessDate } from "./business-date";
import { DomainValueError } from "./errors";
import type { Money } from "./money";
import {
  formatQuantity,
  hasStandardWeight,
  isCountUnit,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "./quantity";
import { WEIGHT_TOLERANCE_PERCENT, withinTolerance } from "./tolerance";

export const DELIVERY_STATUSES = [
  "PLANNED",
  "PICKING",
  "POSTED",
  "CANCELLED",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABELS: Readonly<Record<DeliveryStatus, string>> =
  {
    PLANNED: "Chờ nhặt",
    PICKING: "Đang nhặt",
    POSTED: "Đã xuất",
    CANCELLED: "Đã hủy",
  };

/** Statuses of a note that is not finished: they block cancelling a contract. */
export const OPEN_DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  "PLANNED",
  "PICKING",
];

/** Rental notes ship only what may be rented (0.2 #3, inventory-ledger). */
export const RENTAL_PICK_CONDITIONS = ["NEW", "GOOD"] as const;

export const REASON_MAX = 500;
const KG_MILLI_PER_KG = 1000;

const kg = (milli: number) => `${formatQuantity(toQuantity(milli, "KG"))} kg`;
const amount = (milli: number, unit: QuantityUnit) =>
  `${formatQuantity(toQuantity(milli, unit))} ${QUANTITY_UNIT_LABELS[unit]}`;

export const DELIVERY_MESSAGES = {
  editPicking: (code: string) =>
    `Thủ kho đang nhặt phiếu ${code}. Bạn rút phiếu về để sửa.`,
  editPosted: (code: string) => `Phiếu ${code} đã xuất nên không sửa được.`,
  editCancelled: (code: string) => `Phiếu ${code} đã hủy nên không sửa được.`,
  startPicking: (code: string) =>
    `Phiếu ${code} đang được nhặt. Bạn mở lại phiếu để nhặt tiếp.`,
  notPicking: (code: string) => `Phiếu ${code} chưa bắt đầu nhặt.`,
  notStarted: "Bạn cần bắt đầu nhặt phiếu này trước khi xác nhận.",
  posted: (code: string) => `Phiếu ${code} đã xuất.`,
  cancelPosted: (code: string) =>
    `Phiếu ${code} đã xuất nên không hủy được. Hàng xuất nhầm thì lập phiếu thu hồi.`,
  cancelled: (code: string) => `Phiếu ${code} đã hủy.`,
  returnReason: "Bạn ghi lý do để văn phòng biết cần đổi gì.",
  recallReason: "Bạn ghi lý do để thủ kho biết vì sao phiếu bị rút về.",
  cancelReason: "Bạn ghi lý do hủy phiếu.",
  reasonLong: `Lý do tối đa ${REASON_MAX} ký tự.`,
  contractNotApproved: "Hợp đồng chưa được duyệt nên chưa xuất hàng được.",
  contractCancelled: "Hợp đồng đã hủy nên không xuất hàng được.",
  contractClosed: "Hợp đồng đã thanh lý nên không xuất hàng được.",
  noLines: "Bạn thêm ít nhất một bộ hoặc một mã hàng cho đợt xuất.",
  notOnContract: (code: string) =>
    `Mã ${code} chưa có trên hợp đồng. Bạn lập phụ lục nếu khách cần thêm mã này.`,
  notOnContractYet: (code: string, from: BusinessDate) =>
    `Mã ${code} chỉ có trên hợp đồng từ ${formatBusinessDate(from)}.`,
  kitPartMissing: (kit: string, code: string) =>
    `Bộ ${kit} có mã ${code} chưa có trên hợp đồng. Bạn chọn từng mã hoặc lập phụ lục thêm mã này.`,
  kitOnSale: "Hợp đồng bán chọn từng dòng hàng, không chọn theo bộ.",
  saleLineMissing: (label: string) =>
    `Dòng ${label} chưa có trên hợp đồng bán.`,
  overRental: (code: string, over: string) =>
    `Đợt này xuất ${code} nhiều hơn số còn phải giao ${over}. Bạn tích xác nhận nếu vẫn muốn xuất.`,
  overSale: (left: string, label: string) =>
    `Hợp đồng bán chỉ còn phải giao ${left} ${label}. Bạn lập phụ lục nếu khách mua thêm.`,
  overSaleAtPosting: (left: string, label: string) =>
    `Hợp đồng bán chỉ còn phải giao ${left} ${label}.`,
  rentalCondition: "Hợp đồng thuê chỉ xuất hàng Mới hoặc Tốt.",
  saleCondition: (label: string, condition: string) =>
    `Dòng ${label} chỉ xuất hàng ${condition}.`,
  wholePieces: (code: string, unit: string) =>
    `${code} tính theo ${unit}, số lượng phải là số nguyên.`,
  pickPositive: "Số nhặt phải lớn hơn 0.",
  overRequested: (picked: string, code: string, requested: string) =>
    `Bạn nhặt ${picked} ${code}, nhiều hơn số cần ${requested}. Văn phòng cần sửa phiếu nếu muốn xuất thêm.`,
  weighMissing: (label: string) =>
    `Dòng ${label} bán theo kg, bạn nhập số kg cân.`,
  overWeighed: (label: string, weighed: string, requested: string) =>
    `Kg cân của ${label} (${weighed}) vượt số cần ${requested} quá ${WEIGHT_TOLERANCE_PERCENT} %. Văn phòng cần sửa phiếu hoặc lập phụ lục.`,
  nothingPicked:
    "Phiếu chưa có hàng nào được nhặt. Bạn trả lại văn phòng nếu không xuất được.",
  noStock: (code: string) => `Bãi không còn ${code} Phế liệu để ước tính.`,
} as const;

const fail = (message: string): never => {
  throw new DomainValueError(message);
};

// ----------------------------------------------------------- status

export type DeliveryCommand =
  "EDIT" | "START" | "RETURN" | "RECALL" | "POST" | "CANCEL";

/**
 * The only table of delivery note changes (design D1). EDIT keeps PLANNED.
 * Who may run a command is checked by the caller (canContract,
 * deliveries.pick).
 */
export function transition(
  status: DeliveryStatus,
  command: DeliveryCommand,
  code: string,
): DeliveryStatus {
  switch (command) {
    case "EDIT":
      if (status === "PLANNED") return "PLANNED";
      if (status === "PICKING")
        return fail(DELIVERY_MESSAGES.editPicking(code));
      if (status === "POSTED") return fail(DELIVERY_MESSAGES.editPosted(code));
      return fail(DELIVERY_MESSAGES.editCancelled(code));
    case "START":
      if (status === "PLANNED") return "PICKING";
      return fail(endedOr(status, code, DELIVERY_MESSAGES.startPicking(code)));
    case "RETURN":
    case "RECALL":
      if (status === "PICKING") return "PLANNED";
      return fail(endedOr(status, code, DELIVERY_MESSAGES.notPicking(code)));
    case "POST":
      if (status === "PICKING") return "POSTED";
      return fail(endedOr(status, code, DELIVERY_MESSAGES.notStarted));
    case "CANCEL":
      if (status === "PLANNED" || status === "PICKING") return "CANCELLED";
      return fail(
        status === "POSTED"
          ? DELIVERY_MESSAGES.cancelPosted(code)
          : DELIVERY_MESSAGES.cancelled(code),
      );
  }
}

function endedOr(status: DeliveryStatus, code: string, other: string): string {
  if (status === "POSTED") return DELIVERY_MESSAGES.posted(code);
  if (status === "CANCELLED") return DELIVERY_MESSAGES.cancelled(code);
  return other;
}

/** A reason typed in a dialog: trimmed, required, at most 500 characters. */
export function requireReason(
  reason: string | null | undefined,
  missing: string,
): string {
  const text = (reason ?? "").trim();
  if (text.length === 0) fail(missing);
  if (text.length > REASON_MAX) fail(DELIVERY_MESSAGES.reasonLong);
  return text;
}

/** Only an approved or running contract ships goods. */
export function assertContractDeliverable(status: string): void {
  if (status === "APPROVED" || status === "ACTIVE") return;
  if (status === "CANCELLED") fail(DELIVERY_MESSAGES.contractCancelled);
  if (status === "CLOSED") fail(DELIVERY_MESSAGES.contractClosed);
  fail(DELIVERY_MESSAGES.contractNotApproved);
}

// ----------------------------------------------------------- lines

export type ContractKind = "RENTAL" | "SALE";

/** Rental: one line per item. Sale: item + condition + pricing unit. */
export function lineKey(
  itemId: string,
  condition: string | null,
  pricingUnit: string | null,
): string {
  return condition === null ? itemId : `${itemId}|${condition}|${pricingUnit}`;
}

/** A line of the contract revision in force. */
export interface TermsLine {
  itemId: string;
  itemCode: string;
  unit: QuantityUnit;
  /** Sale lines only. */
  condition: SaleCondition | null;
  pricingUnit: PricingUnit | null;
  /** In the item's unit, or kg for a sale line priced by kg. */
  quantityMilli: number;
}

/** Text of a line in messages: "H1,7" or "H1,7 Tốt". */
export function lineLabel(
  line: Pick<TermsLine, "itemCode" | "condition">,
): string {
  return line.condition === null
    ? line.itemCode
    : `${line.itemCode} ${CONDITION_LABELS[line.condition]}`;
}

/** The unit a line's quantity is in. */
export function lineUnit(
  line: Pick<TermsLine, "unit" | "pricingUnit">,
): QuantityUnit {
  return byWeight(line.pricingUnit ?? "") ? "KG" : line.unit;
}

export interface DeliveryKit extends KitPick {
  kitCode: string;
  components: readonly { itemId: string; itemCode: string; quantity: number }[];
}

export interface SaleOwnLine {
  itemId: string;
  condition: SaleCondition;
  pricingUnit: PricingUnit;
  quantityMilli: number;
}

export interface PlannedLine {
  itemId: string;
  condition: SaleCondition | null;
  pricingUnit: PricingUnit | null;
  requestedMilli: number;
}

export interface ExplodeInput {
  type: ContractKind;
  kits: readonly DeliveryKit[];
  /** Rental lines added one by one. */
  own: readonly OwnLine[];
  /** Sale lines (sale contracts only). */
  sale: readonly SaleOwnLine[];
  /** Lines of the revision in force on the day the batch is made. */
  terms: readonly TermsLine[];
  /** Item code → the day a later approved amendment adds it. */
  later?: ReadonlyMap<string, BusinessDate>;
}

/**
 * The lines of a batch (design D4): kits split by their catalog parts and
 * merged with lines added one by one; every part must be on the contract.
 */
export function explodeDelivery(input: ExplodeInput): PlannedLine[] {
  const onContract = new Map(
    input.terms.map((line) => [
      lineKey(line.itemId, line.condition, line.pricingUnit),
      line,
    ]),
  );
  const missing = (itemId: string, code: string): never => {
    const from = input.later?.get(code);
    return fail(
      from
        ? DELIVERY_MESSAGES.notOnContractYet(code, from)
        : DELIVERY_MESSAGES.notOnContract(code),
    );
  };
  if (input.type === "SALE") {
    if (input.kits.length > 0) fail(DELIVERY_MESSAGES.kitOnSale);
    if (input.sale.length === 0) fail(DELIVERY_MESSAGES.noLines);
    return input.sale.map((line) => {
      const key = lineKey(line.itemId, line.condition, line.pricingUnit);
      const terms = onContract.get(key);
      if (!terms) {
        const any = input.terms.find((row) => row.itemId === line.itemId);
        return any
          ? fail(
              DELIVERY_MESSAGES.saleLineMissing(
                lineLabel({
                  itemCode: any.itemCode,
                  condition: line.condition,
                }),
              ),
            )
          : missing(line.itemId, line.itemId);
      }
      if (!Number.isInteger(line.quantityMilli) || line.quantityMilli <= 0) {
        fail(DELIVERY_MESSAGES.pickPositive);
      }
      return { ...line, requestedMilli: line.quantityMilli };
    });
  }
  if (input.kits.length === 0 && input.own.length === 0) {
    fail(DELIVERY_MESSAGES.noLines);
  }
  for (const kit of input.kits) {
    for (const part of kit.components) {
      if (!onContract.has(part.itemId)) {
        fail(DELIVERY_MESSAGES.kitPartMissing(kit.kitCode, part.itemCode));
      }
    }
  }
  for (const line of input.own) {
    if (!onContract.has(line.itemId)) {
      missing(line.itemId, line.itemCode ?? line.itemId);
    }
  }
  // In the order of the contract lines: kit parts have no order of their own.
  const order = new Map(input.terms.map((line, index) => [line.itemId, index]));
  return explodeKits(input.kits, input.own)
    .map((line) => ({
      itemId: line.itemId,
      condition: null,
      pricingUnit: null,
      requestedMilli: line.quantityMilli,
    }))
    .sort((a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0));
}

// ----------------------------------------------------------- remaining

export interface RemainingInput {
  type: ContractKind;
  terms: readonly TermsLine[];
  /**
   * Rental: on site for this contract, by item (in − out at the site).
   * Sale: delivered so far, by line key (weighed kg for lines by kg).
   */
  done: ReadonlyMap<string, number>;
  /** Requested on PLANNED and PICKING notes, by line key. */
  open: ReadonlyMap<string, number>;
}

export interface RemainingLine {
  key: string;
  line: TermsLine;
  contractMilli: number;
  doneMilli: number;
  /** Never below 0. */
  remainingMilli: number;
  /** "đã giao vượt N" when done is above the contract. */
  overMilli: number;
  openMilli: number;
  /** Remaining minus open notes, never below 0: what a new batch may take. */
  unplannedMilli: number;
}

/** "Còn phải giao" (design D3, 0.2 #56), computed on every read. */
export function remainingToDeliver(input: RemainingInput): RemainingLine[] {
  return input.terms.map((line) => {
    const key = lineKey(line.itemId, line.condition, line.pricingUnit);
    const doneMilli = input.done.get(key) ?? 0;
    const openMilli = input.open.get(key) ?? 0;
    const left = line.quantityMilli - doneMilli;
    const remainingMilli = Math.max(left, 0);
    return {
      key,
      line,
      contractMilli: line.quantityMilli,
      doneMilli,
      remainingMilli,
      overMilli: Math.max(-left, 0),
      openMilli,
      unplannedMilli: Math.max(remainingMilli - openMilli, 0),
    };
  });
}

export interface OverLine {
  key: string;
  itemCode: string;
  overMilli: number;
  unit: QuantityUnit;
}

/**
 * A batch asking for more than is left to plan (design D3): a rental needs
 * the "xuất vượt" tick and returns what went over (for the log); a sale is
 * refused.
 */
export function checkOverDelivery(
  type: ContractKind,
  lines: readonly PlannedLine[],
  remaining: readonly RemainingLine[],
  confirmed: boolean,
): OverLine[] {
  const byKey = new Map(remaining.map((row) => [row.key, row]));
  const over: OverLine[] = [];
  for (const line of lines) {
    const row = byKey.get(
      lineKey(line.itemId, line.condition, line.pricingUnit),
    );
    if (!row) continue;
    const extra = line.requestedMilli - row.unplannedMilli;
    if (extra <= 0) continue;
    const unit = lineUnit(row.line);
    // By kg the whole sale may reach the contract + 10 % (0.2 #57).
    const kgWithin =
      byWeight(row.line.pricingUnit ?? "") &&
      withinTolerance(
        row.doneMilli + row.openMilli + line.requestedMilli,
        row.contractMilli,
      );
    if (type === "SALE" && kgWithin) continue;
    if (type === "SALE") {
      fail(
        DELIVERY_MESSAGES.overSale(
          amount(row.unplannedMilli, unit),
          lineLabel(row.line),
        ),
      );
    }
    over.push({
      key: row.key,
      itemCode: row.line.itemCode,
      overMilli: extra,
      unit,
    });
  }
  if (type === "RENTAL" && over.length > 0 && !confirmed) {
    const first = over[0] as OverLine;
    fail(
      DELIVERY_MESSAGES.overRental(
        first.itemCode,
        amount(first.overMilli, first.unit),
      ),
    );
  }
  return over;
}

// ----------------------------------------------------------- picks

export interface PickInput {
  condition: Condition;
  /** In the item's unit. */
  quantityMilli: number;
  weighedMilli: number | null;
  piecesEstimated: boolean;
}

export interface PickLine {
  lineId: string;
  itemCode: string;
  unit: QuantityUnit;
  condition: SaleCondition | null;
  pricingUnit: PricingUnit | null;
  requestedMilli: number;
  picks: readonly PickInput[];
}

/** What a line counts against its need: weighed kg for a sale by kg. */
export function pickedMilli(
  line: Pick<PickLine, "pricingUnit" | "unit" | "picks">,
): number {
  return line.picks.reduce((sum, pick) => sum + measuredOf(line, pick), 0);
}

function measuredOf(
  line: Pick<PickLine, "pricingUnit" | "unit">,
  pick: PickInput,
): number {
  if (!byWeight(line.pricingUnit ?? "")) return pick.quantityMilli;
  if (!hasStandardWeight(line.unit)) return pick.quantityMilli;
  return pick.weighedMilli ?? 0;
}

export interface LineProgress {
  /** In the line unit (kg for a sale by kg). */
  pickedMilli: number;
  leftMilli: number;
  /** Over the need but inside the tolerance (kg only). */
  extraMilli: number;
  done: boolean;
}

export function lineProgress(line: PickLine): LineProgress {
  const picked = pickedMilli(line);
  return {
    pickedMilli: picked,
    leftMilli: Math.max(line.requestedMilli - picked, 0),
    extraMilli: Math.max(picked - line.requestedMilli, 0),
    done: picked >= line.requestedMilli,
  };
}

export interface Shortage {
  lineId: string;
  itemCode: string;
  leftMilli: number;
  unit: QuantityUnit;
}

/**
 * Picks a warehouse may confirm (design D3, D5): rental NEW/GOOD only, the
 * contract condition on a sale, never more than needed (kg within 10 %),
 * weighed kg on lines by kg, at least one line picked. Returns the shortages.
 */
export function assertPicks(
  type: ContractKind,
  lines: readonly PickLine[],
): Shortage[] {
  let anything = false;
  const shortages: Shortage[] = [];
  for (const line of lines) {
    const label = lineLabel(line);
    const seen = new Set<string>();
    for (const pick of line.picks) {
      if (type === "RENTAL") {
        if (
          !(RENTAL_PICK_CONDITIONS as readonly string[]).includes(
            pick.condition,
          )
        ) {
          fail(DELIVERY_MESSAGES.rentalCondition);
        }
      } else if (pick.condition !== line.condition) {
        fail(
          DELIVERY_MESSAGES.saleCondition(
            label,
            CONDITION_LABELS[line.condition as SaleCondition],
          ),
        );
      }
      if (seen.has(pick.condition)) fail(DELIVERY_MESSAGES.pickPositive);
      seen.add(pick.condition);
      if (!Number.isInteger(pick.quantityMilli) || pick.quantityMilli <= 0) {
        fail(DELIVERY_MESSAGES.pickPositive);
      }
      if (isCountUnit(line.unit) && pick.quantityMilli % 1000 !== 0) {
        fail(
          DELIVERY_MESSAGES.wholePieces(
            line.itemCode,
            QUANTITY_UNIT_LABELS[line.unit],
          ),
        );
      }
      if (
        byWeight(line.pricingUnit ?? "") &&
        hasStandardWeight(line.unit) &&
        (pick.weighedMilli === null || pick.weighedMilli <= 0)
      ) {
        fail(DELIVERY_MESSAGES.weighMissing(label));
      }
      anything = true;
    }
    const picked = pickedMilli(line);
    if (byWeight(line.pricingUnit ?? "")) {
      if (!withinTolerance(picked, line.requestedMilli)) {
        fail(
          DELIVERY_MESSAGES.overWeighed(
            label,
            kg(picked),
            kg(line.requestedMilli),
          ),
        );
      }
    } else if (picked > line.requestedMilli) {
      fail(
        DELIVERY_MESSAGES.overRequested(
          amount(picked, line.unit),
          line.itemCode,
          amount(line.requestedMilli, line.unit),
        ),
      );
    }
    if (picked < line.requestedMilli) {
      shortages.push({
        lineId: line.lineId,
        itemCode: line.itemCode,
        leftMilli: line.requestedMilli - picked,
        unit: lineUnit(line),
      });
    }
  }
  if (!anything) fail(DELIVERY_MESSAGES.nothingPicked);
  return shortages;
}

export interface SaleCheckLine {
  line: TermsLine;
  /** What this note delivers on the line (weighed kg for a sale by kg). */
  deliveredMilli: number;
  /** Delivered by earlier notes (weighed kg for a sale by kg). */
  doneMilli: number;
}

/**
 * A sale cannot go past the contract when posted. By kg, the whole of what
 * was delivered, this trip included, may reach the contract + 10 % (0.2
 * #57): a last trip weighing 25 kg when 20 kg were left still goes.
 */
export function assertSaleWithinRemaining(
  lines: readonly SaleCheckLine[],
): void {
  for (const { line, deliveredMilli, doneMilli } of lines) {
    const total = doneMilli + deliveredMilli;
    const ok = byWeight(line.pricingUnit ?? "")
      ? withinTolerance(total, line.quantityMilli)
      : total <= line.quantityMilli;
    if (!ok) {
      fail(
        DELIVERY_MESSAGES.overSaleAtPosting(
          amount(Math.max(line.quantityMilli - doneMilli, 0), lineUnit(line)),
          lineLabel(line),
        ),
      );
    }
  }
}

// ----------------------------------------------------------- scrap

export interface PieceEstimate {
  /** Whole pieces, in thousandths like every quantity. */
  quantityMilli: number;
  /** Pieces before the yard stock cap. */
  estimatedMilli: number;
  /** Cut down to the yard stock. */
  capped: boolean;
}

/**
 * Pieces of scrap from the weighed kg (design D5, 0.2 #59): kg ÷ standard
 * weight, to the nearest piece, at least 1, never above the yard stock.
 */
export function estimatedPieces(
  weighedMilli: number,
  standardWeightMilli: number,
  stockMilli: number,
): PieceEstimate {
  if (standardWeightMilli <= 0 || weighedMilli <= 0) {
    return fail(DELIVERY_MESSAGES.pickPositive);
  }
  const pieces = Number(
    roundHalfUp(BigInt(weighedMilli), BigInt(standardWeightMilli)),
  );
  const estimated = Math.max(pieces, 1) * KG_MILLI_PER_KG;
  const stockPieces =
    Math.floor(stockMilli / KG_MILLI_PER_KG) * KG_MILLI_PER_KG;
  if (stockPieces <= 0) {
    return { quantityMilli: 0, estimatedMilli: estimated, capped: true };
  }
  return estimated > stockPieces
    ? { quantityMilli: stockPieces, estimatedMilli: estimated, capped: true }
    : { quantityMilli: estimated, estimatedMilli: estimated, capped: false };
}

/** "Ước tính 45 cái nhưng bãi chỉ còn 42 cái Phế liệu, máy điền 42." */
export function cappedEstimateText(estimate: PieceEstimate): string {
  const est = estimate.estimatedMilli / KG_MILLI_PER_KG;
  const filled = estimate.quantityMilli / KG_MILLI_PER_KG;
  return `Ước tính ${est} cái nhưng bãi chỉ còn ${filled} cái Phế liệu, máy điền ${filled}.`;
}

// ----------------------------------------------------------- money

export interface SaleAmountLine {
  pricingUnit: PricingUnit;
  /** The item's unit: an item counted in kg is weighed by its quantity. */
  unit: QuantityUnit;
  quantityMilli: number;
  weighedMilli: number | null;
  unitPrice: Money;
}

/**
 * Money of a delivered sale line (design D6): weighed kg × price by kg,
 * else quantity × price; to 1 ₫, half up. Never stored as a running total.
 */
export function deliveredSaleAmount(line: SaleAmountLine): Money {
  const measured =
    byWeight(line.pricingUnit) && hasStandardWeight(line.unit)
      ? (line.weighedMilli ?? 0)
      : line.quantityMilli;
  return saleLineAmount(measured, line.unitPrice);
}
