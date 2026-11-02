import type { ContractStatus } from "@/domain/contract";

/**
 * "Báo giá <số>" while the contract is a draft or waits for approval,
 * "Hợp đồng <số>" once approved; the code of the amendment in force when
 * there is one (contracts spec "In báo giá và hợp đồng").
 */
export function printTitle(
  status: ContractStatus,
  contractCode: string,
  shownCode: string,
): string {
  const quote = status === "DRAFT" || status === "PENDING";
  return `${quote ? "Báo giá" : "Hợp đồng"} ${shownCode || contractCode}`;
}
