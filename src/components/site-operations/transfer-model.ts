// D6b numbers worked out while typing (site-operations spec site-transfers
// "Ngày chuyển với tiền thuê hai hợp đồng", "Phiếu chuyển trên Desktop"):
// what each count draws, the rent a day the source loses, the receiving
// contract's "còn phải giao" and the ticks the server will ask for.
import {
  formatQuantity,
  isCountUnit,
  parseQuantity,
  toQuantity,
} from "@/domain/quantity";
import { dailyChange } from "@/domain/rental";
import { drawLabel } from "@/domain/site-transfer";
import type {
  TransferFormItem,
  TransferTarget,
} from "@/lib/site-transfers/queries";

/** Thousandths typed in a box; null while it is not a valid count. */
export function readCount(
  text: string,
  item: Pick<TransferFormItem, "unit">,
): number | null {
  if (text.trim() === "") return 0;
  try {
    const milli = parseQuantity(text, item.unit).milli;
    return milli < 0 || (isCountUnit(item.unit) && milli % 1000 !== 0)
      ? null
      : milli;
  } catch {
    return null;
  }
}

export interface TransferLinePreview {
  item: TransferFormItem;
  milli: number;
  /** "20 Mới · 30 Tốt", or "–". */
  draw: string;
  tooMany: boolean;
  /** On the receiving contract today. */
  onTarget: boolean;
  /** ₫ a day on the receiving contract; null when it has none. */
  targetPrice: number | null;
  remainingBefore: number;
  remainingAfter: number;
  over: boolean;
}

export interface TransferPreview {
  lines: TransferLinePreview[];
  totalMilli: number;
  /** Negative: the source contract's rent a day drops by this. */
  dailyDrop: number;
  sameCustomer: boolean | null;
  anyOver: boolean;
  anyMissing: boolean;
  anyTooMany: boolean;
}

export function previewTransfer(
  items: readonly TransferFormItem[],
  counts: Readonly<Record<string, string>>,
  target: TransferTarget | null,
  fromCustomerId: string,
): TransferPreview {
  const lines = items.flatMap((item): TransferLinePreview[] => {
    const milli = readCount(counts[item.itemId] ?? "", item) ?? 0;
    if (milli === 0) return [];
    const stock = { NEW: item.newMilli, GOOD: item.goodMilli };
    const remainingBefore = target?.remaining[item.itemId] ?? 0;
    return [
      {
        item,
        milli,
        draw: drawLabel(milli, stock, item.unit),
        tooMany: milli > item.newMilli + item.goodMilli,
        onTarget: target ? item.itemId in target.prices : true,
        targetPrice: target?.prices[item.itemId] ?? null,
        remainingBefore,
        remainingAfter: Math.max(remainingBefore - milli, 0),
        over: target !== null && milli > remainingBefore,
      },
    ];
  });
  return {
    lines,
    totalMilli: lines.reduce((sum, line) => sum + line.milli, 0),
    dailyDrop: dailyChange(
      [],
      lines.map((line) => ({
        dailyPrice: line.item.dailyPrice,
        quantityMilli: line.milli,
      })),
    ),
    sameCustomer: target ? target.customerId === fromCustomerId : null,
    anyOver: lines.some((line) => line.over),
    anyMissing: lines.some((line) => !line.onTarget),
    anyTooMany: lines.some((line) => line.tooMany),
  };
}

/** "600 → 550". */
export const remainingText = (line: TransferLinePreview): string =>
  `${formatQuantity(toQuantity(line.remainingBefore, line.item.unit))} → ${formatQuantity(toQuantity(line.remainingAfter, line.item.unit))}`;

/** The 45-day rule of 0.2 #70 in words for D6b. */
export function minimumText(
  sameCustomer: boolean | null,
  fromSite: string,
  toSite: string,
): string {
  if (sameCustomer === false) {
    return "Khác nhà thầu: mỗi hợp đồng tính tối thiểu 45 ngày riêng.";
  }
  return `Cùng nhà thầu: hàng chuyển không tính tối thiểu 45 ngày ở ${fromSite}, thuê nối tiếp sang ${toSite}.`;
}
