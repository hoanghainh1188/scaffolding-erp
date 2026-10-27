import Link from "next/link";

import { cn } from "@/lib/utils";

export interface TabLink {
  label: string;
  href: string;
  active: boolean;
}

/** Tabs that are links: the open tab lives in the URL (rules: URL as state). */
export function TabLinks({ label, tabs }: { label: string; tabs: TabLink[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium",
            tab.active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/** Switches between D9 (vật tư) and D16 (đối tác & công trình). */
export function CatalogSwitch({ current }: { current: "items" | "partners" }) {
  const links = [
    { key: "items", label: "Vật tư", href: "/catalog/items" },
    {
      key: "partners",
      label: "Đối tác & công trình",
      href: "/catalog/partners",
    },
  ] as const;
  return (
    <nav aria-label="Danh mục" className="flex gap-2">
      {links.map((link) => (
        <Link
          key={link.key}
          href={link.href}
          aria-current={current === link.key ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center rounded-pill border px-3.5 text-sm font-medium",
            current === link.key
              ? "border-primary bg-primary font-semibold text-primary-foreground"
              : "bg-card hover:bg-accent",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
