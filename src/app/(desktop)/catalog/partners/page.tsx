import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { ItemsFilters } from "@/components/catalog/items-filters";
import {
  CustomerDetail,
  LocationDetail,
  SiteDetail,
  SupplierDetail,
  provinceText,
  regionText,
  salesUserText,
} from "@/components/catalog/partner-details";
import {
  LOCATION_FIELDS,
  SUPPLIER_FIELDS,
  customerFields,
} from "@/components/catalog/partner-form-fields";
import { UrlSelect } from "@/components/catalog/url-select";
import { RecordFormSheet } from "@/components/catalog/record-form-sheet";
import { CatalogSwitch, TabLinks } from "@/components/catalog/tab-links";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { toBusinessDate } from "@/domain/business-date";
import { formatPhone } from "@/domain/partner-fields";
import {
  REGIONS,
  REGION_LABELS,
  UNKNOWN_REGION_LABEL,
  parseProvinceFilter,
  parseRegionFilter,
  provincesIn,
} from "@/domain/province";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import {
  listCustomers,
  listSalesStaff,
  listSuppliers,
  currentDataNotice,
} from "@/lib/catalog/partners";
import { countPlaces, listLocations, listSites } from "@/lib/catalog/places";
import { cn } from "@/lib/utils";
import { dict } from "@/locales";

export const metadata: Metadata = { title: "Đối tác và công trình" };

type Search = Promise<Record<string, string | string[] | undefined>>;
type Tab = "customers" | "suppliers" | "sites" | "locations";

const TABS: readonly Tab[] = ["customers", "suppliers", "sites", "locations"];

const one = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/**
 * The row named in ?id=, else the first one: D16 opens with a detail
 * showing, as in the design (review of PR #28, point 2).
 */
function pick<T extends { id: string }>(rows: T[], id: string | undefined) {
  return rows.find((row) => row.id === id) ?? rows[0];
}

interface ListEntry {
  id: string;
  title: string;
  subtitle: string;
}

