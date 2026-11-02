// "Kiểm tra trước khi gửi duyệt" (contracts spec): warnings that never
// block sending or approving. Stock of the first planned delivery against
// New + Good at the yards (read only, nothing reserved), prices that differ
// from the catalog, bank guarantees, overdue debt.
import { and, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { inventoryLedger, item, kitComponent, location } from "@/db/schema";
import type { BusinessDate } from "@/domain/business-date";
import type { ContractType, OverdueDebt } from "@/domain/contract";
import { offCatalogCounts, type OffCatalog } from "@/domain/contract-lines";
import { guaranteeWarnings, type GuaranteeWarning } from "@/domain/guarantee";
import { formatMoney, toMoney } from "@/domain/money";
import {
  formatQuantity,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";

import type { StoredContent } from "./content";
import { milliOf } from "./records";

type Reader = Pick<Database, "select">;

export interface CheckLine {
  /** True: fine; false: a warning the director should see. */
  ok: boolean;
  message: string;
}

export interface ContractChecks {
  lines: CheckLine[];
  offCatalog: OffCatalog;
  guarantees: GuaranteeWarning[];
  overdue: OverdueDebt;
}

const SELLABLE = ["NEW", "GOOD"] as const;

/** Stock lines of the first planned delivery, one warning per short item. */
async function firstBatchStock(
  tx: Reader,
  content: StoredContent,
): Promise<CheckLine | null> {
  const batch = content.batches[0];
  if (!batch) return null;
  const kitIds = batch.lines.flatMap((line) =>
    line.kitId ? [line.kitId] : [],
  );
  const parts = kitIds.length
    ? await tx
        .select({
          kitId: kitComponent.kitId,
          itemId: kitComponent.itemId,
          quantity: kitComponent.quantity,
        })
        .from(kitComponent)
        .where(inArray(kitComponent.kitId, kitIds))
    : [];
  const need = new Map<string, number>();
  const add = (itemId: string, milli: number) =>
    need.set(itemId, (need.get(itemId) ?? 0) + milli);
  for (const line of batch.lines) {
    if (line.itemId) add(line.itemId, milliOf(line.quantity));
    if (line.kitId) {
      const kits = milliOf(line.quantity) / 1000;
      for (const part of parts.filter((entry) => entry.kitId === line.kitId)) {
        add(part.itemId, part.quantity * kits * 1000);
      }
    }
  }
  const ids = [...need.keys()];
  if (ids.length === 0) return null;
  const [items, stock] = await Promise.all([
    tx
      .select({ id: item.id, code: item.code, unit: item.unit })
      .from(item)
      .where(inArray(item.id, ids)),
    tx
      .select({
        itemId: inventoryLedger.itemId,
        total: sql<string>`coalesce(sum(${inventoryLedger.quantity}), 0)`,
      })
      .from(inventoryLedger)
      .innerJoin(location, eq(location.id, inventoryLedger.locationId))
      .where(
        and(
          inArray(inventoryLedger.itemId, ids),
          inArray(inventoryLedger.condition, [...SELLABLE]),
          eq(location.type, "YARD"),
        ),
      )
      .groupBy(inventoryLedger.itemId),
  ]);
  const have = new Map(stock.map((row) => [row.itemId, milliOf(row.total)]));
  const shown = (milli: number, unit: string) =>
    formatQuantity(toQuantity(milli, unit as QuantityUnit));
  const short = items
    .map((row) => ({
      row,
      need: need.get(row.id) ?? 0,
      have: have.get(row.id) ?? 0,
    }))
    .filter((entry) => entry.have < entry.need)
    .sort((a, b) => a.row.code.localeCompare(b.row.code));
  if (short.length === 0) {
    return { ok: true, message: "Kho đủ hàng Mới + Tốt ở bãi cho đợt 1" };
  }
  return {
    ok: false,
    message: short
      .map(
        ({ row, need: wanted, have: got }) =>
          `Kho thiếu ${shown(wanted - got, row.unit)} ${row.code} cho đợt 1 (cần ${shown(wanted, row.unit)}, bãi có ${shown(got, row.unit)} Mới + Tốt)`,
      )
      .join("; "),
  };
}

export interface CheckInput {
  type: ContractType;
  endDate: string | null;
  content: StoredContent;
  overdue: OverdueDebt;
  today: BusinessDate;
}

export async function contractChecks(
  tx: Reader,
  input: CheckInput,
): Promise<ContractChecks> {
  const lines: CheckLine[] = [];
  const stock = await firstBatchStock(tx, input.content);
  if (stock) lines.push(stock);
  const offCatalog = offCatalogCounts(
    input.content.lines,
    input.content.compensations,
  );
  if (offCatalog.rent > 0 || offCatalog.compensation > 0) {
    lines.push({
      ok: false,
      message: `${offCatalog.rent} giá thuê và ${offCatalog.compensation} giá đền bù khác danh mục`,
    });
  } else if (input.type === "RENTAL") {
    lines.push({ ok: true, message: "Giá thuê và giá đền bù bằng danh mục" });
  }
  const guarantees = input.content.deposits.flatMap((deposit) =>
    deposit.kind === "GUARANTEE" && deposit.expiryDate
      ? guaranteeWarnings({
          guaranteeNumber: deposit.guaranteeNumber ?? "",
          expiryDate: deposit.expiryDate as BusinessDate,
          today: input.today,
          contractEndDate:
            input.type === "RENTAL" && input.endDate
              ? (input.endDate as BusinessDate)
              : null,
        })
      : [],
  );
  for (const warning of guarantees) {
    lines.push({ ok: false, message: warning.message });
  }
  if (
    guarantees.length === 0 &&
    input.content.deposits.some((deposit) => deposit.kind === "GUARANTEE")
  ) {
    lines.push({
      ok: true,
      message: "Bảo lãnh còn hạn sau ngày kết thúc dự kiến",
    });
  }
  if (input.overdue.amount > 0) {
    lines.push({
      ok: false,
      message: `Nhà thầu đang nợ quá hạn ${formatMoney(toMoney(input.overdue.amount))} (${input.overdue.days} ngày): Giám đốc phải ghi lý do khi duyệt`,
    });
  }
  return { lines, offCatalog, guarantees, overdue: input.overdue };
}
