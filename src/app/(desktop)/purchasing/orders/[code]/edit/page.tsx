import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { OrderForm } from "@/components/purchasing/order-form";
import { OrderStatusBadge } from "@/components/purchasing/order-status-badge";
import { getDatabase } from "@/db/client";
import { requirePermission } from "@/lib/auth/guard";
import { getOrderByCode, orderFormOptions } from "@/lib/purchasing/queries";
import { ORDER_CODE } from "@/lib/purchasing/respond";

type Params = Promise<{ code: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: `Sửa ${code}` };
}

/** D3 for an existing order; locked fields follow design D6. */
export default async function Page({ params }: { params: Params }) {
  await requirePermission("purchasing.manage");
  const { code } = await params;
  if (!ORDER_CODE.test(code)) notFound();
  const db = getDatabase();
  const [order, options] = await Promise.all([
    getOrderByCode(db, code),
    orderFormOptions(db),
  ]);
  if (!order) notFound();
  if (order.editable === "NONE") redirect(`/purchasing/orders/${code}`);
  // The current supplier and items stay pickable even if archived since.
  const suppliers = options.suppliers.some((s) => s.id === order.supplierId)
    ? options.suppliers
    : [
        {
          id: order.supplierId,
          code: order.supplierCode,
          name: order.supplierName,
        },
        ...options.suppliers,
      ];
  const known = new Set(options.items.map((item) => item.id));
  const items = [
    ...options.items,
    ...order.lines
      .filter((line) => !known.has(line.itemId))
      .map((line) => ({
        id: line.itemId,
        code: line.itemCode,
        name: line.itemName,
        unit: line.itemUnit,
        standardWeightKg: line.standardWeightKg,
      })),
  ];
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/purchasing" className="hover:underline">
          Đơn thu mua
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <Link href={`/purchasing/orders/${code}`} className="hover:underline">
          {code}
        </Link>{" "}
        <span aria-hidden>/</span> <span className="text-foreground">Sửa</span>
      </nav>
      <div className="flex items-center gap-3">
        <h1 className="text-h1">Sửa {code}</h1>
        <OrderStatusBadge
          status={order.status}
          outcome={order.outcome}
          hasReceipts={order.hasReceipts}
        />
      </div>
      <OrderForm
        suppliers={suppliers}
        items={items}
        order={{
          code: order.code,
          status: order.status,
          editable: order.editable,
          updatedAt: order.updatedAt.toISOString(),
          supplierId: order.supplierId,
          kind: order.kind,
          expectedDate: order.expectedDate,
          expectedTime: order.expectedTime,
          vehicle: order.vehicle,
          note: order.note,
          allocationMethod: order.allocationMethod,
          lines: order.lines.map((line) => ({
            itemId: line.itemId,
            unit: line.unit,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          })),
          costs: order.costs,
        }}
      />
    </div>
  );
}
