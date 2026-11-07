// Labels shared by the repair pages and the client form (no server code).
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUSES,
  type WorkOrderStatus,
} from "@/domain/repair-work-order";

/** Simple slips use DRAFT and POSTED; work orders every status. */
export type RepairStatus = WorkOrderStatus;
export type RepairKind = "SIMPLE" | "WORK_ORDER";

export const REPAIR_STATUSES = WORK_ORDER_STATUSES;

export const REPAIR_STATUS_LABELS: Readonly<Record<RepairStatus, string>> =
  WORK_ORDER_STATUS_LABELS;
