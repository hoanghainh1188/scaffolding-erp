import { TabLinks } from "@/components/catalog/tab-links";

/** The two pages of the Sản xuất menu item (design D6). */
export function ProductionTabs({ active }: { active: "orders" | "boms" }) {
  return (
    <TabLinks
      label="Sản xuất"
      tabs={[
        {
          label: "Lệnh sản xuất",
          href: "/production",
          active: active === "orders",
        },
        {
          label: "Định mức",
          href: "/production/boms",
          active: active === "boms",
        },
      ]}
    />
  );
}
