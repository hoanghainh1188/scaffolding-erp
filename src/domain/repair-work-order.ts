// Repair work orders (repair-work-orders design D1–D7; requirements 0.2
// số 117–số 130): the office assigns, the workshop takes the stock, repairs
// and reports, the storekeeper counts, the accountant posts. The cost of a
// line is piece-rate labour plus the supplies issued at the average cost;
// the rest of the figures (B, scrap, damage, Good price) come from the
// simple-repair rules in ./repair-order. Pure functions, shared by D12, M8
// and the server.
import { DomainValueError } from "./errors";
import type { MovementDraft } from "./movement";
import {
  formatQuantity,
  isCountUnit,
  QUANTITY_UNIT_LABELS,
  type QuantityUnit,
} from "./quantity";
import {
  REPAIR_MESSAGES,
  RepairFieldError,
  type RepairLineCost,
} from "./repair-order";
import {
  issueAmount,
  laborAmount,
  splitMaterialIssue as splitIssue,
  type MaterialIssue,
  type MaterialStock,
} from "./work-order-common";

export { issueAmount, laborAmount };
export type { MaterialIssue, MaterialStock };

const K = 1000;

export const WORK_ORDER_STATUSES = [
  "DRAFT",
  "ASSIGNED",
  "IN_PROGRESS",
  "AWAITING_CHECK",
  "COUNTED",
  "POSTED",
  "CANCELLED",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export function isWorkOrderStatus(value: unknown): value is WorkOrderStatus {
  return (WORK_ORDER_STATUSES as readonly unknown[]).includes(value);
}

/** COUNTED reads "Chờ ghi sổ": the next move is the accountant's. */
export const WORK_ORDER_STATUS_LABELS: Readonly<
  Record<WorkOrderStatus, string>
> = {
  DRAFT: "Nháp",
  ASSIGNED: "Đã giao",
  IN_PROGRESS: "Đang sửa",
  AWAITING_CHECK: "Chờ nghiệm thu",
  COUNTED: "Chờ ghi sổ",
  POSTED: "Đã ghi sổ",
  CANCELLED: "Đã hủy",
};

export const WORK_ORDER_STEPS = [
  "assign",
  "recall",
  "receive",
  "report",
  "count",
  "return",
  "post",
  "cancel",
] as const;
export type WorkOrderStep = (typeof WORK_ORDER_STEPS)[number];

/** Who may take a step (spec "Bước chuyển của văn phòng / xưởng"). */
export const WORK_ORDER_STEP_PERMISSION: Readonly<
  Record<WorkOrderStep, "repairs.manage" | "repairs.work" | "repairs.count">
> = {
  assign: "repairs.manage",
  recall: "repairs.manage",
  receive: "repairs.work",
  report: "repairs.work",
  count: "repairs.count",
  return: "repairs.manage",
  post: "repairs.manage",
  cancel: "repairs.manage",
};

const STEP_RULES: Readonly<
  Record<
    WorkOrderStep,
    { from: readonly WorkOrderStatus[]; to: WorkOrderStatus }
  >
> = {
  assign: { from: ["DRAFT"], to: "ASSIGNED" },
  recall: { from: ["ASSIGNED"], to: "DRAFT" },
  receive: { from: ["ASSIGNED"], to: "IN_PROGRESS" },
  report: { from: ["IN_PROGRESS"], to: "AWAITING_CHECK" },
  count: { from: ["AWAITING_CHECK"], to: "COUNTED" },
  return: { from: ["AWAITING_CHECK", "COUNTED"], to: "IN_PROGRESS" },
  post: { from: ["COUNTED"], to: "POSTED" },
  cancel: {
    from: ["DRAFT", "ASSIGNED", "IN_PROGRESS", "AWAITING_CHECK", "COUNTED"],
    to: "CANCELLED",
  },
};

export const WORK_ORDER_MESSAGES = {
  posted: "Lệnh đã được ghi sổ",
  cancelled: "Lệnh đã hủy",
  notAssigned: "Lệnh chưa giao xưởng",
  received:
    "Xưởng đã nhận lệnh, không thu hồi được. Hủy lệnh nếu không sửa nữa",
  notReported: "Xưởng chưa báo sửa xong",
  notCounted: "Lệnh đang Chờ nghiệm thu, Thủ kho chưa đếm xong",
  linesLocked: "Lệnh đã giao xưởng, không sửa dòng được. Thu hồi lệnh để sửa",
  notDeletable:
    "Lệnh đã giao xưởng, không xóa được. Hủy lệnh nếu không sửa nữa",
  stale: "Lệnh vừa được người khác sửa, tải lại",
  wrongState: (status: WorkOrderStatus) =>
    `Lệnh đang ${WORK_ORDER_STATUS_LABELS[status]}, không làm được bước này`,
  noLaborRate: (code: string) =>
    `${code} chưa có đơn giá công sửa, đặt ở Danh mục (D9)`,
  notWorkshop: "Chọn một xưởng đang dùng",
  badSource: "Chỉ lấy hàng sửa tại bãi hoặc tại chính xưởng của lệnh",
  notMaterial: (code: string) => `${code} không phải vật tư phụ`,
  materialQuantity: (code: string) => `${code}: số lượng vật tư phải lớn hơn 0`,
  materialDuplicate: (item: string, material: string) =>
    `${item}: ${material} đã có trong vật tư của mã này`,
  materialShort: (code: string, location: string, left: string) =>
    `Không đủ vật tư: ${code} tại ${location} còn ${left}`,
  reasonMissing: (what: "return" | "cancel") =>
    what === "return" ? "Ghi lý do trả lại" : "Ghi lý do hủy lệnh",
  reasonTooLong: "Lý do tối đa 500 ký tự",
  simpleClosed: "Phiếu sửa đơn giản không lập mới nữa, dùng lệnh sửa chữa",
} as const;

/** A step not allowed from the current status; the API answers 409. */
export class WorkOrderStateError extends DomainValueError {
  readonly status: WorkOrderStatus;

  constructor(message: string, status: WorkOrderStatus) {
    super(message);
    this.status = status;
  }
}

function stateMessage(status: WorkOrderStatus, step: WorkOrderStep): string {
  if (status === "POSTED") return WORK_ORDER_MESSAGES.posted;
  if (status === "CANCELLED") return WORK_ORDER_MESSAGES.cancelled;
  if (step === "recall" && status !== "DRAFT") {
    return WORK_ORDER_MESSAGES.received;
  }
  if (step === "receive" && status === "DRAFT") {
    return WORK_ORDER_MESSAGES.notAssigned;
  }
  if (step === "count" && status === "IN_PROGRESS") {
    return WORK_ORDER_MESSAGES.notReported;
  }
  if (step === "post" && status === "AWAITING_CHECK") {
    return WORK_ORDER_MESSAGES.notCounted;
  }
  return WORK_ORDER_MESSAGES.wrongState(status);
}

/** The status after a step, or a WorkOrderStateError (spec "Trạng thái lệnh"). */
export function transition(
  status: WorkOrderStatus,
  step: WorkOrderStep,
): WorkOrderStatus {
  const rule = STEP_RULES[step];
  if (!rule.from.includes(status)) {
    throw new WorkOrderStateError(stateMessage(status, step), status);
  }
  return rule.to;
}

export type ItemCategory = "EQUIPMENT" | "MATERIAL";

export interface ReportMaterial {
  readonly itemId: string;
  readonly itemCode: string;
  readonly unit: QuantityUnit;
  readonly category: ItemCategory;
  readonly quantityMilli: number;
}

export interface ReportLine {
  readonly itemId: string;
  readonly itemCode: string;
  readonly unit: QuantityUnit;
  readonly takenMilli: number;
  readonly goodMilli: number;
  readonly scrapMilli: number;
  readonly materials: readonly ReportMaterial[];
}

function checkWhole(
  line: ReportLine,
  index: number,
  name: string,
  milli: number,
) {
  const field = `lines.${index}.${name}`;
  if (!Number.isInteger(milli) || milli % K !== 0) {
    throw new RepairFieldError(
      REPAIR_MESSAGES.wholePieces(
        line.itemCode,
        QUANTITY_UNIT_LABELS[line.unit],
      ),
      field,
    );
  }
  if (milli < 0) {
    throw new RepairFieldError(REPAIR_MESSAGES.negative(line.itemCode), field);
  }
}

function checkMaterials(line: ReportLine, index: number): void {
  const seen = new Set<string>();
  line.materials.forEach((material, at) => {
    const field = `lines.${index}.materials.${at}`;
    if (material.category !== "MATERIAL") {
      throw new RepairFieldError(
        WORK_ORDER_MESSAGES.notMaterial(material.itemCode),
        `${field}.itemId`,
      );
    }
    if (seen.has(material.itemId)) {
      throw new RepairFieldError(
        WORK_ORDER_MESSAGES.materialDuplicate(line.itemCode, material.itemCode),
        `${field}.itemId`,
      );
    }
    seen.add(material.itemId);
    if (
      !Number.isInteger(material.quantityMilli) ||
      material.quantityMilli <= 0
    ) {
      throw new RepairFieldError(
        WORK_ORDER_MESSAGES.materialQuantity(material.itemCode),
        `${field}.quantity`,
      );
    }
    if (isCountUnit(material.unit) && material.quantityMilli % K !== 0) {
      throw new RepairFieldError(
        REPAIR_MESSAGES.wholePieces(
          material.itemCode,
          QUANTITY_UNIT_LABELS[material.unit],
        ),
        `${field}.quantity`,
      );
    }
  });
  if (line.materials.length > 0 && line.goodMilli === 0) {
    throw new RepairFieldError(
      REPAIR_MESSAGES.costWithoutGood(line.itemCode),
      `lines.${index}.materials`,
    );
  }
}

/**
 * What the workshop reports or the storekeeper counts (spec "Số sửa xong,
 * phế liệu và vật tư đã dùng"): repaired + scrap = taken on every line,
 * supplies are material items, > 0, once per line, none without a repaired
 * piece. Throws on the first broken rule.
 */
export function checkReport(lines: readonly ReportLine[]): void {
  if (lines.length === 0) {
    throw new RepairFieldError(REPAIR_MESSAGES.noLines, "lines");
  }
  lines.forEach((line, index) => {
    checkWhole(line, index, "quantityGood", line.goodMilli);
    checkWhole(line, index, "quantityScrap", line.scrapMilli);
    const sum = line.goodMilli + line.scrapMilli;
    if (sum !== line.takenMilli) {
      throw new RepairFieldError(
        REPAIR_MESSAGES.sumMismatch(line.itemCode, sum, line.takenMilli),
        `lines.${index}.quantityGood`,
      );
    }
    checkMaterials(line, index);
  });
}

/** Reasons of "Trả lại xưởng" and "Hủy lệnh": 1–500 characters. */
export function checkReason(
  text: string | null | undefined,
  what: "return" | "cancel",
): string {
  const reason = (text ?? "").trim();
  if (reason.length === 0) {
    throw new RepairFieldError(
      WORK_ORDER_MESSAGES.reasonMissing(what),
      "reason",
    );
  }
  if (reason.length > 500) {
    throw new RepairFieldError(WORK_ORDER_MESSAGES.reasonTooLong, "reason");
  }
  return reason;
}

/** New first, then Good (0.2 số 127); short stock names what is left. */
export function splitMaterialIssue(
  needMilli: number,
  stock: MaterialStock,
  context: { itemCode: string; unit: QuantityUnit; locationCode: string },
): MaterialIssue {
  return splitIssue(needMilli, stock, (have) =>
    WORK_ORDER_MESSAGES.materialShort(
      context.itemCode,
      context.locationCode,
      `${formatQuantity({ unit: context.unit, milli: have })} ${QUANTITY_UNIT_LABELS[context.unit]}`,
    ),
  );
}

export interface IssuedMaterial {
  readonly itemId: string;
  readonly itemCode: string;
  readonly newMilli: number;
  readonly goodMilli: number;
}

export interface WorkPostingLine {
  readonly itemId: string;
  readonly itemCode: string;
  readonly takenMilli: number;
  readonly goodMilli: number;
  readonly scrapMilli: number;
  readonly cost: RepairLineCost;
  readonly materials: readonly IssuedMaterial[];
}

/**
 * Ledger lines of posting an order, per line (design D2, 0.2 số 130):
 * REPAIR_OUT Chờ sửa at the workshop, REPAIR_IN Tốt and Phế liệu back at
 * the place the stock came from, then each supply out at the workshop
 * (New, then Good). Zero lines are left out.
 */
export function workOrderPostingLines(
  code: string,
  lines: readonly WorkPostingLine[],
  places: { workshopId: string; returnToId: string },
): MovementDraft[] {
  const drafts: MovementDraft[] = [];
  for (const line of lines) {
    drafts.push({
      itemId: line.itemId,
      condition: "NEEDS_REPAIR",
      locationId: places.workshopId,
      movement: "REPAIR_OUT",
      quantityMilli: -line.takenMilli,
      description: `${code}: đưa ${line.itemCode} đi sửa`,
    });
    if (line.goodMilli > 0) {
      drafts.push({
        itemId: line.itemId,
        condition: "GOOD",
        locationId: places.returnToId,
        movement: "REPAIR_IN",
        quantityMilli: line.goodMilli,
        amount: line.cost.goodAmount,
        description: `${code}: sửa ${line.itemCode}`,
      });
    }
    if (line.scrapMilli > 0) {
      drafts.push({
        itemId: line.itemId,
        condition: "SCRAP",
        locationId: places.returnToId,
        movement: "REPAIR_IN",
        quantityMilli: line.scrapMilli,
        amount: line.cost.scrapValue,
        description: `${code}: ${line.itemCode} hỏng hẳn`,
      });
    }
    for (const material of line.materials) {
      const description = `${code}: vật tư sửa ${line.itemCode}`;
      if (material.newMilli > 0) {
        drafts.push({
          itemId: material.itemId,
          condition: "NEW",
          locationId: places.workshopId,
          movement: "REPAIR_OUT",
          quantityMilli: -material.newMilli,
          description,
        });
      }
      if (material.goodMilli > 0) {
        drafts.push({
          itemId: material.itemId,
          condition: "GOOD",
          locationId: places.workshopId,
          movement: "REPAIR_OUT",
          quantityMilli: -material.goodMilli,
          description,
        });
      }
    }
  }
  return drafts;
}

/**
 * Needs-repair stock moved between two places (design D2): the workshop
 * takes it (yard → workshop) or a cancelled order sends it back. Nothing
 * when both places are the same.
 */
export function transferLines(
  code: string,
  lines: readonly { itemId: string; itemCode: string; takenMilli: number }[],
  places: { fromId: string; toId: string },
  reason: "receive" | "cancel",
): MovementDraft[] {
  if (places.fromId === places.toId) return [];
  const drafts: MovementDraft[] = [];
  for (const line of lines) {
    const description =
      reason === "receive"
        ? `${code}: xưởng nhận ${line.itemCode}`
        : `${code}: hủy lệnh, trả ${line.itemCode}`;
    drafts.push(
      {
        itemId: line.itemId,
        condition: "NEEDS_REPAIR",
        locationId: places.fromId,
        movement: "TRANSFER_OUT",
        quantityMilli: -line.takenMilli,
        description,
      },
      {
        itemId: line.itemId,
        condition: "NEEDS_REPAIR",
        locationId: places.toId,
        movement: "TRANSFER_IN",
        quantityMilli: line.takenMilli,
        description,
      },
    );
  }
  return drafts;
}
