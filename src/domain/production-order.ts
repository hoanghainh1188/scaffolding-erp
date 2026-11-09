// Production orders (production-orders design D2–D5, D10; 0.2 số 139–số 146,
// số 152–số 155). The office assigns, the workshop makes and reports, the
// storekeeper counts, the director approves overuse, the accountant posts.
// Finished value = materials + labour − offcuts, to the đồng. Pure functions
// shared by D20, M10 and the server.
import { lineAmount, roundHalfUp } from "./average-cost";
import { DomainValueError } from "./errors";
import { lineWeightKgMilli } from "./landed-cost";
import { toMoney, type Money } from "./money";
import type { MovementDraft } from "./movement";
import {
  formatQuantity,
  isCountUnit,
  QUANTITY_UNIT_LABELS,
  type QuantityUnit,
} from "./quantity";
import { ProductionFieldError, type ItemCategory } from "./production-bom";
import {
  issueAmount,
  laborAmount,
  splitMaterialIssue,
} from "./work-order-common";

const K = 1000;

export const PRODUCTION_PREFIX = "LSX";
export const PRODUCTION_DOCUMENT_TYPE = "PRODUCTION";
export const PRODUCTION_TEAM_MAX = 100;
export const PRODUCTION_NOTE_MAX = 500;
/** Overuse above this percent of the norm needs the director (0.2 số 140). */
export const OVERUSE_LIMIT_PERCENT = 5;

export const PRODUCTION_STATUSES = [
  "DRAFT",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CHECK",
  "AWAITING_APPROVAL",
  "COUNTED",
  "POSTED",
  "CANCELLED",
] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export function isProductionStatus(value: unknown): value is ProductionStatus {
  return (PRODUCTION_STATUSES as readonly unknown[]).includes(value);
}

/** COUNTED reads "Chờ ghi sổ": the next move is the accountant's. */
export const PRODUCTION_STATUS_LABELS: Readonly<
  Record<ProductionStatus, string>
> = {
  DRAFT: "Nháp",
  ASSIGNED: "Đã giao",
  IN_PROGRESS: "Đang làm",
  AWAITING_CHECK: "Chờ đếm",
  AWAITING_APPROVAL: "Chờ Giám đốc duyệt",
  COUNTED: "Chờ ghi sổ",
  POSTED: "Đã ghi sổ",
  CANCELLED: "Đã hủy",
};

export const PRODUCTION_STEPS = [
  "assign",
  "recall",
  "receive",
  "report",
  "count",
  "approve",
  "return",
  "post",
  "cancel",
] as const;
export type ProductionStep = (typeof PRODUCTION_STEPS)[number];

const OPEN: readonly ProductionStatus[] = [
  "DRAFT",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CHECK",
  "AWAITING_APPROVAL",
  "COUNTED",
];

const STEP_RULES: Readonly<
  Record<
    ProductionStep,
    { from: readonly ProductionStatus[]; to: ProductionStatus }
  >
> = {
  assign: { from: ["DRAFT"], to: "ASSIGNED" },
  recall: { from: ["ASSIGNED"], to: "DRAFT" },
  receive: { from: ["ASSIGNED"], to: "IN_PROGRESS" },
  report: { from: ["IN_PROGRESS"], to: "AWAITING_CHECK" },
  count: { from: ["AWAITING_CHECK"], to: "COUNTED" },
  approve: { from: ["AWAITING_APPROVAL"], to: "COUNTED" },
  return: {
    from: ["AWAITING_CHECK", "AWAITING_APPROVAL", "COUNTED"],
    to: "IN_PROGRESS",
  },
  post: { from: ["COUNTED"], to: "POSTED" },
  cancel: { from: OPEN, to: "CANCELLED" },
};

