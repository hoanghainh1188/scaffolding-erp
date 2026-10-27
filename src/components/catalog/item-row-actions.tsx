"use client";

import { Ellipsis } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ItemRow } from "@/lib/catalog/items";

import { ConfirmAction } from "./confirm-action";
import { ItemFormSheet } from "./item-form-sheet";
import { useCatalogAction } from "./use-catalog-action";

type Open = "edit" | "status" | "delete" | null;

/**
 * Per-row menu on D9, next to the row it acts on (review of PR #28, point
 * 3; same pattern as D17): edit, archive or bring back, delete.
 */
export function ItemRowActions({
  item,
  groups,
}: {
  item: ItemRow;
  groups: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState<Open>(null);
  const action = useCatalogAction();
  const active = item.status === "ACTIVE";
  const path = `/api/catalog/items/${item.id}`;
  const close = (next: boolean) => {
    if (!next) {
      setOpen(null);
      action.setError(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={`Thao tác với ${item.code}`}
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen("edit")}>
            Sửa
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("status")}>
            {active ? "Ngừng dùng" : "Dùng lại"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setOpen("delete")}
          >
            Xóa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ItemFormSheet
        groups={groups}
        item={item}
        open={open === "edit"}
        onOpenChange={close}
      />
      <ConfirmAction
        open={open === "status"}
        onOpenChange={close}
        title={active ? `Ngừng dùng ${item.code}?` : `Dùng lại ${item.code}?`}
        description={
          active
            ? "Không chọn được ở bộ và chứng từ mới. Chứng từ cũ vẫn giữ nguyên."
            : "Vật tư chọn được lại ở bộ và chứng từ mới."
        }
        confirmLabel={active ? "Ngừng dùng" : "Dùng lại"}
        error={action.error}
        onConfirm={async () =>
          (await action.run(path, {
            method: "PATCH",
            body: { status: active ? "ARCHIVED" : "ACTIVE" },
          })) !== null
        }
      />
      <ConfirmAction
        open={open === "delete"}
        onOpenChange={close}
        title={`Xóa ${item.code}?`}
        description="Chỉ xóa được vật tư chưa dùng ở đâu. Vật tư đã dùng thì ngừng dùng."
        confirmLabel="Xóa"
        destructive
        error={action.error}
        onConfirm={async () =>
          (await action.run(path, { method: "DELETE" })) !== null
        }
      />
    </>
  );
}
