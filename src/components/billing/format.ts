// Formatting shared by D7 and the printed statement (rental-billing design
// D8): short dates, the line under an item and the label chips.
import { formatBusinessDate } from "@/domain/business-date";
import { formatQuantity, toQuantity } from "@/domain/quantity";
import {
  formatMonth,
  lineLabel,
  type StatementLine,
} from "@/domain/rental-billing";

/** "01/02" inside a period. */
export const dayMonth = (date: string | null): string =>
  date === null ? "–" : `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** "260" (pieces) or "1.250,5" for weighed goods. */
export const quantityText = (milli: number): string =>
  formatQuantity(toQuantity(milli, "PIECE"));

/** "−9" holidays, "–" when none. */
export const holidayText = (days: number | null): string =>
  days ? `−${days}` : "–";

/** The small line under the item name: where it came from and went. */
export function sourceText(line: StatementLine): string {
  if (line.kind === "ADJUSTMENT") {
    const adjustment = line.adjustment;
    if (!adjustment) return "";
    return `${adjustment.reason}. Kỳ cũ đã chốt, không sửa.`;
  }
  const code = line.itemCode ?? "";
  if (line.kind === "MINIMUM") {
    return `${code} · Bù đủ ${line.minimumDays} ngày: lượng này mới thuê ${line.rentedDays} ngày`;
  }
  const parts = [code];
  const batch = line.inDoc?.batchNo ? ` (Đợt ${line.inDoc.batchNo})` : "";
  if (line.inDate) {
    parts.push(
      `Giao ${formatBusinessDate(line.inDate)}${line.inDoc ? ` ${line.inDoc.code}${batch}` : ""}`,
    );
  }
  if (line.out) {
    const verb =
      line.out.kind === "LOSS"
        ? "Mất, ghi ở"
        : line.out.kind === "BUY_BACK"
          ? "Mua lại"
          : line.out.kind === "TRANSFER"
            ? "Chuyển đi"
            : "Trả";
    parts.push(
      `${verb} ${line.out.doc.code} ngày ${formatBusinessDate(line.out.date)}`,
    );
  }
  if (line.priceChanged && line.revisionCode) {
    parts.push(`Giá mới theo ${line.revisionCode}`);
  }
  if (line.missingPrice) parts.push("Chưa có giá trên hợp đồng");
  return parts.join(" · ");
}

/** The chip next to the item name; null for a plain rent line. */
export function chipText(line: StatementLine): string | null {
  if (line.kind === "ADJUSTMENT") return null;
  if (line.kind === "MINIMUM") return `Tối thiểu ${line.minimumDays} ngày`;
  const label = lineLabel(line);
  return label === "Thuê" ? null : label;
}

/** "Điều chỉnh kỳ 01/2027". */
export const adjustmentTitle = (refMonth: string): string =>
  `Điều chỉnh kỳ ${formatMonth(refMonth)}`;