export const PRODUCTION_MESSAGES = {
  posted: "Lệnh đã được ghi sổ",
  cancelled: "Lệnh đã hủy",
  stale: "Lệnh vừa được người khác cập nhật, tải lại trang",
  finishedIsMaterial: (code: string) =>
    `${code} vừa là thành phẩm vừa là nguyên liệu của lệnh`,
  notAssignedAnymore: "Lệnh không còn ở trạng thái Đã giao",
  notCounted: "Lệnh chưa ở trạng thái Chờ ghi sổ",
  received:
    "Xưởng đã nhận lệnh, không thu hồi được. Hủy lệnh nếu không làm nữa",
  linesLocked: "Lệnh đã giao xưởng, không sửa được. Thu hồi lệnh để sửa",
  notDeletable:
    "Lệnh đã giao xưởng, không xóa được. Hủy lệnh nếu không làm nữa",
  wrongState: (status: ProductionStatus) =>
    `Lệnh đang ${PRODUCTION_STATUS_LABELS[status]}, không làm được bước này`,
  planned: "Số kế hoạch phải là số nguyên lớn hơn 0",
  noLines: "Lệnh cần ít nhất 1 thành phẩm",
  duplicateLine: (code: string) => `${code} đã có trong lệnh`,
  noBom: (code: string) => `${code} chưa có định mức`,
  notWorkshop: "Chọn một xưởng đang dùng",
  notYard: "Thành phẩm phải nhập về một bãi",
  teamTooLong: `Tổ làm tối đa ${PRODUCTION_TEAM_MAX} ký tự`,
  noteTooLong: `Ghi chú tối đa ${PRODUCTION_NOTE_MAX} ký tự`,
  noteMissing: {
    return: "Nhập ghi chú trả lại",
    approve: "Nhập ghi chú duyệt",
    cancel: "Nhập lý do hủy",
  },
  lineMissing: (code: string) => `Ghi số làm xong cho ${code}`,
  lineUnknown: "Dòng thành phẩm không có trong lệnh",
  lineTwice: (code: string) => `${code} có hai mục trong số gửi lên`,
  finishedWhole: (code: string, unit: string) =>
    `${code} tính theo ${unit}, số làm xong là số nguyên từ 0 trở lên`,
  offcut: (code: string) => `Đầu thừa của ${code} phải từ 0 trở lên`,
  materialKind: "Nguyên liệu phải là mã nhóm Vật tư",
  materialWhole: (code: string, unit: string) =>
    `${code} tính theo ${unit}, nhập số nguyên`,
  materialNegative: (code: string) => `Số dùng của ${code} phải từ 0 trở lên`,
  materialTwice: (line: string, material: string) =>
    `${line}: ${material} có hai mục`,
  materialShort: (code: string, place: string, have: string, need: string) =>
    `${code} ở ${place} còn ${have}, lệnh cần ${need}`,
  zeroFinished: (code: string, unit: string) =>
    `${code} làm xong 0 ${unit}: bỏ nguyên liệu của dòng, nguyên liệu hỏng thì lập phiếu điều chỉnh`,
  offcutHeavy: (code: string, offcut: string, material: string) =>
    `Đầu thừa của ${code} (${offcut} kg) nặng hơn nguyên liệu (${material} kg)`,
  valueNotPositive: (code: string) =>
    `Giá trị thành phẩm của ${code} phải lớn hơn 0`,
  noScrapPrice: "Chưa có giá sắt vụn, Giám đốc đặt giá trước khi ghi sổ",
  noScrapItem: "Chưa chọn Mã sắt vụn, Giám đốc chọn ở trang Giá sắt vụn",
  needsApproval:
    "Lệnh có nguyên liệu vượt định mức, cần Giám đốc duyệt trước khi ghi sổ",
  noLabor: (code: string) => `${code} chưa chụp đơn giá công, giao lại lệnh`,
} as const;

/** A step not allowed from the current status; the API answers 409. */
export class ProductionStateError extends DomainValueError {
  readonly status: ProductionStatus;

  constructor(message: string, status: ProductionStatus) {
    super(message);
    this.status = status;
  }
}

