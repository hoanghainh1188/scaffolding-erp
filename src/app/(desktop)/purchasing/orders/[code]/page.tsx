import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderActions } from "@/components/purchasing/order-actions";
import { OrderHistory } from "@/components/purchasing/order-history";
import { OrderStatusBadge } from "@/components/purchasing/order-status-badge";
import { OrderTotal } from "@/components/purchasing/order-total";
import { unitHint } from "@/components/purchasing/preview";
import {
  ReceivedCell,
  ReceivingTrips,
  receivingOf,
  waitingOf,
} from "@/components/purchasing/order-receiving";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { formatBusinessDate, formatDateTime } from "@/domain/business-date";
import { ALLOCATION_METHOD_LABELS } from "@/domain/landed-cost";
import { formatMoney, toMoney } from "@/domain/money";
import { can } from "@/domain/permissions";
import {
  PURCHASE_KIND_LABELS,
  PURCHASE_OUTCOME_LABELS,
} from "@/domain/purchase-order";
import {
  formatQuantity,
  hasStandardWeight,
  QUANTITY_UNIT_LABELS,
  toQuantity,
  type QuantityUnit,
} from "@/domain/quantity";
import { requirePermission } from "@/lib/auth/guard";
import { getOrderByCode } from "@/lib/purchasing/queries";
import { receiptsOfOrder } from "@/lib/receiving/queries";
import { ORDER_CODE } from "@/lib/purchasing/respond";

type Params = Promise<{ code: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { code } = await params;
  return { title: `Đơn thu mua ${code}` };
}

const head = "border-b px-3 py-2.5 font-semibold";
const cell = "border-b px-3 py-2.5";