/** D16 Đối tác & công trình (specs partner-directory, sites-and-locations). */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requirePermission("catalog.view");
  await connection();
  const params = await searchParams;
  const requested = one(params.tab);
  const tab: Tab = TABS.includes(requested as Tab)
    ? (requested as Tab)
    : "customers";
  const q = one(params.q);
  const status = one(params.status) === "archived" ? "ARCHIVED" : "ACTIVE";
  const selectedId = one(params.id);
  const region = parseRegionFilter(one(params.region));
  // A province only counts inside the chosen region (spec: Lọc công trình).
  const province =
    region && region !== "UNKNOWN"
      ? parseProvinceFilter(one(params.province))
      : undefined;
  const sales = one(params.sales);
  const canEditPartners = can(user.role, "partners.manage");
  const canAnonymize = can(user.role, "partners.anonymize");
  const canEditLocations = can(user.role, "locations.manage");
  const db = getDatabase();

  const [activeCustomers, activeSuppliers, places] = await Promise.all([
    listCustomers(db),
    listSuppliers(db),
    countPlaces(db),
  ]);

  let entries: ListEntry[] = [];
  let shownId: string | undefined;
  let detail: ReactNode = null;
  let addButton: ReactNode = null;
  let filters: ReactNode = null;

  if (tab === "customers") {
    const [rows, staff] = await Promise.all([
      listCustomers(db, { q, status, sales }),
      listSalesStaff(db),
    ]);
    entries = rows.map((row) => ({
      id: row.id,
      title: row.name,
      subtitle: [
        row.code,
        `${row.siteCount} công trình`,
        salesUserText(row.salesUser),
      ]
        .filter(Boolean)
        .join(" · "),
    }));
    // Locked people still in charge of someone stay in the filter.
    const filterStaff = new Map(staff.map((person) => [person.id, person]));
    for (const row of activeCustomers) {
      if (row.salesUser && !filterStaff.has(row.salesUser.id)) {
        filterStaff.set(row.salesUser.id, row.salesUser);
      }
    }
    filters = (
      <UrlSelect
        id="filter-sales"
        label={dict.catalog.salesStaff.label}
        param="sales"
        allLabel={dict.catalog.salesStaff.all}
        options={[
          { value: "none", label: dict.catalog.salesStaff.none },
          ...[...filterStaff.values()].map((person) => ({
            value: person.id,
            label: salesUserText(person) ?? person.name,
          })),
        ]}
      />
    );
    const selected = pick(rows, selectedId);
    shownId = selected?.id;
    if (selected) {
      const sites = await listSites(db, { customerId: selected.id });
      detail = (
        <CustomerDetail
          key={selected.id}
          customer={selected}
          sites={sites}
          staff={staff}
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
          fields={customerFields(staff)}
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
    const selected = pick(rows, selectedId);
    shownId = selected?.id;
    if (selected)
      detail = (
        <SupplierDetail
          key={selected.id}
          supplier={selected}
          canEdit={canEditPartners}
          canAnonymize={canAnonymize}
          today={toBusinessDate(new Date())}
        />
      );
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
          withDataNotice
          noticeText={(await currentDataNotice(db)).text}
          path="/api/catalog/suppliers"
          method="POST"
          submitLabel="Thêm nhà cung cấp"
        />
      );
    }
  } else if (tab === "sites") {
    const rows = await listSites(db, { q, status, region, province });
    entries = rows.map((row) => ({
      id: row.id,
      title: row.name,
      subtitle: [
        row.code,
        row.customerName,
        provinceText(row),
        regionText(row),
      ].join(" · "),
    }));
    filters = (
      <div className="flex flex-wrap gap-3">
        <UrlSelect
          id="filter-region"
          label={dict.catalog.provinces.region}
          param="region"
          allLabel={dict.catalog.provinces.allRegions}
          clears={["province"]}
          options={[
            ...REGIONS.map((value) => ({
              value,
              label: REGION_LABELS[value],
            })),
            { value: "UNKNOWN", label: UNKNOWN_REGION_LABEL },
          ]}
        />
        {region && region !== "UNKNOWN" ? (
          <UrlSelect
            id="filter-province"
            label={dict.catalog.provinces.label}
            param="province"
            allLabel={dict.catalog.provinces.allProvinces}
            options={provincesIn(region).map((item) => ({
              value: item.code,
              label: item.name,
            }))}
          />
        ) : null}
        <p className="self-end pb-2.5 text-sm text-muted-foreground">
          {rows.length} công trình
        </p>
      </div>
    );
    const selected = pick(rows, selectedId);
    shownId = selected?.id;
    if (selected)
      detail = (
        <SiteDetail
          key={selected.id}
          site={selected}
          canEdit={canEditPartners}
        />
      );
  } else {
    const rows = (await listLocations(db, { status })).filter(
      (row) => row.type !== "SITE",
    );
    entries = rows.map((row) => ({
      id: row.id,
      title: row.name,
      subtitle: `${row.code} · ${row.type === "YARD" ? "Bãi" : "Xưởng"}`,
    }));
    const selected = pick(rows, selectedId);
    shownId = selected?.id;
    if (selected)
      detail = (
        <LocationDetail
          key={selected.id}
          place={selected}
          canEdit={canEditLocations}
        />
      );
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

  // Details carry key={selected.id}: switching records remounts them, so a
  // form opened on one record can never save its values onto the next.
  const tabHref = (target: Tab) => `/catalog/partners?tab=${target}`;
  const query = new URLSearchParams({ tab });
  if (q) query.set("q", q);
  if (status === "ARCHIVED") query.set("status", "archived");
  if (tab === "sites" && region) query.set("region", region);
  if (tab === "sites" && province) query.set("province", province);
  if (tab === "customers" && sales) query.set("sales", sales);

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
            label: "Nhà thầu",
            count: activeCustomers.length,
            href: tabHref("customers"),
            active: tab === "customers",
          },
          {
            label: "Nhà cung cấp",
            count: activeSuppliers.length,
            href: tabHref("suppliers"),
            active: tab === "suppliers",
          },
          {
            label: "Công trình",
            count: places.sites,
            href: tabHref("sites"),
            active: tab === "sites",
          },
          {
            label: "Kho, bãi, xưởng",
            count: places.locations,
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
          {filters}
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
                      aria-current={entry.id === shownId ? "true" : undefined}
                      className={cn(
                        "flex flex-col p-3 hover:bg-accent",
                        entry.id === shownId && "bg-accent",
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
