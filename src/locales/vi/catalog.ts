// Catalog items, kits, item groups, partners, and sites.
export const catalog = {
  title: "Danh mục",
  tabs: {
    items: "Vật tư & Thiết bị",
    groups: "Nhóm hàng",
    kits: "Bộ giàn giáo",
    partners: "Đối tác & Công trình",
  },
  items: {
    addItem: "Thêm vật tư",
    editItem: (code: string) => `Chỉnh sửa vật tư ${code}`,
    editAction: "Chỉnh sửa",
    deleteAction: "Xóa",
    rowActionAria: (code: string) => `Thao tác với ${code}`,
    archiveTitle: (code: string) => `Ngừng sử dụng ${code}?`,
    unarchiveTitle: (code: string) => `Kích hoạt lại ${code}?`,
    deleteTitle: (code: string) => `Xóa vật tư ${code}?`,
    codeHelpText: "Mã hàng dùng để in nhãn QR và đồng bộ sổ kho, không thể thay đổi sau khi lưu.",
    deleteHelpText:
      "Chỉ có thể xóa vật tư chưa từng phát sinh giao dịch. Đối với vật tư đã có dữ liệu, vui lòng chọn Ngừng sử dụng.",
    deactivateAction: "Ngừng sử dụng",
    activateAction: "Kích hoạt lại",
    deactivatedNotice:
      "Không chọn được ở bộ và chứng từ mới. Chứng từ cũ vẫn giữ nguyên.",
    activatedNotice:
      "Vật tư chọn được lại ở bộ và chứng từ mới.",
    unitPiece: "Cái (quy đổi theo trọng lượng chuẩn)",
    unitKg: "Kg (theo khối lượng cân thực tế)",
    compensationLoss: "Đơn giá đền bù: Mất hoàn toàn",
    compensationRepairable: "Đơn giá đền bù: Hư hỏng (sửa được)",
    rentPricePlaceholder: "Để trống nếu không cho thuê",
  },
  groups: {
    title: "Nhóm hàng",
    addGroup: "Thêm nhóm hàng",
    deleteHelpText: "Chỉ có thể xóa nhóm hàng khi không còn vật tư nào trực thuộc nhóm này.",
    deactivateNotice: "Nhóm hàng tạm ngừng sẽ không thể chọn khi tạo vật tư mới.",
  },
  partners: {
    customerTitle: "Nhà thầu / Khách hàng",
    supplierTitle: "Nhà cung cấp",
    siteTitle: "Công trình",
    companyKind: "Doanh nghiệp",
    personKind: "Cá nhân",
    defaultPaymentTerms: "Hạn thanh toán mặc định (ngày)",
    paymentTermsHint: "Số ngày được nợ tính từ ngày chốt kỳ thuê. Mặc định từ 0 đến 365 ngày.",
  },
} as const;
