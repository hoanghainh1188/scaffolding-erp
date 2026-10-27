import type { ReactNode } from "react";

import { CatalogSwitch, TabLinks } from "./tab-links";

interface ItemsHeaderProps {
  activeItems: number;
  activeKits: number;
  groupCount: number;
  tab: "items" | "kits" | "groups";
  /** "Thêm vật tư" / "Thêm bộ", only for people who may edit. */
  action?: ReactNode;
}

/** D9 title, counts and the Vật tư / Bộ / Nhóm hàng tabs. */
export function ItemsHeader({
  activeItems,
  activeKits,
  groupCount,
  tab,
  action,
}: ItemsHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <CatalogSwitch current="items" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">Danh mục vật tư</h1>
          <p className="text-sm text-muted-foreground">
            {activeItems} mã hàng · {activeKits} bộ
          </p>
        </div>
        {action}
      </div>
      <TabLinks
        label="Phần của danh mục vật tư"
        tabs={[
          {
            label: `Vật tư · ${activeItems}`,
            href: "/catalog/items",
            active: tab === "items",
          },
          {
            label: `Bộ · ${activeKits}`,
            href: "/catalog/kits",
            active: tab === "kits",
          },
          {
            label: `Nhóm hàng · ${groupCount}`,
            href: "/catalog/groups",
            active: tab === "groups",
          },
        ]}
      />
    </div>
  );
}
