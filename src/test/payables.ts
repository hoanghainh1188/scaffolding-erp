// Integration-test helpers for payables (payables tasks 3.x, 4.x): orders of
// one line placed and received on a given day, so each receipt is worth an
// exact amount for its seller.
import { eq } from "drizzle-orm";

import { goodsReceipt, supplier } from "@/db/schema";
import { toBusinessDate } from "@/domain/business-date";
import type { QuantityUnit } from "@/domain/quantity";
import { createOrder } from "@/lib/purchasing/orders";
import { postReceipt } from "@/lib/receiving/post";

import type { TestContext } from "./auth";
import type { ReceivingFixture } from "./receiving";
import { counted, orderLineIds } from "./receiving";

/** 03:00 UTC = 10:00 Vietnamese time of that day. */
export const at = (day: string) => new Date(`${day}T03:00:00Z`);

export async function setTerms(
  ctx: TestContext,
  supplierId: string,
  days: number,
): Promise<void> {
  await ctx.db
    .update(supplier)
    .set({ paymentTermsDays: days })
    .where(eq(supplier.id, supplierId));
}

export interface ReceiptSpec {
  /** Supplier code, NCC-0002 Chú Ba ve chai by default. */
  supplier?: string;
  item?: string;
  unit?: QuantityUnit;
  quantity: string;
  price: number;
  /** Receipt day, "2026-11-04". */
  day: string;
  costs?: { label: string; amount: number }[];
}

/** Places a one-line NEW order and posts it in full on `day`. */
export async function receiptFor(
  ctx: TestContext,
  fx: ReceivingFixture,
  spec: ReceiptSpec,
): Promise<{ id: string; code: string; orderCode: string }> {
  const now = at(spec.day);
  const itemCode = spec.item ?? "GG-CH";
  const created = await createOrder(
    ctx.db,
    fx.sales,
    {
      supplierId: fx.supplier(spec.supplier ?? "NCC-0002"),
      kind: "NEW",
      expectedDate: toBusinessDate(now),
      allocationMethod: "VALUE",
      lines: [
        {
          itemId: fx.item(itemCode),
          unit: spec.unit ?? "PIECE",
          quantity: spec.quantity,
          unitPrice: spec.price,
        },
      ],
      costs: spec.costs ?? [],
    },
    { place: true, now },
  );
  if (!created.ok) throw new Error(created.error);
  const lines = await orderLineIds(ctx, created.data.code);
  const posted = await postReceipt(
    ctx.db,
    fx.warehouse,
    {
      draftId: crypto.randomUUID(),
      orderCode: created.data.code,
      lines: [
        counted(lines.get(itemCode) ?? "", spec.quantity, {
          NEW: spec.quantity,
        }),
      ],
      costs: spec.costs ?? [],
    },
    { now },
  );
  if (!posted.ok) throw new Error(`${posted.status} ${posted.error}`);
  const [row] = await ctx.db
    .select({ id: goodsReceipt.id })
    .from(goodsReceipt)
    .where(eq(goodsReceipt.code, posted.data.code));
  return {
    id: row?.id ?? "",
    code: posted.data.code,
    orderCode: created.data.code,
  };
}
