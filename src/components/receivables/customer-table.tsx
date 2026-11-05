// "Theo nhà thầu" of D14: filter tabs with counts, search, the table of
// one page and its pager. Every choice is a link (URL state, design D7).
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CustomerBalance,
  ReceivableFilter,
} from "@/lib/receivables/balances";
import { cn } from "@/lib/utils";

import { CUSTOMER_TONES, money } from "./format";

export const FILTER_LABELS: Readonly<Record<ReceivableFilter, string>> = {
  owing: "Đang nợ",
  overdue: "Quá hạn",
  prepaid: "Có trả trước",
  all: "Tất cả",
};

export interface ListState {
  filter: ReceivableFilter;
  q: string;
  page: number;
  customer: string | null;
  paid: boolean;
}

/** The D14 URL for a state. */
export function listHref(state: ListState, change: Partial<ListState> = {}) {
  const next = { ...state, ...change };
  const params = new URLSearchParams();
  if (next.filter !== "owing") params.set("filter", next.filter);
  if (next.q) params.set("q", next.q);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.customer) params.set("customer", next.customer);
  if (next.paid) params.set("paid", "1");
  const text = params.toString();
  return text ? `/receivables?${text}` : "/receivables";
}

interface CustomerTableProps {
  state: ListState;
  counts: Record<ReceivableFilter, number>;
  rows: readonly CustomerBalance[];
  page: number;
  pageCount: number;
}

export function CustomerTable(props: CustomerTableProps) {
  const { state } = props;
  return (
    <section
      aria-labelledby="customers-title"
      className="flex flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="customers-title" className="text-h2">
          Theo nhà thầu
        </h2>
        <nav
          aria-label="Lọc nhà thầu"
          className="flex flex-wrap gap-1 rounded-md bg-muted p-1"
        >
          {(Object.keys(FILTER_LABELS) as ReceivableFilter[]).map((filter) => (
            <Link
              key={filter}
              href={listHref(state, { filter, page: 1, customer: null })}
              aria-current={state.filter === filter ? "page" : undefined}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                state.filter === filter && "bg-card text-foreground shadow-xs",
              )}
            >
              {FILTER_LABELS[filter]}{" "}
              <span data-mask>({props.counts[filter]})</span>
            </Link>
          ))}
        </nav>
      </div>
      <form action="/receivables" className="flex max-w-md gap-2" role="search">
        {state.filter !== "owing" ? (
          <input type="hidden" name="filter" value={state.filter} />
        ) : null}
        <label htmlFor="customer-search" className="sr-only">
          Tìm nhà thầu
        </label>
        <input
          id="customer-search"
          name="q"
          defaultValue={state.q}
          placeholder="Tìm theo tên hoặc mã nhà thầu"
          className="h-10 flex-1 rounded-md border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        />
        <Button type="submit" variant="outline">
          Tìm
        </Button>
      </form>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nhà thầu</TableHead>
              <TableHead className="text-right">Thuê &amp; cước</TableHead>
              <TableHead className="text-right">Bán</TableHead>
              <TableHead className="text-right">Đền bù, mua lại</TableHead>
              <TableHead className="text-right">Đang nợ</TableHead>
              <TableHead className="text-right">Trong đó quá hạn</TableHead>
              <TableHead className="text-right">Trả trước</TableHead>
              <TableHead>Tình hình</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  Không có nhà thầu nào.
                </TableCell>
              </TableRow>
            ) : null}
            {props.rows.map((row) => {
              const selected = row.id === state.customer;
              return (
                <TableRow
                  key={row.id}
                  aria-selected={selected}
                  className={cn(selected && "bg-accent")}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={listHref(state, { customer: row.id })}
                      className="hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.rentAndFreight)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.sale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.compensationAndBuyBack)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {money(row.owed)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      row.overdue.amount > 0 && "text-destructive",
                    )}
                  >
                    {money(row.overdue.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.prepaid)}
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone={CUSTOMER_TONES[row.status.kind]} data-mask>
                      {row.status.label}
                    </ToneBadge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-muted-foreground">
          Số đã gồm VAT (chỉ khi khách lấy hóa đơn). File Excel tách riêng cột
          VAT và cột vận chuyển.
        </p>
        {props.pageCount > 1 ? (
          <nav aria-label="Trang" className="flex items-center gap-2 text-sm">
            <Button asChild variant="ghost" size="icon">
              <Link
                href={listHref(state, { page: Math.max(1, props.page - 1) })}
                aria-label="Trang trước"
                aria-disabled={props.page <= 1}
              >
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
            <span>
              Trang {props.page}/{props.pageCount}
            </span>
            <Button asChild variant="ghost" size="icon">
              <Link
                href={listHref(state, {
                  page: Math.min(props.pageCount, props.page + 1),
                })}
                aria-label="Trang sau"
                aria-disabled={props.page >= props.pageCount}
              >
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          </nav>
        ) : null}
      </div>
    </section>
  );
}
