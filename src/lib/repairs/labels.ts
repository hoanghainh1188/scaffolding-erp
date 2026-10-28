// Labels shared by the repair pages and the client form (no server code).
export type RepairStatus = "DRAFT" | "POSTED";

export const REPAIR_STATUS_LABELS: Readonly<Record<RepairStatus, string>> = {
  DRAFT: "Nháp",
  POSTED: "Đã ghi sổ",
};
