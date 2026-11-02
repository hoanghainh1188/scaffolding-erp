import { Plus } from "lucide-react";
import type { Metadata } from "next";

import { ItemsFilters } from "@/components/catalog/items-filters";
import { ItemsHeader } from "@/components/catalog/items-header";
import { KitEditorDialog } from "@/components/catalog/kit-editor-dialog";
import { KitsList } from "@/components/catalog/kits-list";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { isCountUnit } from "@/domain/quantity";
import { listGroups } from "@/lib/catalog/item-groups";
import { listItems } from "@/lib/catalog/items";
import { listKits } from "@/lib/catalog/kits";

export const metadata: Metadata = { title: "Bộ vật tư" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** D9 tab Bộ: kits for quoting (spec item-catalog, design D2). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("catalog.view");
  const canEdit = can(user.role, "items.manage");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const status = params.status === "archived" ? "ARCHIVED" : "ACTIVE";
  const db = getDatabase();
  const [{ items, counts }, groups, kits] = await Promise.all([
    listItems(db),
    listGroups(db),
    listKits(db, { q, status }),
  ]);
  const parts = items.filter((row) => isCountUnit(row.unit));

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <ItemsHeader
        activeItems={counts.activeItems}
        activeKits={counts.activeKits}
        groupCount={groups.filter((group) => group.status === "ACTIVE").length}
        tab="kits"
        action={
          canEdit ? (
            <KitEditorDialog
              parts={parts}
              trigger={
                <Button>
                  <Plus aria-hidden />
                  Thêm bộ
                </Button>
              }
            />
          ) : undefined
        }
      />
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <ItemsFilters groups={[]} withGroups={false} placeholder="Tìm bộ" />
        <KitsList kits={kits} parts={parts} canEdit={canEdit} />
      </section>
    </div>
  );
}
