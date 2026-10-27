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
    name: "bankAccount",
    label: "Số tài khoản",
    inputMode: "numeric",
    hint: "Ngoài form này chỉ hiện 4 số cuối.",
  },
  { name: "bankName", label: "Ngân hàng" },
  { name: "note", label: "Ghi chú", kind: "textarea" },
];

export const SITE_FIELDS: FormField[] = [
  { name: "name", label: "Tên công trình", required: true },
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
