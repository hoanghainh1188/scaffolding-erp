import { Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ToneBadge } from "@/components/domain/tone-badge";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/domain/partner-fields";
import type { CustomerRow, SupplierRow } from "@/lib/catalog/partners";
import type { LocationRow, SiteRow } from "@/lib/catalog/places";

import {
  CUSTOMER_FIELDS,
  LOCATION_FIELDS,
  SITE_FIELDS,
  SUPPLIER_FIELDS,
} from "./partner-form-fields";
import { RecordActions } from "./record-actions";
import { RecordFormSheet } from "./record-form-sheet";

const KIND_LABELS = { COMPANY: "Công ty", PERSON: "Cá nhân" } as const;
const LOCATION_LABELS = {
  YARD: "Bãi",
  WORKSHOP: "Xưởng",
  SITE: "Công trình",
} as const;

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, value]) => value !== null && value !== "");
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Title({
  name,
  code,
  archived,
}: {
  name: string;
  code: string;
  archived: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-h2">{name}</h2>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{code}</span>
        {archived ? <ToneBadge tone="muted">Ngừng dùng</ToneBadge> : null}
      </div>
    </div>
  );
}

const editButton = <Button variant="outline">Sửa thông tin</Button>;

export function CustomerDetail({
  customer,
  sites,
  canEdit,
}: {
  customer: CustomerRow;
  sites: SiteRow[];
  canEdit: boolean;
}) {
  const path = `/api/catalog/customers/${customer.id}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Title
          name={customer.name}
          code={customer.code}
          archived={customer.status === "ARCHIVED"}
        />
        {canEdit ? (
          <RecordFormSheet
            title={`Sửa ${customer.code}`}
            trigger={editButton}
            fields={CUSTOMER_FIELDS}
            values={{ ...customer }}
            path={path}
            method="PATCH"
            submitLabel="Lưu thay đổi"
          />
        ) : null}
      </div>
      <Facts
        rows={[
          ["Loại", KIND_LABELS[customer.kind]],
          ["Mã số thuế", customer.taxCode],
          ["Người liên hệ", customer.contactName],
          ["Điện thoại", customer.phone ? formatPhone(customer.phone) : null],
          ["Hạn thanh toán mặc định", `${customer.paymentTermsDays} ngày`],
          ["Địa chỉ", customer.address],
          ["Ghi chú", customer.note],
        ]}
      />
      <section aria-labelledby="customer-sites" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="customer-sites" className="text-label">
            Công trình
          </h3>
          {canEdit && customer.status === "ACTIVE" ? (
            <RecordFormSheet
              title="Thêm công trình"
              description={`Công trình của ${customer.name}. Không đổi được nhà thầu sau khi tạo.`}
              trigger={
                <Button variant="outline">
                  <Plus aria-hidden />
                  Thêm công trình
                </Button>
              }
              fields={[
                { name: "customer", label: "Nhà thầu", readOnly: true },
                ...SITE_FIELDS,
              ]}
              values={{ customer: `${customer.code} · ${customer.name}` }}
              extra={{ customerId: customer.id }}
              path="/api/catalog/sites"
              method="POST"
              submitLabel="Thêm công trình"
            />
          ) : null}
        </div>
        {sites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có công trình nào.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {sites.map((place) => (
              <li key={place.id}>
                <Link
                  href={`/catalog/partners?tab=sites&id=${place.id}`}
                  className="flex flex-col p-3 hover:bg-accent"
                >
                  <span className="font-medium">{place.name}</span>
                  <span className="text-caption text-muted-foreground">
                    {place.code}
                    {place.address ? ` · ${place.address}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {canEdit ? (
        <RecordActions
          path={path}
          status={customer.status}
          label={`nhà thầu ${customer.code}`}
          afterDelete="/catalog/partners?tab=customers"
        />
      ) : null}
    </div>
  );
}

