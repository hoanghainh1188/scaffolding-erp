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
import { dict } from "@/locales";

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
            aria-label={dict.catalog.items.rowActionAria(item.code)}
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen("edit")}>
            {dict.catalog.items.editAction}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("status")}>
            {active
              ? dict.catalog.items.deactivateAction
              : dict.catalog.items.activateAction}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setOpen("delete")}
          >
            {dict.catalog.items.deleteAction}
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
        title={
          active
            ? dict.catalog.items.archiveTitle(item.code)
            : dict.catalog.items.unarchiveTitle(item.code)
        }
        description={
          active
            ? dict.catalog.items.deactivatedNotice
            : dict.catalog.items.activatedNotice
        }
        confirmLabel={
          active
            ? dict.catalog.items.deactivateAction
            : dict.catalog.items.activateAction
        }
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
        title={dict.catalog.items.deleteTitle(item.code)}
        description={dict.catalog.items.deleteHelpText}
        confirmLabel={dict.catalog.items.deleteAction}
        destructive
        error={action.error}
        onConfirm={async () =>
          (await action.run(path, { method: "DELETE" })) !== null
        }
      />
    </>
  );
}
