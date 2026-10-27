import type { Metadata } from "next";

import { ItemFormSheet } from "@/components/catalog/item-form-sheet";
import { ItemKitsPanel } from "@/components/catalog/item-kits-panel";
import { ItemsFilters } from "@/components/catalog/items-filters";
import { ItemsHeader } from "@/components/catalog/items-header";
import { ItemsTable } from "@/components/catalog/items-table";
import { KitEditorDialog } from "@/components/catalog/kit-editor-dialog";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { listGroups } from "@/lib/catalog/item-groups";
import { listItems } from "@/lib/catalog/items";
import { listKits } from "@/lib/catalog/kits";

export const metadata: Metadata = { title: "Danh mục vật tư" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/** D9 Danh mục vật tư (spec item-catalog). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("catalog.view");
  const canEdit = can(user.role, "items.manage");
  const params = await searchParams;
  const db = getDatabase();
  const q = one(params.q);
  const groupId = one(params.group);
  const status = one(params.status) === "archived" ? "ARCHIVED" : "ACTIVE";
  const selectedCode = one(params.item)?.toUpperCase() ?? null;

  const [{ items, counts }, groups, allPieces] = await Promise.all([
    listItems(db, { q, groupId, status }),
    listGroups(db),
    listItems(db),
  ]);
  const selected =
    allPieces.items.find((row) => row.code === selectedCode) ??
    items.find((row) => row.code === selectedCode) ??
    null;
  const kits = selected
    ? await listKits(db, { containsItemId: selected.id, status: "ACTIVE" })
    : [];
  const activeGroups = groups.filter((group) => group.status === "ACTIVE");
  const parts = allPieces.items.filter((row) => row.unit === "PIECE");
  const query = new URLSearchParams(
    Object.entries({ q, group: groupId, status: one(params.status) }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  ).toString();

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <ItemsHeader
        activeItems={counts.activeItems}
        activeKits={counts.activeKits}
        groupCount={activeGroups.length}
        tab="items"
        action={canEdit ? <ItemFormSheet groups={activeGroups} /> : undefined}
      />
      {/* The table needs ~1.000px for every column, prices included: the
          Thuộc bộ panel sits beside it only on very wide screens. */}
      <div className="flex flex-col gap-6 min-[1700px]:flex-row min-[1700px]:items-start">
        <section
          aria-labelledby="item-list"
          className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 min-[1700px]:flex-1"
        >
          <h2 id="item-list" className="sr-only">
            Danh sách vật tư
          </h2>
          <ItemsFilters groups={activeGroups} placeholder="Tìm vật tư" />
          <ItemsTable
            items={items}
            query={query}
            selectedCode={selectedCode}
            canEdit={canEdit}
            groups={activeGroups}
          />
        </section>
        <ItemKitsPanel
          item={selected}
          kits={kits}
          editKit={
            canEdit
              ? (kit) => (
                  <KitEditorDialog
                    parts={parts}
                    kit={kit}
                    trigger={<Button variant="link">Sửa bộ</Button>}
                  />
                )
              : undefined
          }
        />
      </div>
    </div>
  );
}