function stateMessage(status: ProductionStatus, step: ProductionStep): string {
  if (status === "POSTED") return PRODUCTION_MESSAGES.posted;
  if (status === "CANCELLED") return PRODUCTION_MESSAGES.cancelled;
  if (step === "post") return PRODUCTION_MESSAGES.notCounted;
  if (step === "receive") return PRODUCTION_MESSAGES.notAssignedAnymore;
  if (step === "recall") return PRODUCTION_MESSAGES.received;
  return PRODUCTION_MESSAGES.wrongState(status);
}

/**
 * The status after a step, or a ProductionStateError. A count with overuse
 * waits for the director instead of the accountant.
 */
export function transition(
  status: ProductionStatus,
  step: ProductionStep,
  options: { overuse?: boolean } = {},
): ProductionStatus {
  const rule = STEP_RULES[step];
  if (!rule.from.includes(status)) {
    throw new ProductionStateError(stateMessage(status, step), status);
  }
  return step === "count" && options.overuse ? "AWAITING_APPROVAL" : rule.to;
}

/** Whole pieces, more than none (spec "Số kế hoạch lẻ"). */
export function checkPlanned(milli: number, field: string): void {
  if (!Number.isInteger(milli) || milli <= 0 || milli % K !== 0) {
    throw new ProductionFieldError(PRODUCTION_MESSAGES.planned, field);
  }
}

/** Notes of return, approve and cancel: 1–500 characters. */
export function checkStepNote(
  text: string | null | undefined,
  step: "return" | "approve" | "cancel",
): string {
  const note = (text ?? "").trim();
  const field = step === "cancel" ? "reason" : "note";
  if (note.length === 0) {
    throw new ProductionFieldError(
      PRODUCTION_MESSAGES.noteMissing[step],
      field,
    );
  }
  if (note.length > PRODUCTION_NOTE_MAX) {
    throw new ProductionFieldError(PRODUCTION_MESSAGES.noteTooLong, field);
  }
  return note;
}

/**
 * Norm of a material for some finished pieces. Count units round up to a
 * whole number: the ledger never issues part of a piece, and M10 fills in
 * exactly this number, so using it is never overuse (design D5).
 */
export function normMilli(
  perUnitMilli: number,
  finishedMilli: number,
  unit: QuantityUnit,
): number {
  const product = BigInt(perUnitMilli) * BigInt(finishedMilli);
  const exact = roundHalfUp(product, BigInt(K));
  if (!isCountUnit(unit)) return Number(exact);
  const k = BigInt(K);
  return Number(((product + k * k - 1n) / (k * k)) * k);
}

export interface Overuse {
  /** Tenths of a percent against the norm; null without a norm. */
  readonly percentTenths: number | null;
  readonly over: boolean;
}

/** Spec "Vượt định mức": over when actual × 100 > norm × 105. */
export function overuse(actualMilli: number, norm: number): Overuse {
  if (norm === 0) return { percentTenths: null, over: actualMilli > 0 };
  const actual = BigInt(actualMilli);
  const base = BigInt(norm);
  return {
    percentTenths: Number(roundHalfUp((actual - base) * 1000n, base)),
    over: actual * 100n > base * BigInt(100 + OVERUSE_LIMIT_PERCENT),
  };
}

/** "+ 8,6 %", "− 6,3 %", "0 %"; "—" outside the norm. */
export function overuseText(percentTenths: number | null): string {
  if (percentTenths === null) return "—";
  const abs = Math.abs(percentTenths);
  const text = `${Math.floor(abs / 10).toLocaleString("vi-VN")},${abs % 10} %`;
  if (percentTenths === 0) return "0 %";
  return `${percentTenths < 0 ? "−" : "+"} ${text}`;
}

/**
 * "Giá trị dùng vượt" of an order, for reading only: what went over the
 * norm × the average, rounded per material (design D5).
 */
