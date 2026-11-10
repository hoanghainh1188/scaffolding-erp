import { PROVINCES, PROVINCE_MESSAGES } from "@/domain/province";
import type { SalesUser } from "@/lib/catalog/partners";
import { dict } from "@/locales";

import type { FormField } from "./record-form-sheet";

const KIND_OPTIONS = [
  { value: "COMPANY", label: "Công ty" },
  { value: "PERSON", label: "Cá nhân" },
];

export const CUSTOMER_FIELDS: FormField[] = [
  { name: "kind", label: "Loại", kind: "select", options: KIND_OPTIONS },
  { name: "name", label: "Tên nhà thầu", required: true },
  {
    name: "taxCode",
    label: "Mã số thuế",
    hint: "10 chữ số, hoặc thêm -XXX cho chi nhánh.",
  },
  { name: "contactName", label: "Người liên hệ" },
  { name: "phone", label: "Điện thoại", kind: "tel" },
  { name: "address", label: "Địa chỉ", kind: "textarea" },
  {
    name: "paymentTermsDays",
    label: "Hạn thanh toán mặc định (ngày)",
    kind: "number",
    hint: "Hợp đồng mới lấy số này làm mặc định. Từ 0 đến 365.",
  },
  { name: "note", label: "Ghi chú", kind: "textarea" },
];

/**
 * The customer form with the sales staff picker (catalog-extensions D5).
 * `current` keeps a person locked since, so saving other changes works.
 */
export function customerFields(
  staff: readonly SalesUser[],
  current: SalesUser | null = null,
): FormField[] {
  const text = dict.catalog.salesStaff;
  const options = staff.map((person) => ({
    value: person.id,
    label: person.name,
  }));
  if (current && !staff.some((person) => person.id === current.id)) {
    options.unshift({
      value: current.id,
      label: current.active ? current.name : text.locked(current.name),
    });
  }
  return [
    ...CUSTOMER_FIELDS,
    {
      name: "salesUserId",
      label: text.label,
      kind: "select",
      placeholder: text.noneOption,
      options,
      hint: "Chỉ để lọc và báo cáo, không giới hạn ai xem được nhà thầu.",
    },
  ];
}

export const SUPPLIER_FIELDS: FormField[] = [
  { name: "kind", label: "Loại", kind: "select", options: KIND_OPTIONS },
  { name: "name", label: "Tên nhà cung cấp", required: true },
  { name: "phone", label: "Điện thoại", kind: "tel" },
  { name: "address", label: "Địa chỉ", kind: "textarea" },
  { name: "taxCode", label: "Mã số thuế (công ty)" },
  {
    name: "idNumber",
    label: "Số CCCD (cá nhân)",
    inputMode: "numeric",
    hint: "12 chữ số. Ngoài form này chỉ hiện 4 số cuối.",
  },
  {
    name: "bankAccountLast4",
    label: "4 số cuối tài khoản",
    inputMode: "numeric",
    hint: "Chỉ nhập 4 số cuối. Phần mềm không lưu số đầy đủ.",
  },
  { name: "bankName", label: "Ngân hàng" },
  {
    name: "paymentTermsDays",
    label: "Số ngày được nợ",
    kind: "number",
    hint: "0 = trả ngay khi nhập. Chỉ áp cho phiếu nhập sau. Từ 0 đến 365.",
  },
  { name: "note", label: "Ghi chú", kind: "textarea" },
];

export const SITE_FIELDS: FormField[] = [
  { name: "name", label: "Tên công trình", required: true },
  {
    name: "province",
    label: dict.catalog.provinces.label,
    kind: "search-select",
    placeholder: dict.catalog.provinces.choose,
    searchLabel: dict.catalog.provinces.search,
    requiredMessage: PROVINCE_MESSAGES.required,
    options: PROVINCES.map((province) => ({
      value: province.code,
      label: province.name,
    })),
  },
  { name: "address", label: "Địa chỉ", kind: "textarea" },
];

export const LOCATION_FIELDS: FormField[] = [
  {
    name: "code",
    label: "Mã",
    hint: "VD: BAI-02. Không đổi được sau khi tạo.",
  },
  { name: "name", label: "Tên", required: true },
  {
    name: "type",
    label: "Loại",
    kind: "select",
    options: [
      { value: "YARD", label: "Bãi" },
      { value: "WORKSHOP", label: "Xưởng" },
    ],
  },
];
