// Audit logging, action types, table headers, and activity filters.
export const activity = {
  title: "Nhật ký thao tác",
  subtitle: "Ghi nhận toàn bộ thao tác thay đổi dữ liệu và đăng nhập hệ thống.",
  table: {
    timestamp: "Thời điểm",
    actor: "Người thực hiện",
    action: "Thao tác",
    entity: "Đối tượng",
    device: "Thiết bị",
    details: "Chi tiết thay đổi",
    viewDetails: "Xem chi tiết",
    hideDetails: "Ẩn chi tiết",
  },
  actionTypes: {
    all: "Tất cả thao tác",
    CREATE: "Tạo mới",
    UPDATE: "Chỉnh sửa",
    APPROVAL: "Duyệt / Ghi sổ",
    REVERSAL: "Hủy / Trả về / Xóa",
    SIGN_IN: "Đăng nhập",
  },
  export: {
    action: "Xuất file Excel",
    exporting: "Đang xuất dữ liệu…",
    errorNetwork: "Không thể tải file. Vui lòng kiểm tra kết nối mạng và thử lại.",
    errorGeneric: "Xuất file không thành công. Vui lòng thử lại sau.",
  },
} as const;
