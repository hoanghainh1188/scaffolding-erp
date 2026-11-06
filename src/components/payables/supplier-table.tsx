// "Theo người bán" of D14c: filter tabs with counts, search, the table of
// one page and its pager. Every choice is a link (URL state, design D8).
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { ToneBadge } from "@/components/domain/tone-badge";
import { CUSTOMER_TONES, money } from "@/components/receivables/format";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { termsLabel } from "@/domain/payables";
import type { PayableFilter, SupplierBalance } from "@/lib/payables/balances";
import { cn } from "@/lib/utils";

export const PAYABLE_FILTER_LABELS: Readonly<Record<PayableFilter, string>> = {
  owing: "Còn phải trả",
  overdue: "Quá hạn",
  advance: "Có ứng trước",
  all: "Tất cả",
};

const KIND_LABELS = { COMPANY: "Công ty", PERSON: "Cá nhân" } as const;

export interface PayableListState {
  filter: PayableFilter;
  q: string;
  page: number;
  supplier: string | null;
  paid: boolean;
}

/** The D14c URL for a state. */
export function payablesHref(
  state: PayableListState,
  change: Partial<PayableListState> = {},
) {
  const next = { ...state, ...change };
  const params = new URLSearchParams();
  if (next.filter !== "owing") params.set("filter", next.filter);
  if (next.q) params.set("q", next.q);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.supplier) params.set("supplier", next.supplier);
  if (next.paid) params.set("paid", "1");
  const text = params.toString();
  return text ? `/payables?${text}` : "/payables";
}

interface SupplierTableProps {
  state: PayableListState;
  counts: Record<PayableFilter, number>;
  rows: readonly SupplierBalance[];
  page: number;
  pageCount: number;
}

export function SupplierTable(props: SupplierTableProps) {
  const { state } = props;
  return (
    <section
      aria-labelledby="sellers-title"
      className="flex flex-col gap-4 rounded-lg border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sellers-title" className="text-h2">
          Theo người bán
        </h2>
        <nav
          aria-label="Lọc người bán"
          className="flex flex-wrap gap-1 rounded-md bg-muted p-1"
        >
          {(Object.keys(PAYABLE_FILTER_LABELS) as PayableFilter[]).map(
            (filter) => (
              <Link
                key={filter}
                href={payablesHref(state, { filter, page: 1, supplier: null })}
                aria-current={state.filter === filter ? "page" : undefined}
                className={cn(
                  "rounded-sm px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  state.filter === filter &&
                    "bg-card text-foreground shadow-xs",
                )}
              >
                {PAYABLE_FILTER_LABELS[filter]}{" "}
                <span data-mask>({props.counts[filter]})</span>
              </Link>
            ),
          )}
        </nav>
      </div>
      <form action="/payables" className="flex max-w-md gap-2" role="search">
        {state.filter !== "owing" ? (
          <input type="hidden" name="filter" value={state.filter} />
        ) : null}
        <label htmlFor="seller-search" className="sr-only">
          Tìm người bán
        </label>
        <input
          id="seller-search"
          name="q"
          defaultValue={state.q}
          placeholder="Tìm theo tên hoặc mã người bán"
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
              <TableHead>Người bán</TableHead>
              <TableHead className="text-right">Còn phải trả</TableHead>
              <TableHead className="text-right">Trong đó quá hạn</TableHead>
              <TableHead className="text-right">Đã ứng trước</TableHead>
              <TableHead>Tình hình</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Không có người bán nào.
                </TableCell>
              </TableRow>
            ) : null}
            {props.rows.map((row) => {
              const selected = row.id === state.supplier;
              return (
                <TableRow
                  key={row.id}
                  aria-selected={selected}
                  className={cn(selected && "bg-accent")}
                >
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={payablesHref(state, { supplier: row.id })}
                        className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {row.name}
                      </Link>
                      <span className="text-caption text-muted-foreground">
                        {KIND_LABELS[row.kind]} ·{" "}
                        {termsLabel(row.paymentTermsDays)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {money(row.owed)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      row.overdue.amount > 0
                        ? "font-semibold text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {money(row.overdue.amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.advance)}
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
          Số ngày được nợ đặt ở danh mục người bán (D16), mặc định 0 = trả ngay
          khi nhập.
        </p>
        {props.pageCount > 1 ? (
          <nav aria-label="Trang" className="flex items-center gap-2 text-sm">
            <Button asChild variant="ghost" size="icon">
              <Link
                href={payablesHref(state, {
                  page: Math.max(1, props.page - 1),
                })}
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
                href={payablesHref(state, {
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