/** D3b, order part (spec purchase-orders "Chi tiết đơn thu mua D3b"). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const user = await requirePermission("purchasing.view");
  const canManage = can(user.role, "purchasing.manage");
  const { code } = await params;
  const { saved } = await searchParams;
  const order = ORDER_CODE.test(code)
    ? await getOrderByCode(getDatabase(), code)
    : null;
  if (!order) notFound();
  const trips = order.hasReceipts
    ? await receiptsOfOrder(getDatabase(), order.id)
    : [];
  const receiving = receivingOf(order.lines, trips, order.totals.costs);
  const byItem = new Map(
    receiving.lines.map((line) => [line.orderLineId, line]),
  );
  const open = order.status === "IN_PROGRESS";
  const waiting = open ? waitingOf(receiving, order.lines) || null : null;
  const received = order.hasReceipts;

  const quantity = (milli: number, unit: QuantityUnit) =>
    `${formatQuantity(toQuantity(milli, "KG"))} ${QUANTITY_UNIT_LABELS[unit]}`;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/purchasing" className="hover:underline">
          Đơn thu mua
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">{order.code}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1">{order.code}</h1>
            <OrderStatusBadge
              status={order.status}
              outcome={order.outcome}
              hasReceipts={order.hasReceipts}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {order.supplierName} · {PURCHASE_KIND_LABELS[order.kind]} ·{" "}
            {order.trips} chuyến đã nhập
          </p>
        </div>
        {canManage && order.editable !== "NONE" ? (
          <Button asChild variant="outline">
            <Link href={`/purchasing/orders/${order.code}/edit`}>
              <Pencil aria-hidden /> Sửa
            </Link>
          </Button>
        ) : null}
      </div>
      {saved === "placed" && order.status === "IN_PROGRESS" ? (
        <p
          role="status"
          className="rounded-lg border border-success bg-card px-4 py-3 text-sm"
        >
          Lưu xong, đơn hiện ở mục &quot;Xe sắp về&quot; trên điện thoại của thủ
          kho.
        </p>
      ) : null}
      {waiting ? (
        <section
          aria-label="Còn chờ giao bù"
          className="flex flex-col gap-1 rounded-lg border-2 border-warning bg-card px-4 py-3 text-sm"
        >
          <p className="font-semibold">Còn chờ giao bù {waiting}</p>
          <p className="text-muted-foreground">
            Thủ kho đánh dấu &quot;Chờ giao bù&quot; khi nhập hàng. Không chờ
            nữa thì bấm &quot;Đóng đơn, không chờ nữa&quot;: tiền trả người bán
            chốt theo số đã nhận.
          </p>
        </section>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="order-info"
            className="flex flex-col gap-4 rounded-lg border bg-card p-5"
          >
            <h2 id="order-info" className="font-display text-h2">
              Thông tin chung
            </h2>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
              <Info label="Nhà cung cấp">
                {order.supplierName} · {order.supplierCode}
              </Info>
              <Info label="Loại hàng">{PURCHASE_KIND_LABELS[order.kind]}</Info>
              <Info label="Ngày dự kiến nhập">
                {order.expectedDate
                  ? `${formatBusinessDate(order.expectedDate)}${order.expectedTime ? ` · ${order.expectedTime}` : ""}`
                  : "Chưa có"}
              </Info>
              <Info label="Phương tiện">{order.vehicle ?? "–"}</Info>
              <Info label="Người lập" mask>
                {order.createdByName} ·{" "}
                {formatDateTime(order.createdAt).slice(0, 10)}
              </Info>
              {order.note ? <Info label="Ghi chú">{order.note}</Info> : null}
              {order.outcome === "CANCELLED" || order.outcome === "CLOSED" ? (
                <Info label={PURCHASE_OUTCOME_LABELS[order.outcome]}>
                  {order.endReason
                    ? `${PURCHASE_OUTCOME_LABELS[order.outcome]}: ${order.endReason}`
                    : PURCHASE_OUTCOME_LABELS[order.outcome]}
                </Info>
              ) : null}
            </dl>
          </section>
          <section
            aria-labelledby="order-lines"
            className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-5"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="order-lines" className="font-display text-h2">
                Đặt và thực nhận
              </h2>
              <span className="text-sm text-muted-foreground">
                Cộng dồn mọi chuyến
              </span>
            </div>
            {order.lines.length === 0 ? (
              <p className="text-muted-foreground">Đơn chưa có dòng hàng.</p>
            ) : (
              <div className="relative overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-muted text-left">
                    <tr>
                      <th scope="col" className={head}>
                        Hàng
                      </th>
                      <th scope="col" className={`${head} text-right`}>
                        Đặt
                      </th>
                      <th scope="col" className={`${head} text-right`}>
                        Đã nhận
                      </th>
                      <th scope="col" className={`${head} text-right`}>
                        Đơn giá
                      </th>
                      <th scope="col" className={`${head} text-right`}>
                        Thành tiền
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line) => (
                      <tr key={line.lineNo} className="bg-card">
                        <th
                          scope="row"
                          className={`${cell} text-left font-normal`}
                        >
                          <span className="block font-semibold">
                            {line.itemName}
                          </span>
                          <span className="text-caption text-muted-foreground">
                            {line.itemCode}
                          </span>
                        </th>
                        <td
                          className={`${cell} text-right whitespace-nowrap tabular-nums`}
                        >
                          {quantity(line.quantity, line.unit)}
                        </td>
                        <td
                          className={`${cell} text-right whitespace-nowrap tabular-nums`}
                        >
                          <ReceivedCell
                            line={line}
                            summary={byItem.get(line.itemCode)}
                          />
                        </td>
                        <td
                          className={`${cell} text-right whitespace-nowrap tabular-nums`}
                        >
                          {formatMoney(line.unitPrice)}
                          {unitHint(line.unit) ? `/${unitHint(line.unit)}` : ""}
                        </td>
                        <td
                          className={`${cell} text-right font-semibold whitespace-nowrap tabular-nums`}
                        >
                          {formatMoney(
                            received
                              ? (byItem.get(line.itemCode)?.amount ??
                                  toMoney(0))
                              : line.amount,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted">
                      <th
                        scope="row"
                        colSpan={4}
                        className="px-3 py-2.5 text-left font-semibold"
                      >
                        {received
                          ? "Cộng tiền hàng thực nhận"
                          : "Cộng tiền hàng dự kiến"}
                      </th>
                      <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap tabular-nums">
                        {formatMoney(
                          received ? receiving.payable : order.totals.goods,
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="text-caption text-muted-foreground">
              Tiền trả người bán tính theo số thực nhận và số kg cân thực tế,
              không theo số trên đơn (quyết định #13).
            </p>
          </section>
          <ReceivingTrips trips={trips} waiting={waiting} />
        </div>
        <aside className="flex flex-col gap-4" aria-label="Tiền và lịch sử">
          <OrderTotal
            title="Phải trả người bán"
            total={receiving.payable}
            rows={[]}
            note={
              !received
                ? "Theo số thực nhận · chưa có chuyến nhập"
                : open
                  ? "Theo số thực nhận · chưa chốt vì còn chờ giao bù"
                  : "Theo số thực nhận"
            }
          />
          <section
            aria-labelledby="order-compare"
            className="flex flex-col gap-3 rounded-lg border bg-card p-5 text-sm"
          >
            <h2 id="order-compare" className="font-display text-h2">
              So với đơn
            </h2>
            <dl className="flex flex-col gap-1.5">
              <Row label="Tiền hàng dự kiến" value={order.totals.goods} />
              <Row
                label="Tiền hàng thực nhận"
                value={receiving.payable}
                strong
              />
              {order.lines.map((line) => {
                const summary = byItem.get(line.itemCode);
                if (!summary || summary.difference === 0) return null;
                const gap = quantity(summary.gapMilli, line.unit);
                const label =
                  summary.state === "OVER"
                    ? `${line.itemName} ${hasStandardWeight(line.unit) ? "dư" : "cân dư"} ${gap}`
                    : `Thiếu ${gap.replace(/ cái$/, "")} ${line.itemName.charAt(0).toLowerCase()}${line.itemName.slice(1)}`;
                return (
                  <Row
                    key={line.itemCode}
                    label={label}
                    value={summary.difference}
                  />
                );
              })}
            </dl>
            <div className="flex flex-col gap-1.5 border-t pt-3">
              <p className="font-semibold">Chi phí mua hàng dự kiến</p>
              {order.costs.length === 0 ? (
                <p className="text-muted-foreground">Không có</p>
              ) : (
                <dl className="flex flex-col gap-1">
                  {order.costs.map((cost, index) => (
                    <Row key={index} label={cost.label} value={cost.amount} />
                  ))}
                  <Row label="Cộng" value={order.totals.costs} strong />
                </dl>
              )}
              {received ? (
                <dl className="flex flex-col gap-1">
                  <Row
                    label={`Chi phí thực tế (${receiving.trips} chuyến)`}
                    value={receiving.actualCosts}
                    strong
                  />
                </dl>
              ) : null}
              <p className="text-muted-foreground">
                Chia{" "}
                {ALLOCATION_METHOD_LABELS[order.allocationMethod].toLowerCase()}
                . Chi phí trả cho nhà xe, bốc xếp; không cộng vào tiền trả người
                bán.
              </p>
            </div>
          </section>
          <OrderHistory events={order.events} />
          {canManage ? (
            <OrderActions
              code={order.code}
              status={order.status}
              hasReceipts={order.hasReceipts}
            />
          ) : null}
          {canManage && order.status === "IN_PROGRESS" && order.hasReceipts ? (
            <p className="text-caption text-muted-foreground">
              Đơn đã có phiếu nhập thì không hủy được. Hàng nhập sai thì lập
              phiếu điều chỉnh kho.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Info({
  label,
  children,
  mask = false,
}: {
  label: string;
  children: React.ReactNode;
  /** Changes from run to run: screenshots mask it. */
  mask?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd data-mask={mask || undefined}>{children}</dd>
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReturnType<typeof toMoney>;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatMoney(value)}</dd>
    </div>
  );
}
