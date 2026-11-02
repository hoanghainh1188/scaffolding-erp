// Catalog row actions.
export const catalog = {
  items: {
    rowActionAria: (code: string) => `Thao tác với ${code}`,
    editAction: "Sửa",
    deactivateAction: "Ngừng dùng",
    activateAction: "Dùng lại",
    deleteAction: "Xóa",
    archiveTitle: (code: string) => `Ngừng dùng ${code}?`,
    unarchiveTitle: (code: string) => `Dùng lại ${code}?`,
    deactivatedNotice:
      "Không chọn được ở bộ và chứng từ mới. Chứng từ cũ vẫn giữ nguyên.",
    activatedNotice: "Vật tư chọn được lại ở bộ và chứng từ mới.",
    deleteTitle: (code: string) => `Xóa ${code}?`,
    deleteHelpText:
      "Chỉ xóa được vật tư chưa dùng ở đâu. Vật tư đã dùng thì ngừng dùng.",
  },
} as const;
