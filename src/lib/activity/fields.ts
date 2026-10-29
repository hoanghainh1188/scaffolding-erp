// The fields an edit is compared on, per document type (activity-log design
// D6), with labels as the forms show them. Values are written as D18 shows
// them; CCCD and bank account are marked sensitive and leave diffFields
// masked. Never list a password, updated_at or updated_by here.
import type { FieldSpec, LineSpec } from "@/domain/activity-changes";
import { formatMoney, toMoney } from "@/domain/money";
import { formatPhone } from "@/domain/partner-fields";
import { formatQuantity, quantityFromDb } from "@/domain/quantity";

export const STATUS_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: "Đang dùng",
  ARCHIVED: "Ngừng dùng",
};

const PARTNER_KIND_LABELS: Readonly<Record<string, string>> = {
  COMPANY: "Công ty",
  PERSON: "Cá nhân",
};

const LOCATION_KIND_LABELS: Readonly<Record<string, string>> = {
  YARD: "Bãi",
  WORKSHOP: "Xưởng",
  SITE: "Công trình",
};

/** "190.000 ₫", or null. */
export function moneyText(value: number | null | undefined): string | null {
  return value === null || value === undefined
    ? null
    : formatMoney(toMoney(value));
}

/** "13,5 kg/cái", or null. */
function weightText(value: string | null): string | null {
  return value === null
    ? null
    : `${formatQuantity(quantityFromDb(value, "KG"))} kg/cái`;
}

function phoneText(value: string | null): string | null {
  return value ? formatPhone(value) : null;
}

const text = (value: string | null | undefined) =>
  value === undefined || value === null || value === "" ? null : value;

const status = <T extends { status: string }>(): FieldSpec<T> => ({
  field: "status",
  label: "Trạng thái",
  value: (row) => STATUS_LABELS[row.status] ?? row.status,
});

export interface ItemView {
  name: string;
  groupName: string;
  standardWeightKg: string | null;
  dailyRentalPrice: number | null;
  lostPrice: number | null;
  damagePrice: number | null;
  status: string;
}

export const ITEM_FIELDS: readonly FieldSpec<ItemView>[] = [
  { field: "name", label: "Tên vật tư", value: (r) => r.name },
  { field: "group", label: "Nhóm", value: (r) => r.groupName },
  {
    field: "standardWeightKg",
    label: "Trọng lượng chuẩn",
    value: (r) => weightText(r.standardWeightKg),
  },
  {
    field: "dailyRentalPrice",
    label: "Giá thuê / ngày",
    value: (r) => moneyText(r.dailyRentalPrice),
  },
  {
    field: "lostPrice",
    label: "Giá đền mất",
    value: (r) => moneyText(r.lostPrice),
  },
  {
    field: "damagePrice",
    label: "Giá đền hỏng",
    value: (r) => moneyText(r.damagePrice),
  },
  status<ItemView>(),
];

export interface GroupView {
  name: string;
  sortOrder: number;
  status: string;
}

export const GROUP_FIELDS: readonly FieldSpec<GroupView>[] = [
  { field: "name", label: "Tên nhóm", value: (r) => r.name },
  { field: "sortOrder", label: "Thứ tự", value: (r) => String(r.sortOrder) },
  status<GroupView>(),
];

export interface KitView {
  name: string;
  status: string;
}

export const KIT_FIELDS: readonly FieldSpec<KitView>[] = [
  { field: "name", label: "Tên bộ", value: (r) => r.name },
  status<KitView>(),
];

export interface KitPartView {
  code: string;
  quantity: number;
}

export const KIT_PARTS: LineSpec<KitPartView> = {
  field: "components",
  key: (part) => part.code,
  whole: (part) => `${part.quantity} cái`,
  columns: [
    { field: "quantity", label: "Số lượng", value: (p) => `${p.quantity} cái` },
  ],
};

export interface CustomerView {
  kind: string;
  name: string;
  taxCode: string | null;
  contactName: string | null;
  phone: string | null;
  address: string | null;
  paymentTermsDays: number;
  note: string | null;
  status: string;
}

export const CUSTOMER_FIELDS: readonly FieldSpec<CustomerView>[] = [
  {
    field: "kind",
    label: "Loại",
    value: (r) => PARTNER_KIND_LABELS[r.kind] ?? r.kind,
  },
  { field: "name", label: "Tên nhà thầu", value: (r) => r.name },
  { field: "taxCode", label: "Mã số thuế", value: (r) => text(r.taxCode) },
  {
    field: "contactName",
    label: "Người liên hệ",
    value: (r) => text(r.contactName),
  },
  { field: "phone", label: "Điện thoại", value: (r) => phoneText(r.phone) },
  { field: "address", label: "Địa chỉ", value: (r) => text(r.address) },
  {
    field: "paymentTermsDays",
    label: "Hạn thanh toán mặc định",
    value: (r) => `${r.paymentTermsDays} ngày`,
  },
  { field: "note", label: "Ghi chú", value: (r) => text(r.note) },
  status<CustomerView>(),
];

export interface SupplierView {
  kind: string;
  name: string;
  phone: string | null;
  address: string | null;
  taxCode: string | null;
  idNumber: string | null;
  bankAccount: string | null;
  bankName: string | null;
  note: string | null;
  status: string;
}

export const SUPPLIER_FIELDS: readonly FieldSpec<SupplierView>[] = [
  {
    field: "kind",
    label: "Loại",
    value: (r) => PARTNER_KIND_LABELS[r.kind] ?? r.kind,
  },
  { field: "name", label: "Tên nhà cung cấp", value: (r) => r.name },
  { field: "phone", label: "Điện thoại", value: (r) => phoneText(r.phone) },
  { field: "address", label: "Địa chỉ", value: (r) => text(r.address) },
  { field: "taxCode", label: "Mã số thuế", value: (r) => text(r.taxCode) },
  {
    field: "idNumber",
    label: "Số CCCD",
    value: (r) => text(r.idNumber),
    sensitive: "ID_NUMBER",
  },
  {
    field: "bankAccount",
    label: "Số tài khoản",
    value: (r) => text(r.bankAccount),
    sensitive: "BANK_ACCOUNT",
  },
  { field: "bankName", label: "Ngân hàng", value: (r) => text(r.bankName) },
  { field: "note", label: "Ghi chú", value: (r) => text(r.note) },
  status<SupplierView>(),
];

export interface SiteView {
  name: string;
  address: string | null;
  status: string;
}

export const SITE_FIELDS: readonly FieldSpec<SiteView>[] = [
  { field: "name", label: "Tên công trình", value: (r) => r.name },
  { field: "address", label: "Địa chỉ", value: (r) => text(r.address) },
  status<SiteView>(),
];

export interface LocationView {
  name: string;
  status: string;
}

export const LOCATION_FIELDS: readonly FieldSpec<LocationView>[] = [
  { field: "name", label: "Tên", value: (r) => r.name },
  status<LocationView>(),
];

/** "Bãi", "Xưởng". */
export function locationKindLabel(type: string): string {
  return LOCATION_KIND_LABELS[type] ?? type;
}

/** Every spec, for the test that no password or stamp is ever compared. */
export const ALL_FIELD_SPECS: readonly (readonly FieldSpec<never>[])[] = [
  ITEM_FIELDS,
  GROUP_FIELDS,
  KIT_FIELDS,
  CUSTOMER_FIELDS,
  SUPPLIER_FIELDS,
  SITE_FIELDS,
  LOCATION_FIELDS,
] as never;