export function overuseValue(
  rows: readonly {
    actualMilli: number;
    normMilli: number;
    avgCost: Money | null;
  }[],
): Money {
  return toMoney(
    rows.reduce((sum, row) => {
      const extra = row.actualMilli - row.normMilli;
      return extra > 0
        ? sum + lineAmount(extra, row.avgCost ?? toMoney(0))
        : sum;
    }, 0),
  );
}

export interface FloorMaterial {
  readonly itemId: string;
  readonly itemCode: string;
  readonly unit: QuantityUnit;
  readonly category: ItemCategory;
  readonly quantityMilli: number;
}

export interface FloorLine {
  readonly itemId: string;
  readonly finishedMilli: number;
  readonly offcutMilli: number;
  readonly materials: readonly FloorMaterial[];
}

export interface FloorOrderLine {
  readonly itemId: string;
  readonly itemCode: string;
  readonly unit: QuantityUnit;
}

/**
 * What the workshop reports or the storekeeper counts (spec "API điện thoại
 * không có tiền"): one entry per order line, whole finished pieces, material
 * items only, whole numbers for count units. Throws on the first broken rule.
 */
export function checkFloorReport(
  orderLines: readonly FloorOrderLine[],
  sent: readonly FloorLine[],
): void {
  const known = new Set(orderLines.map((line) => line.itemId));
  sent.forEach((line, index) => {
    if (!known.has(line.itemId)) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.lineUnknown,
        `lines.${index}.itemId`,
      );
    }
  });
  orderLines.forEach((order, index) => {
    const entries = sent.filter((line) => line.itemId === order.itemId);
    if (entries.length === 0) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.lineMissing(order.itemCode),
        `lines.${index}`,
      );
    }
    if (entries.length > 1) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.lineTwice(order.itemCode),
        `lines.${index}`,
      );
    }
    const line = entries[0] as FloorLine;
    if (line.finishedMilli < 0 || line.finishedMilli % K !== 0) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.finishedWhole(
          order.itemCode,
          QUANTITY_UNIT_LABELS[order.unit],
        ),
        `lines.${index}.finished`,
      );
    }
    if (line.offcutMilli < 0) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.offcut(order.itemCode),
        `lines.${index}.offcutKg`,
      );
    }
    checkFloorMaterials(order.itemCode, line, index);
  });
}

function checkFloorMaterials(
  lineCode: string,
  line: FloorLine,
  index: number,
): void {
  const seen = new Set<string>();
  line.materials.forEach((material, at) => {
    const field = `lines.${index}.materials.${at}`;
    if (material.category !== "MATERIAL") {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.materialKind,
        `${field}.itemId`,
      );
    }
    if (seen.has(material.itemId)) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.materialTwice(lineCode, material.itemCode),
        `${field}.itemId`,
      );
    }
    seen.add(material.itemId);
    if (material.quantityMilli < 0) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.materialNegative(material.itemCode),
        `${field}.quantity`,
      );
    }
    if (isCountUnit(material.unit) && material.quantityMilli % K !== 0) {
      throw new ProductionFieldError(
        PRODUCTION_MESSAGES.materialWhole(
          material.itemCode,
          QUANTITY_UNIT_LABELS[material.unit],
        ),
        `${field}.quantity`,
      );
    }
  });
}

const kgText = (milli: number) => formatQuantity({ unit: "KG", milli });

const amountText = (milli: number, unit: QuantityUnit) =>
  `${formatQuantity({ unit, milli })} ${QUANTITY_UNIT_LABELS[unit]}`;

export interface PostingMaterial {
  readonly rowId: string;
  readonly itemId: string;
  readonly itemCode: string;
  readonly unit: QuantityUnit;
  readonly standardWeightKg: string | null;
  /** What the storekeeper counted. */
  readonly quantityMilli: number;
  /** Per piece as taken on assignment; null: added by the workshop. */
  readonly normPerUnitMilli: number | null;
}

