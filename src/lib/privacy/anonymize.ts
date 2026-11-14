// Erasing a seller on request (personal-data-protection D7): one row changes,
// every document stays. A seller who already sold us goods leaves name,
// address and CCCD in an encrypted tax file nothing on screen can open.
import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { goodsReceipt, purchaseOrder, supplier } from "@/db/schema";
import {
  formatBusinessDate,
  isBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { formatMoney, type Money } from "@/domain/money";
import { anonymizedSellerName } from "@/domain/personal-data";
import { toSearchText } from "@/domain/search-text";
import type { ActivityActor } from "@/lib/activity/actor";
import { logActivity } from "@/lib/activity/log";
import {
  conflict,
  ok,
  ServiceFailure,
  type ServiceResult,
} from "@/lib/catalog/common";
import type { Tx } from "@/lib/contracts/common";
import { readLedger } from "@/lib/payables/balances";
import { lockSupplier, run } from "@/lib/payables/common";
import {
  describeOrderCodes,
  openOrderCodesForSupplier,
} from "@/lib/purchasing/references";

import {
  PiiCipherError,
  decryptIdNumber,
  encryptTaxIdentity,
  type PiiKeyRing,
} from "./cipher";
import { hasLegacyPii } from "./backfill";
import { cipherFailure } from "./failure";
import { getPiiKeyRing } from "./key-ring";

export const ANONYMIZE_MESSAGES = {
  onlyPerson: "Chỉ ẩn danh được người bán cá nhân",
  already: "Người bán này đã được ẩn danh",
  wrongCode: "Mã xác nhận không đúng",
  requestedOn: "Nhập ngày nhận yêu cầu, không sau hôm nay",
  owed: (code: string, amount: Money) =>
    `${code} còn phải trả ${formatMoney(amount)}. Trả hết trước khi ẩn danh`,
  advance: (code: string, amount: Money) =>
    `${code} còn tiền ứng trước ${formatMoney(amount)}. Xử lý xong trước khi ẩn danh`,
  legacyData:
    "Chờ chuyển dữ liệu xong: chạy npm run pii:backfill rồi ẩn danh lại",
  openOrders: (code: string, orders: string) =>
    `${code} còn đơn thu mua đang xử lý: ${orders}. Đóng hoặc hủy đơn trước khi ẩn danh`,
} as const;

export interface AnonymizeInput {
  confirmCode: string;
  /** YYYY-MM-DD: proves the 20-day limit was kept. */
  requestedOn: string;
}

export interface AnonymizedSeller {
  id: string;
  code: string;
  name: string;
}

const unprocessable = (error: string, field: string) =>
  new ServiceFailure({ ok: false, status: 422, error, field });

const refuse = (message: string) => new ServiceFailure(conflict(message));

async function hasReceipt(tx: Tx, supplierId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: goodsReceipt.id })
    .from(goodsReceipt)
    .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.orderId))
    .where(eq(purchaseOrder.supplierId, supplierId))
    .limit(1);
  return row !== undefined;
}

type SupplierRecord = typeof supplier.$inferSelect;

async function taxFileOf(
  tx: Tx,
  row: SupplierRecord,
  ring: () => PiiKeyRing,
): Promise<string | null> {
  if (!(await hasReceipt(tx, row.id))) return null;
  const keys = ring();
  return encryptTaxIdentity(
    row.id,
    {
      name: row.name,
      address: row.address,
      idNumber: row.idNumberEnc
        ? decryptIdNumber(row.id, row.idNumberEnc, keys)
        : null,
    },
    keys,
  );
}

async function assertSettled(
  tx: Tx,
  row: SupplierRecord,
  today: BusinessDate,
): Promise<void> {
  const ledger = await readLedger(tx, row.id, today);
  if (ledger.owed > 0) {
    throw refuse(ANONYMIZE_MESSAGES.owed(row.code, ledger.owed));
  }
  if (ledger.advance > 0) {
    throw refuse(ANONYMIZE_MESSAGES.advance(row.code, ledger.advance));
  }
  const orders = await openOrderCodesForSupplier(tx, row.id);
  if (orders.length > 0) {
    throw refuse(
      ANONYMIZE_MESSAGES.openOrders(row.code, describeOrderCodes(orders)),
    );
  }
}

/** Cannot be undone; partners.anonymize (Director) only. */
export function anonymizeSupplier(
  db: Database,
  actor: ActivityActor,
  id: string,
  input: AnonymizeInput,
  now: Date = new Date(),
): Promise<ServiceResult<AnonymizedSeller>> {
  const today = toBusinessDate(now);
  return run(async () => {
    try {
      const saved = await db.transaction(async (tx) => {
        await lockSupplier(tx, id);
        const [row] = await tx
          .select()
          .from(supplier)
          .where(eq(supplier.id, id));
        if (!row) throw refuse(ANONYMIZE_MESSAGES.already);
        if (row.kind !== "PERSON") throw refuse(ANONYMIZE_MESSAGES.onlyPerson);
        if (row.anonymizedAt) throw refuse(ANONYMIZE_MESSAGES.already);
        if (await hasLegacyPii(tx, id)) {
          throw refuse(ANONYMIZE_MESSAGES.legacyData);
        }
        if (input.confirmCode.trim() !== row.code) {
          throw unprocessable(ANONYMIZE_MESSAGES.wrongCode, "confirmCode");
        }
        if (!isBusinessDate(input.requestedOn) || input.requestedOn > today) {
          throw unprocessable(ANONYMIZE_MESSAGES.requestedOn, "requestedOn");
        }
        await assertSettled(tx, row, today);
        const name = anonymizedSellerName(row.code);
        await tx
          .update(supplier)
          .set({
            name,
            phone: null,
            address: null,
            taxCode: null,
            note: null,
            bankName: null,
            bankAccountLast4: null,
            idNumberEnc: null,
            idNumberLast4: null,
            taxIdentityEnc: await taxFileOf(tx, row, getPiiKeyRing),
            searchText: toSearchText(name, row.code),
            status: "ARCHIVED",
            archivedAt: row.archivedAt ?? now,
            anonymizedAt: now,
            anonymizedBy: actor.id,
            anonymizeRequestedOn: input.requestedOn,
            updatedBy: actor.id,
            updatedAt: now,
          })
          .where(
            and(eq(supplier.id, id), sql`${supplier.anonymizedAt} is null`),
          );
        await logActivity(tx, actor, {
          action: "ANONYMIZE",
          document: { type: "SUPPLIER", id, code: row.code },
          // Fixed wording: free text here could never be erased (design D7).
          summary: `Ẩn danh theo yêu cầu nhận ngày ${formatBusinessDate(input.requestedOn)}`,
          sensitive: true,
        });
        return { id, code: row.code, name };
      });
      return ok(saved);
    } catch (error: unknown) {
      if (error instanceof PiiCipherError) return cipherFailure(error);
      throw error;
    }
  });
}
