// Authentication, login, password recovery, and password change messages.
export const auth = {
  login: {
    title: "Đăng nhập",
    subtitle: "Đăng nhập bằng tài khoản được cấp để vào hệ thống.",
    usernameLabel: "Tên đăng nhập",
    usernamePlaceholder: "Nhập tên đăng nhập (VD: thukho)",
    passwordLabel: "Mật khẩu",
    showPassword: "Hiện mật khẩu",
    hidePassword: "Ẩn mật khẩu",
    rememberMe: "Ghi nhớ đăng nhập",
    submit: "Đăng nhập",
    submitting: "Đang đăng nhập…",
    forgotPasswordHelp:
      "Quên mật khẩu? Vui lòng liên hệ Giám đốc hoặc Quản trị viên để được cấp lại mật khẩu mới.",
  },
  changePassword: {
    title: "Đổi mật khẩu",
    subtitle: "Tài khoản của bạn đang dùng mật khẩu tạm. Vui lòng đổi mật khẩu để tiếp tục.",
    currentPassword: "Mật khẩu hiện tại",
    newPassword: "Mật khẩu mới",
    confirmPassword: "Xác nhận mật khẩu mới",
    submit: "Đổi mật khẩu",
    submitting: "Đang cập nhật…",
    success: "Đổi mật khẩu thành công. Đang chuyển hướng…",
    mismatch: "Mật khẩu xác nhận không khớp",
    minChars: "Mật khẩu mới phải có ít nhất 8 ký tự",
  },
} as const;