export interface PostingLine {
  readonly lineId: string;
  readonly itemId: string;
  readonly itemCode: string;
  readonly unit: QuantityUnit;
  readonly finishedMilli: number;
  readonly offcutMilli: number;
  readonly laborRate: Money | null;
  readonly materials: readonly PostingMaterial[];
}

/** New and Good of one material at the workshop, under the posting locks. */
export interface PostingStock {
  readonly newMilli: number;
  readonly goodMilli: number;
  readonly newAvg: Money | null;
  readonly goodAvg: Money | null;
}

export interface PostingContext {
  readonly orderCode: string;
  readonly workshopId: string;
  readonly workshopCode: string;
  readonly toLocationId: string;
  readonly scrapItemId: string | null;
  readonly scrapPricePerKg: Money | null;
  readonly stock: ReadonlyMap<string, PostingStock>;
}

/** Any material above the norm by more than the limit (design D5). */
export function hasOveruse(lines: readonly PostingLine[]): boolean {
  return lines.some((line) =>
    line.materials.some(
      (material) =>
        overuse(
          material.quantityMilli,
          material.normPerUnitMilli === null
            ? 0
            : normMilli(
                material.normPerUnitMilli,
                line.finishedMilli,
                material.unit,
              ),
        ).over,
    ),
  );
}

/** Total of each material across the order. */
function needs(
  lines: readonly PostingLine[],
): Map<string, { itemCode: string; unit: QuantityUnit; milli: number }> {
  const total = new Map<
    string,
    { itemCode: string; unit: QuantityUnit; milli: number }
  >();
  for (const line of lines) {
    for (const material of line.materials) {
      total.set(material.itemId, {
        itemCode: material.itemCode,
        unit: material.unit,
        milli:
          (total.get(material.itemId)?.milli ?? 0) + material.quantityMilli,
      });
    }
  }
  return total;
}

function checkOffcutWeight(line: PostingLine): void {
  const weight = line.materials.reduce(
    (sum, material) =>
      sum +
      lineWeightKgMilli(
        material.unit,
        material.quantityMilli,
        material.standardWeightKg,
      ),
    0,
  );
  if (line.offcutMilli > weight) {
    throw new DomainValueError(
      PRODUCTION_MESSAGES.offcutHeavy(
        line.itemCode,
        kgText(line.offcutMilli),
        kgText(weight),
      ),
    );
  }
}

/**
 * What must hold before posting (spec "Điều kiện ghi sổ lệnh sản xuất").
 * Nothing is written when any of these fails.
 */
export function checkPosting(
  lines: readonly PostingLine[],
  context: PostingContext,
  approved: boolean,
): void {
  for (const line of lines) {
    if (line.finishedMilli === 0) {
      throw new DomainValueError(
        PRODUCTION_MESSAGES.zeroFinished(
          line.itemCode,
          QUANTITY_UNIT_LABELS[line.unit],
        ),
      );
    }
  }
  if (!approved && hasOveruse(lines)) {
    throw new ProductionStateError(
      PRODUCTION_MESSAGES.needsApproval,
      "COUNTED",
    );
  }
  if (lines.some((line) => line.offcutMilli > 0)) {
    if (context.scrapPricePerKg === null) {
      throw new DomainValueError(PRODUCTION_MESSAGES.noScrapPrice);
    }
    if (context.scrapItemId === null) {
      throw new DomainValueError(PRODUCTION_MESSAGES.noScrapItem);
    }
  }
  lines.forEach(checkOffcutWeight);
  for (const [itemId, need] of needs(lines)) {
    const stock = context.stock.get(itemId);
    const have = (stock?.newMilli ?? 0) + (stock?.goodMilli ?? 0);
    if (need.milli > have) {
      throw new DomainValueError(
        PRODUCTION_MESSAGES.materialShort(
          need.itemCode,
          context.workshopCode,
          amountText(Math.max(have, 0), need.unit),
          amountText(need.milli, need.unit),
        ),
      );
    }
  }
}