export function SupplierDetail({
  supplier,
  canEdit,
}: {
  supplier: SupplierRow;
  canEdit: boolean;
}) {
  const path = `/api/catalog/suppliers/${supplier.id}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Title
          name={supplier.name}
          code={supplier.code}
          archived={supplier.status === "ARCHIVED"}
        />
        {canEdit ? (
          <RecordFormSheet
            title={`Sửa ${supplier.code}`}
            trigger={editButton}
            fields={SUPPLIER_FIELDS}
            loadValues={`${path}/edit`}
            path={path}
            method="PATCH"
            submitLabel="Lưu thay đổi"
          />
        ) : null}
      </div>
      <Facts
        rows={[
          ["Loại", KIND_LABELS[supplier.kind]],
          ["Điện thoại", supplier.phone ? formatPhone(supplier.phone) : null],
          ["Địa chỉ", supplier.address],
          ["Mã số thuế", supplier.taxCode],
          ["Số CCCD", supplier.idNumberMasked],
          [
            "Tài khoản",
            supplier.bankAccountMasked
              ? [supplier.bankAccountMasked, supplier.bankName]
                  .filter(Boolean)
                  .join(" · ")
              : null,
          ],
          ["Ghi chú", supplier.note],
        ]}
      />
      {canEdit ? (
        <RecordActions
          path={path}
          status={supplier.status}
          label={`nhà cung cấp ${supplier.code}`}
          afterDelete="/catalog/partners?tab=suppliers"
        />
      ) : null}
    </div>
  );
}

export function SiteDetail({
  site,
  canEdit,
}: {
  site: SiteRow;
  canEdit: boolean;
}) {
  const path = `/api/catalog/sites/${site.id}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Title
          name={site.name}
          code={site.code}
          archived={site.status === "ARCHIVED"}
        />
        {canEdit ? (
          <RecordFormSheet
            title={`Sửa ${site.code}`}
            trigger={editButton}
            fields={SITE_FIELDS}
            values={{ ...site }}
            path={path}
            method="PATCH"
            submitLabel="Lưu thay đổi"
          />
        ) : null}
      </div>
      <Facts
        rows={[
          [
            "Nhà thầu",
            <Link
              key="customer"
              href={`/catalog/partners?tab=customers&id=${site.customerId}`}
              className="underline-offset-4 hover:underline"
            >
              {site.customerCode} · {site.customerName}
            </Link>,
          ],
          ["Địa chỉ", site.address],
          ["Vị trí kho", `${site.code} (tự tạo cùng công trình)`],
        ]}
      />
      <p className="text-caption text-muted-foreground">
        Mỗi công trình đi với một hợp đồng. Chuyển hàng sang công trình khác thì
        làm phiếu trả về bãi rồi xuất theo hợp đồng mới.
      </p>
      {canEdit ? (
        <RecordActions
          path={path}
          status={site.status}
          label={`công trình ${site.code}`}
          afterDelete="/catalog/partners?tab=sites"
        />
      ) : null}
    </div>
  );
}

export function LocationDetail({
  place,
  canEdit,
}: {
  place: LocationRow;
  canEdit: boolean;
}) {
  const path = `/api/catalog/locations/${place.id}`;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Title
          name={place.name}
          code={place.code}
          archived={place.status === "ARCHIVED"}
        />
        {canEdit ? (
          <RecordFormSheet
            title={`Sửa ${place.code}`}
            trigger={editButton}
            fields={LOCATION_FIELDS.filter((field) => field.name === "name")}
            values={{ ...place }}
            path={path}
            method="PATCH"
            submitLabel="Lưu thay đổi"
          />
        ) : null}
      </div>
      <Facts rows={[["Loại", LOCATION_LABELS[place.type]]]} />
      {canEdit ? (
        <RecordActions
          path={path}
          status={place.status}
          label={`${LOCATION_LABELS[place.type].toLowerCase()} ${place.code}`}
          afterDelete="/catalog/partners?tab=locations"
        />
      ) : null}
    </div>
  );
}
