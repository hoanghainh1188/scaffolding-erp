// User management, roles, temporary passwords, locks, and devices.
export const users = {
  title: "Quản lý người dùng",
  addUser: "Thêm tài khoản",
  table: {
    fullName: "Họ và tên",
    username: "Tên đăng nhập",
    role: "Vai trò",
    platform: "Thiết bị sử dụng",
    lastLogin: "Đăng nhập gần nhất",
    status: "Trạng thái",
    emptyRole: "Chưa có tài khoản nào thuộc vai trò này",
    summary: (activeCount: number, lockedCount: number) =>
      `${activeCount} tài khoản đang hoạt động · ${lockedCount} tài khoản bị khóa`,
  },
  roles: {
    DIRECTOR: "Giám đốc",
    ACCOUNTANT: "Kế toán",
    SALES: "Kinh doanh",
    WAREHOUSE: "Thủ kho",
    WORKSHOP: "Xưởng",
    descriptions: {
      DIRECTOR: "Toàn quyền quản trị, duyệt hợp đồng, phiếu đền bù và quản lý người dùng (máy tính).",
      ACCOUNTANT: "Chốt tiền thuê, theo dõi công nợ, xuất báo cáo Excel (máy tính).",
      SALES: "Tạo đơn mua hàng, báo giá, lập hợp đồng (máy tính).",
      WAREHOUSE: "Quét mã, nhập kho, xuất kho, kiểm kê thực tế tại bãi (điện thoại).",
      WORKSHOP: "Lập phiếu sửa chữa, ghi nhận tân trang hàng hóa (điện thoại).",
    },
  },
  devices: {
    DESKTOP: "Máy tính (Desktop)",
    MOBILE: "Điện thoại (Mobile PWA)",
  },
  actions: {
    resetPassword: "Đặt lại mật khẩu",
    reissueTempPassword: "Cấp lại mật khẩu tạm",
    lockAccount: "Khóa tài khoản",
    unlockAccount: "Mở khóa tài khoản",
  },
  dialogs: {
    roleRequired: "Vui lòng chọn vai trò người dùng",
    tempPasswordTitle: "Thông tin mật khẩu tạm",
    tempPasswordHelp:
      "Mật khẩu này có hiệu lực trong 48 giờ. Người dùng bắt buộc phải đổi mật khẩu ở lần đăng nhập đầu tiên.",
  },
} as const;