export interface CostedMaterial {
  readonly rowId: string;
  readonly itemId: string;
  readonly itemCode: string;
  readonly quantityMilli: number;
  readonly newMilli: number;
  readonly goodMilli: number;
  readonly amount: Money;
}

export interface CostedLine {
  readonly lineId: string;
  readonly itemId: string;
  readonly itemCode: string;
  readonly finishedMilli: number;
  readonly offcutMilli: number;
  readonly materialAmount: Money;
  readonly laborAmount: Money;
  readonly offcutAmount: Money;
  readonly finishedAmount: Money;
  readonly materials: readonly CostedMaterial[];
}

export interface ProductionPosting {
  readonly lines: readonly CostedLine[];
  readonly drafts: readonly MovementDraft[];
  readonly totals: {
    readonly finishedMilli: number;
    readonly offcutMilli: number;
    readonly material: Money;
    readonly labor: Money;
    readonly offcut: Money;
    readonly finished: Money;
  };
}

type Left = Map<string, { newMilli: number; goodMilli: number }>;

function costMaterials(
  line: PostingLine,
  context: PostingContext,
  left: Left,
): CostedMaterial[] {
  return line.materials
    .filter((material) => material.quantityMilli > 0)
    .map((material) => {
      const stock = context.stock.get(material.itemId);
      const remaining = left.get(material.itemId) ?? {
        newMilli: stock?.newMilli ?? 0,
        goodMilli: stock?.goodMilli ?? 0,
      };
      const split = splitMaterialIssue(
        material.quantityMilli,
        remaining,
        (have) =>
          PRODUCTION_MESSAGES.materialShort(
            material.itemCode,
            context.workshopCode,
            amountText(have, material.unit),
            amountText(material.quantityMilli, material.unit),
          ),
      );
      left.set(material.itemId, {
        newMilli: remaining.newMilli - split.newMilli,
        goodMilli: remaining.goodMilli - split.goodMilli,
      });
      const amount =
        (split.newMilli > 0
          ? issueAmount(split.newMilli, stock?.newAvg ?? toMoney(0))
          : 0) +
        (split.goodMilli > 0
          ? issueAmount(split.goodMilli, stock?.goodAvg ?? toMoney(0))
          : 0);
      return {
        rowId: material.rowId,
        itemId: material.itemId,
        itemCode: material.itemCode,
        quantityMilli: material.quantityMilli,
        ...split,
        amount: toMoney(amount),
      };
    });
}

/** Lines in order, each taking New first from what earlier lines left. */
function costLines(
  lines: readonly PostingLine[],
  context: PostingContext,
  strict: boolean,
): CostedLine[] {
  const left: Left = new Map();
  return lines.map((line) => {
    if (line.laborRate === null && strict) {
      throw new DomainValueError(PRODUCTION_MESSAGES.noLabor(line.itemCode));
    }
    const materials = costMaterials(line, context, left);
    const materialAmount = materials.reduce((sum, m) => sum + m.amount, 0);
    const labor = laborAmount(line.finishedMilli, line.laborRate ?? toMoney(0));
    const offcut =
      line.offcutMilli > 0
        ? lineAmount(line.offcutMilli, context.scrapPricePerKg ?? toMoney(0))
        : toMoney(0);
    const finished = materialAmount + labor - offcut;
    if (finished <= 0 && strict) {
      throw new DomainValueError(
        PRODUCTION_MESSAGES.valueNotPositive(line.itemCode),
      );
    }
    return {
      lineId: line.lineId,
      itemId: line.itemId,
      itemCode: line.itemCode,
      finishedMilli: line.finishedMilli,
      offcutMilli: line.offcutMilli,
      materialAmount: toMoney(materialAmount),
      laborAmount: labor,
      offcutAmount: offcut,
      finishedAmount: toMoney(finished),
      materials,
    };
  });
}

