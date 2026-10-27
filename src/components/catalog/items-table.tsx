"use client";

import Link from "next/link";

import {
  DataTable,
  type DataTableColumn,
} from "@/components/domain/data-table";
import { QUANTITY_UNIT_LABELS } from "@/domain/quantity";
import type { ItemRow } from "@/lib/catalog/items";

import { formatPrice, formatWeight, monthlyPrice } from "./format";
import { ItemRowActions } from "./item-row-actions";

interface ItemsTableProps {
  items: ItemRow[];
  /** Adds the per-row menu (people with items.manage). */
  canEdit?: boolean;
  groups?: { id: string; name: string }[];
  /** Current query string without `item`, to build the select links. */
  query: string;
  selectedCode: string | null;
}

const NOT_FOR_RENT = "Không cho thuê";

/** D9 item list; the name opens "Thuộc bộ" for that item. */
export function ItemsTable({
  items,
  query,
  selectedCode,
  canEdit = false,
  groups = [],
}: ItemsTableProps) {
  const linkFor = (code: string) => {
    const params = new URLSearchParams(query);
    params.set("item", code);
    return `/catalog/items?${params.toString()}`;
  };

  const columns: DataTableColumn<ItemRow>[] = [
    {
      id: "name",
      header: "Vật tư",
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <Link
          href={linkFor(row.original.code)}
          scroll={false}
          aria-current={row.original.code === selectedCode ? "true" : undefined}
          // The only column allowed to wrap: long names take two lines so
          // the rent columns keep fitting at 1366px whatever the font
          // metrics (CI on Linux renders ~1px wider than macOS).
          className="flex min-w-36 flex-col rounded-sm whitespace-normal hover:underline aria-[current=true]:font-semibold"
        >
          <span>{row.original.name}</span>
          <span className="text-caption text-muted-foreground">
            {row.original.code}
          </span>
        </Link>
      ),
    },
    { id: "group", header: "Nhóm", accessorFn: (row) => row.groupName },
    {
      id: "unit",
      header: "ĐVT",
      accessorFn: (row) => QUANTITY_UNIT_LABELS[row.unit],
      meta: { hideBelow: "md" },
    },
    {
      id: "weight",
      header: "Trọng lượng chuẩn",
      accessorFn: (row) => formatWeight(row.standardWeightKg),
      meta: { align: "right", hideBelow: "md" },
    },
    {
      id: "daily",
      header: "Giá thuê / ngày",
      accessorFn: (row) =>
        row.unit === "KG" ? "–" : formatPrice(row.dailyRentalPrice),
      meta: { align: "right" },
    },
    {
      id: "monthly",
      header: "Giá thuê / tháng",
      accessorFn: (row) =>
        row.unit === "KG" || row.dailyRentalPrice === null
          ? NOT_FOR_RENT
          : formatPrice(monthlyPrice(row.dailyRentalPrice)),
      meta: { align: "right", hideBelow: "lg" },
    },
    ...(canEdit
      ? [
          {
            id: "actions",
            header: () => <span className="sr-only">Thao tác</span>,
            enableSorting: false,
            cell: ({ row }) => (
              <ItemRowActions item={row.original} groups={groups} />
            ),
          } satisfies DataTableColumn<ItemRow>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        columns={columns}
        data={items}
        label="Danh sách vật tư"
        emptyState={{
          message: "Chưa có vật tư nào khớp",
          action: { label: "Xem tất cả", href: "/catalog/items" },
        }}
      />
      <p className="text-caption text-muted-foreground">
        Giá tháng tự tính bằng giá ngày × 30.
      </p>
    </div>
  );
}
