import { ChevronLeft, ChevronRight, DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";
import { connection } from "next/server";

import { AdjustmentDialog } from "@/components/billing/adjustment-dialog";
import { ClosePanel } from "@/components/billing/close-panel";
import { HolidayBand } from "@/components/billing/holiday-band";
import { PeriodContracts } from "@/components/billing/period-contracts";
import { StatementTable } from "@/components/billing/statement-table";
import { AmountDue, FreightTable } from "@/components/billing/statement-totals";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import {
  addDays,
  formatBusinessDate,
  toBusinessDate,
} from "@/domain/business-date";
import { can, canContract } from "@/domain/permissions";
import {
  formatMonth,
  monthOf,
  nextMonth,
  periodOf,
  vatText,
} from "@/domain/rental-billing";
import { requirePermission } from "@/lib/auth/guard";
import { contractStatement, periodList } from "@/lib/billing/queries";

export const metadata: Metadata = { title: "Tính tiền thuê" };

const previousMonth = (month: string) =>
  monthOf(addDays(periodOf(month).from, -1));

function pickMonth(raw: string | undefined, today: string): string {
  try {
    if (raw) return periodOf(raw).month;
  } catch {
    // An unreadable month falls back to the default.
  }
  // At the start of a month the accountant closes the month before.
  return previousMonth(monthOf(today));
}

/** D7 (rental-billing spec "Màn D7"). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; contract?: string }>;
}) {
  const user = await requirePermission("billing.view");
  if (!canContract(user, "RENTAL", "view")) forbidden();
  const query = await searchParams;
  await connection();
  const today = toBusinessDate(new Date());
  const month = pickMonth(query.month, today);
  const period = periodOf(month);
  const db = getDatabase();
  const list = await periodList(db, month, today);
  // From D5 a contract opens even in a month without rent.
  const asked =
    query.contract && /^[0-9a-f-]{36}$/i.test(query.contract)
      ? query.contract
      : undefined;
  const selectedId = asked ?? list.contracts[0]?.id;
  const view = selectedId
    ? await contractStatement(db, selectedId, month, today)
    : null;
  const manage = can(user.role, "billing.manage");
  const monthLink = (target: string) =>
    `/receivables/billing?month=${target}${selectedId ? `&contract=${selectedId}` : ""}`;

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1">
          <h1 className="text-h1">Tính tiền thuê</h1>
          <p className="text-body text-muted-foreground">
            Không tính ngày giao, tính đến hết ngày trả. Hàng mất coi như trả
            vào ngày lập phiếu thu hồi. Trừ ngày nghỉ chung trong Cài đặt.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Chọn kỳ" className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon">
              <Link
                href={monthLink(previousMonth(month))}
                aria-label="Kỳ trước"
              >
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
            <span
              className="rounded-md bg-muted px-3 py-2 text-label"
              data-mask
            >
              Kỳ {formatMonth(month)} ·{" "}
              {formatBusinessDate(period.from).slice(0, 5)} –{" "}
              {formatBusinessDate(period.to).slice(0, 5)}
            </span>
            <Button asChild variant="ghost" size="icon">
              <Link href={monthLink(nextMonth(month))} aria-label="Kỳ sau">
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          </nav>
          <Button asChild variant="outline">
            <a href={`/api/billing/periods/${month}/export`} download>
              <DownloadIcon aria-hidden /> Xuất Excel
            </a>
          </Button>
        </div>
      </div>

      <HolidayBand
        holidays={list.holidays}
        canEdit={can(user.role, "holidays.manage")}
      />

      <PeriodContracts
        month={month}
        contracts={list.contracts}
        closedCount={list.closedCount}
        selectedId={selectedId ?? null}
      />

      {view ? (
        <section
          aria-labelledby="statement-title"
          className="flex flex-col gap-5 rounded-lg border bg-card p-5"
        >
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="statement-title" className="text-h2">
                {view.contract.code}
              </h2>
              <p className="text-sm text-muted-foreground">
                {view.contract.customerName} · {view.contract.siteName} ·{" "}
                {view.vatBasisPoints === null
                  ? "Không lấy hóa đơn VAT"
                  : `VAT ${vatText(view.vatBasisPoints)}`}
              </p>
              {view.closed ? (
                <p className="text-sm" data-mask>
                  Đã chốt lúc{" "}
                  {view.closed.at.toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}{" "}
                  bởi {view.closed.byName}
                </p>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 text-sm">
              <dt className="text-muted-foreground">Hạn thanh toán</dt>
              <dt className="text-muted-foreground">Hạn trả</dt>
              <dd>{view.statement.paymentTermsDays} ngày sau chốt</dd>
              <dd className="font-medium" data-mask>
                {formatBusinessDate(view.statement.dueDate)}
              </dd>
            </dl>
          </header>

          {view.statement.running ? (
            <p
              role="status"
              className="text-sm text-muted-foreground"
              data-mask
            >
              Tạm tính đến {formatBusinessDate(view.statement.asOf)}. Kỳ chưa
              hết nên chưa có dòng bù tối thiểu cho hàng còn ở công trình.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-label">Chi tiết từng lượng hàng</h3>
            {manage && !view.closed ? (
              <AdjustmentDialog
                contractId={view.contract.id}
                month={month}
                closedMonths={view.closedMonths.filter(
                  (entry) => entry < month,
                )}
              />
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <StatementTable
              statement={view.statement}
              adjustmentActions={
                manage && !view.closed
                  ? (line) =>
                      line.adjustment ? (
                        <AdjustmentDialog
                          contractId={view.contract.id}
                          month={month}
                          closedMonths={view.closedMonths.filter(
                            (entry) => entry < month,
                          )}
                          existing={{
                            id: line.adjustment.id,
                            refMonth: line.adjustment.refMonth,
                            amount: line.adjustment.amount,
                            reason: line.adjustment.reason,
                            updatedAt: line.adjustment.updatedAt.toISOString(),
                          }}
                        />
                      ) : null
                  : undefined
              }
            />
          </div>
          <p className="text-caption text-muted-foreground">
            Từ = ngày đầu kỳ hoặc hôm sau ngày giao. Đến = ngày cuối kỳ hoặc
            ngày trả (gồm). Đổi giá theo phụ lục thì tách dòng tại ngày hiệu
            lực. Tiền đền bù tính riêng ở phiếu đền bù.
          </p>

          <section
            aria-labelledby="freight-title"
            className="flex flex-col gap-2"
          >
            <h3 id="freight-title" className="text-label">
              Cước vận chuyển trong kỳ
            </h3>
            <FreightTable statement={view.statement} />
          </section>

          {view.pending.length > 0 ? (
            <p role="note" className="rounded-md bg-muted p-3 text-sm">
              Còn{" "}
              {view.pending
                .map((entry) => `${entry.code} ${entry.label}`)
                .join(", ")}
              : khi ghi sổ, hàng tính vào kỳ của ngày đó. Nháp còn trên điện
              thoại cũng vậy.
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <AmountDue statement={view.statement} />
            <ClosePanel
              contractId={view.contract.id}
              contractCode={view.contract.code}
              month={month}
              totalAmount={view.statement.totalAmount}
              block={view.closeBlock}
              canClose={manage}
              closed={view.closed !== null}
            />
          </div>
        </section>
      ) : (
        <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
          Kỳ {formatMonth(month)} chưa có hợp đồng thuê nào có tiền thuê, cước
          hay dòng điều chỉnh.
        </p>
      )}
    </div>
  );
}
