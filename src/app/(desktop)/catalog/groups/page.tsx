import type { Metadata } from "next";

import { GroupsEditor } from "@/components/catalog/groups-editor";
import { ItemsHeader } from "@/components/catalog/items-header";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { listGroups } from "@/lib/catalog/item-groups";
import { listItems } from "@/lib/catalog/items";

export const metadata: Metadata = { title: "Nhóm hàng" };

/** D9 tab Nhóm hàng (spec item-catalog). */
export default async function Page() {
  const user = await requirePermission("catalog.view");
  const db = getDatabase();
  const [{ counts }, groups] = await Promise.all([
    listItems(db),
    listGroups(db),
  ]);
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <ItemsHeader
        activeItems={counts.activeItems}
        activeKits={counts.activeKits}
        groupCount={groups.filter((group) => group.status === "ACTIVE").length}
        tab="groups"
      />
      <section className="rounded-xl border bg-card p-5">
        <GroupsEditor
          groups={groups}
          canEdit={can(user.role, "items.manage")}
        />
      </section>
    </div>
  );
}
