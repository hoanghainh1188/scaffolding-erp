"use client";

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Tailwind breakpoints only (design D12): md 768, lg 1024, xl 1280. */
export type Breakpoint = "md" | "lg" | "xl";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Numbers are right-aligned. */
    align?: "left" | "right";
    /** Hide the column below this width. Not allowed on the first column. */
    hideBelow?: Breakpoint;
  }
}

// Full class names so Tailwind generates them.
const HIDE_BELOW: Readonly<Record<Breakpoint, string>> = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

// ColumnDef's value type differs per column; `any` is the library's own idiom.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<TData> = ColumnDef<TData, any>;

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

/** Each screen writes its own invitation: no generic "Không có dữ liệu". */
export interface EmptyState {
  message: string;
  action?: EmptyStateAction;
}

interface DataTableProps<TData> {
  columns: DataTableColumn<TData>[];
  data: TData[];
  emptyState: EmptyState;
  pageSize?: number;
  /** Accessible name of the scrollable table area. */
  label?: string;
  className?: string;
}

function columnClasses<TData>(column: Column<TData, unknown>): string {
  const meta = column.columnDef.meta;
  return cn(
    meta?.align === "right" && "text-right",
    meta?.hideBelow && HIDE_BELOW[meta.hideBelow],
  );
}

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

/**
 * In development TanStack Table v8 times its memos with Date.now(), which
 * Cache Components rejects while prerendering. Suspense lets the table stream
 * instead; production builds never call Date.now() and render inline.
 */
export function DataTable<TData>(props: DataTableProps<TData>) {
  return (
    <Suspense fallback={<DataTableSkeleton className={props.className} />}>
      <DataTableContent {...props} />
    </Suspense>
  );
}

function DataTableSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-4",
        className,
      )}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

function DataTableContent<TData>({
  columns,
  data,
  emptyState,
  pageSize = 20,
  label = "Bảng dữ liệu",
  className,
}: DataTableProps<TData>) {
  if (process.env.NODE_ENV !== "production" && columns[0]?.meta?.hideBelow) {
    throw new Error(
      "DataTable: the first column is always visible; remove its hideBelow.",
    );
  }

  const [sorting, setSorting] = useState<SortingState>([]);
  // TanStack Table v8 returns mutable objects the React Compiler cannot
  // memoize; it skips this component, which is the documented behaviour.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    // Ascending first for every column, then descending, then unsorted.
    sortDescFirst: false,
    enableSortingRemoval: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;
  const { pageIndex } = table.getState().pagination;
  const total = data.length;
  const from = pageIndex * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="max-h-[calc(100dvh-14rem)] max-w-full overflow-auto"
      >
        <table className="w-full border-separate border-spacing-0 text-body">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header, index) => {
                  const sorted = header.column.getIsSorted();
                  const SortIcon =
                    sorted === "asc"
                      ? ArrowUp
                      : sorted === "desc"
                        ? ArrowDown
                        : ChevronsUpDown;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        header.column.getCanSort()
                          ? sorted
                            ? ARIA_SORT[sorted]
                            : "none"
                          : undefined
                      }
                      className={cn(
                        "sticky top-0 z-10 h-11 border-b bg-card px-4 text-left text-label whitespace-nowrap text-muted-foreground",
                        index === 0 && "left-0 z-20",
                        columnClasses(header.column),
                      )}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "-mx-2 inline-flex h-9 items-center gap-1 rounded-sm px-2 hover:bg-accent hover:text-accent-foreground",
                            header.column.columnDef.meta?.align === "right" &&
                              "flex-row-reverse",
                          )}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <SortIcon className="size-4" aria-hidden />
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <p className="text-body-lg text-muted-foreground">
                      {emptyState.message}
                    </p>
                    {emptyState.action && (
                      <EmptyAction action={emptyState.action} />
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="group/row">
                  {row.getVisibleCells().map((cell, index) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "h-12 border-b bg-card px-4 whitespace-nowrap tabular-nums group-hover/row:bg-muted",
                        index === 0 && "sticky left-0 z-[1]",
                        columnClasses(cell.column),
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > 0 && (
        <div className="flex items-center justify-end gap-2 px-4 py-2">
          <span className="text-caption text-muted-foreground tabular-nums">
            {from}–{to} / {total}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Trang trước"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Trang sau"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyAction({ action }: { action: EmptyStateAction }) {
  if (action.href) {
    return (
      <Button asChild>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return (
    <Button type="button" onClick={action.onClick}>
      {action.label}
    </Button>
  );
}