function materialDrafts(
  line: CostedLine,
  context: PostingContext,
): MovementDraft[] {
  const description = `${context.orderCode}: nguyên liệu làm ${line.itemCode}`;
  return line.materials.flatMap((material) => {
    const parts = [
      { condition: "NEW" as const, milli: material.newMilli },
      { condition: "GOOD" as const, milli: material.goodMilli },
    ].filter((part) => part.milli > 0);
    return parts.map((part): MovementDraft => ({
      itemId: material.itemId,
      condition: part.condition,
      locationId: context.workshopId,
      movement: "PRODUCTION_OUT",
      quantityMilli: -part.milli,
      description,
    }));
  });
}

function incomingDrafts(
  line: CostedLine,
  context: PostingContext,
): MovementDraft[] {
  const finished: MovementDraft = {
    itemId: line.itemId,
    condition: "NEW",
    locationId: context.toLocationId,
    movement: "PRODUCTION_IN",
    quantityMilli: line.finishedMilli,
    amount: line.finishedAmount,
    description: `${context.orderCode}: nhập sản xuất ${line.itemCode}`,
  };
  if (line.offcutMilli === 0 || context.scrapItemId === null) return [finished];
  return [
    finished,
    {
      itemId: context.scrapItemId,
      condition: "SCRAP",
      locationId: context.toLocationId,
      movement: "PRODUCTION_IN",
      quantityMilli: line.offcutMilli,
      amount: line.offcutAmount,
      description: `${context.orderCode}: đầu thừa làm ${line.itemCode}`,
    },
  ];
}

function assertNoFinishedMaterial(lines: readonly PostingLine[]): void {
  const used = new Set(
    lines.flatMap((line) => line.materials.map((material) => material.itemId)),
  );
  const both = lines.find((line) => used.has(line.itemId));
  if (both) {
    throw new DomainValueError(
      PRODUCTION_MESSAGES.finishedIsMaterial(both.itemCode),
    );
  }
}

/**
 * The ledger lines and the figures of posting an order (design D2, D3, D10):
 * materials out at the workshop at the average, New first; finished goods
 * New and offcuts Scrap in at the yard. All ledger lines add up to + labour:
 * materials are priced at the average before posting, so every OUT comes
 * before any IN and no item may be both finished and a material.
 */
export function productionPostingLines(
  lines: readonly PostingLine[],
  context: PostingContext,
): ProductionPosting {
  assertNoFinishedMaterial(lines);
  const costed = costLines(lines, context, true);
  const sum = (pick: (line: CostedLine) => number) =>
    costed.reduce((total, line) => total + pick(line), 0);
  return {
    lines: costed,
    drafts: [
      ...costed.flatMap((line) => materialDrafts(line, context)),
      ...costed.flatMap((line) => incomingDrafts(line, context)),
    ],
    totals: {
      finishedMilli: sum((line) => line.finishedMilli),
      offcutMilli: sum((line) => line.offcutMilli),
      material: toMoney(sum((line) => line.materialAmount)),
      labor: toMoney(sum((line) => line.laborAmount)),
      offcut: toMoney(sum((line) => line.offcutAmount)),
      finished: toMoney(sum((line) => line.finishedAmount)),
    },
  };
}

/**
 * "Tạm tính" on D20 before posting (design D5): split and priced the way
 * posting will, but it never refuses. Stock the workshop lacks is valued at
 * the average, so an order short of a material still shows a figure.
 */
export function previewProductionCost(
  lines: readonly PostingLine[],
  context: PostingContext,
): CostedLine[] {
  const stock = new Map(context.stock);
  for (const [itemId, need] of needs(lines)) {
    const held = stock.get(itemId);
    const have = (held?.newMilli ?? 0) + (held?.goodMilli ?? 0);
    if (need.milli <= have) continue;
    stock.set(itemId, {
      newMilli: held?.newMilli ?? 0,
      goodMilli: (held?.goodMilli ?? 0) + need.milli - have,
      newAvg: held?.newAvg ?? null,
      goodAvg: held?.goodAvg ?? held?.newAvg ?? null,
    });
  }
  return costLines(lines, { ...context, stock }, false);
}
