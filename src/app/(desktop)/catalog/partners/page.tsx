import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { ItemsFilters } from "@/components/catalog/items-filters";
import {
  CustomerDetail,
  LocationDetail,
  SiteDetail,
  SupplierDetail,
} from "@/components/catalog/partner-details";
import {
  CUSTOMER_FIELDS,
  LOCATION_FIELDS,
  SUPPLIER_FIELDS,
} from "@/components/catalog/partner-form-fields";
import { RecordFormSheet } from "@/components/catalog/record-form-sheet";
import { CatalogSwitch, TabLinks } from "@/components/catalog/tab-links";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { formatPhone } from "@/domain/partner-fields";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { listCustomers, listSuppliers } from "@/lib/catalog/partners";
import { countPlaces, listLocations, listSites } from "@/lib/catalog/places";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Đối tác và công trình" };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Tab = "customers" | "suppliers" | "sites" | "locations";

const TABS: readonly Tab[] = ["customers", "suppliers", "sites", "locations"];

const one = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

interface ListEntry {
  id: string;
  title: string;
  subtitle: string;
}

/** D16 Đối tác & công trình (specs partner-directory, sites-and-locations). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("catalog.view");
  const params = await searchParams;
  const requested = one(params.tab);
  const tab: Tab = TABS.includes(requested as Tab)
    ? (requested as Tab)
    : "customers";
  const q = one(params.q);
  const status = one(params.status) === "archived" ? "ARCHIVED" : "ACTIVE";
  const selectedId = one(params.id);
  const canEditPartners = can(user.role, "partners.manage");
  const canEditLocations = can(user.role, "locations.manage");
  const db = getDatabase();

  const [activeCustomers, activeSuppliers, places] = await Promise.all([
    listCustomers(db),
    listSuppliers(db),
    countPlaces(db),
  ]);

  let entries: ListEntry[] = [];
  let detail: ReactNode = null;
  let addButton: ReactNode = null;

  if (tab === "customers") {
    const rows = await listCustomers(db, { q, status });
    entries = rows.map((row) => ({
      id: row.id,
      title: row.name,
      subtitle: `${row.code} · ${row.siteCount} công trình`,
    }));
    const selected = rows.find((row) => row.id === selectedId);
    if (selected) {
      const sites = await listSites(db, { customerId: selected.id });
      detail = (
        <CustomerDetail
          customer={selected}
          sites={sites}
          canEdit={canEditPartners}
        />
      );
    }
    if (canEditPartners) {
      addButton = (
        <RecordFormSheet
          title="Thêm nhà thầu"
          description="Mã nhà thầu tự sinh (NT-0001...)."
          trigger={
            <Button>
              <Plus aria-hidden />
              Thêm nhà thầu
            </Button>
          }
          fields={CUSTOMER_FIELDS}
          values={{ kind: "COMPANY", paymentTermsDays: 30 }}
          path="/api/catalog/customers"
          method="POST"
          submitLabel="Thêm nhà thầu"
        />
      );
    }
  } else if (tab === "suppliers") {
    const rows = await listSuppliers(db, { q, status });
    entries = rows.map((row) => ({
      id: row.id,
      title: row.name,
      subtitle: [row.code, row.phone ? formatPhone(row.phone) : null]
        .filter(Boolean)
        .join(" · "),
    }));
    const selected = rows.find((row) => row.id === selectedId);
    if (selected)
      detail = <SupplierDetail supplier={selected} canEdit={canEditPartners} />;
    if (canEditPartners) {
      addButton = (
        <RecordFormSheet
          title="Thêm nhà cung cấp"
          description="Người bán sắt vụn chỉ cần tên. Mã tự sinh (NCC-0001...)."
          trigger={
            <Button>
              <Plus aria-hidden />
              Thêm nhà cung cấp
            </Button>
          }
          fields={SUPPLIER_FIELDS}
          values={{ kind: "PERSON" }}
          path="/api/catalog/suppliers"
          method="POST"
          submitLabel="Thêm nhà cung cấp"
        />
      );
    }
  } else if (tab === "sites") {
    const rows = await listSites(db, { q, status });
    entries = rows.map((row) => ({
      id: row.id,
      title: row.name,
      subtitle: `${row.code} · ${row.customerName}`,
    }));
    const selected = rows.find((row) => row.id === selectedId);
    if (selected)
      detail = <SiteDetail site={selected} canEdit={canEditPartners} />;
  } else {
    const rows = (await listLocations(db, { status })).filter(
      (row) => row.type !== "SITE",
    );
    entries = rows.map((row) => ({
      id: row.id,
      title: row.name,
      subtitle: `${row.code} · ${row.type === "YARD" ? "Bãi" : "Xưởng"}`,
    }));
    const selected = rows.find((row) => row.id === selectedId);
    if (selected)
      detail = <LocationDetail place={selected} canEdit={canEditLocations} />;
    if (canEditLocations) {
      addButton = (
        <RecordFormSheet
          title="Thêm bãi hoặc xưởng"
          trigger={
            <Button>
              <Plus aria-hidden />
              Thêm bãi, xưởng
            </Button>
          }
          fields={LOCATION_FIELDS}
          values={{ type: "YARD" }}
          path="/api/catalog/locations"
          method="POST"
          submitLabel="Thêm"
        />
      );
    }
  }

  const tabHref = (target: Tab) => `/catalog/partners?tab=${target}`;
  const query = new URLSearchParams({ tab });
  if (q) query.set("q", q);
  if (status === "ARCHIVED") query.set("status", "archived");

  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6">
      <CatalogSwitch current="partners" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">Đối tác và công trình</h1>
        {addButton}
      </div>
      <TabLinks
        label="Loại đối tác"
        tabs={[
          {
            label: `Nhà thầu · ${activeCustomers.length}`,
            href: tabHref("customers"),
            active: tab === "customers",
          },
          {
            label: `Nhà cung cấp · ${activeSuppliers.length}`,
            href: tabHref("suppliers"),
            active: tab === "suppliers",
          },
          {
            label: `Công trình · ${places.sites}`,
            href: tabHref("sites"),
            active: tab === "sites",
          },
          {
            label: `Kho, bãi, xưởng · ${places.locations}`,
            href: tabHref("locations"),
            active: tab === "locations",
          },
        ]}
      />
      <div className="flex flex-wrap items-start gap-6">
        <section
          aria-labelledby="partner-list"
          className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 rounded-xl border bg-card p-5"
        >
          <h2 id="partner-list" className="sr-only">
            Danh sách
          </h2>
          {tab === "locations" ? null : (
            <ItemsFilters
              groups={[]}
              withGroups={false}
              placeholder="Tìm theo tên, mã, điện thoại"
            />
          )}
          {entries.length === 0 ? (
            <p className="text-body text-muted-foreground">
              Chưa có bản ghi nào khớp.
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {entries.map((entry) => {
                const link = new URLSearchParams(query);
                link.set("id", entry.id);
                return (
                  <li key={entry.id}>
                    <Link
                      href={`/catalog/partners?${link.toString()}`}
                      scroll={false}
                      aria-current={
                        entry.id === selectedId ? "true" : undefined
                      }
                      className={cn(
                        "flex flex-col p-3 hover:bg-accent",
                        entry.id === selectedId && "bg-accent",
                      )}
                    >
                      <span className="font-medium">{entry.title}</span>
                      <span className="text-caption text-muted-foreground">
                        {entry.subtitle}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section
          aria-label="Chi tiết"
          className="flex min-w-0 flex-[2_1_480px] flex-col gap-4 rounded-xl border bg-card p-5"
        >
          {detail ?? (
            <p className="text-body text-muted-foreground">
              Chọn một dòng bên trái để xem chi tiết.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
