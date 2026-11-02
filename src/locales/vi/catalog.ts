// Catalog row actions and item definitions.
export const catalog = {
  items: {
    rowActionAria: (code: string) => `Thao tác với ${code}`,
    editAction: "Chỉnh sửa",
    deactivateAction: "Ngừng sử dụng",
    activateAction: "Kích hoạt lại",
    deleteAction: "Xóa",
    archiveTitle: (code: string) => `Ngừng sử dụng ${code}?`,
    unarchiveTitle: (code: string) => `Kích hoạt lại ${code}?`,
    deactivatedNotice:
      "Vật tư ngừng sử dụng sẽ không xuất hiện khi tạo chứng từ mới. Các chứng từ cũ vẫn được bảo lưu.",
    activatedNotice:
      "Vật tư có thể được chọn lại khi tạo bộ hàng và chứng từ mới.",
    deleteTitle: (code: string) => `Xóa ${code}?`,
    deleteHelpText:
      "Chỉ có thể xóa vật tư chưa từng phát sinh giao dịch. Đối với vật tư đã có dữ liệu, vui lòng chọn Ngừng sử dụng.",
  },
} as const;
