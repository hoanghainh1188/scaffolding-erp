// Login and password change.
export const auth = {
  login: {
    title: "Đăng nhập",
    subtitle: "Đăng nhập bằng tài khoản được cấp để vào hệ thống.",
    usernameLabel: "Tên đăng nhập",
    usernamePlaceholder: "VD: minhanh",
    passwordLabel: "Mật khẩu",
    showPassword: "Hiện mật khẩu",
    hidePassword: "Ẩn mật khẩu",
    rememberMe: "Ghi nhớ đăng nhập",
    submit: "Đăng nhập",
    submitting: "Đang đăng nhập…",
    forgotPassword:
      "Quên mật khẩu? Vui lòng liên hệ Giám đốc hoặc Quản trị viên để được cấp lại mật khẩu mới trong mục",
    forgotPasswordPlace: "Cài đặt › Người dùng",
  },
  changePassword: {
    currentPassword: "Mật khẩu hiện tại",
    newPassword: "Mật khẩu mới",
    confirmPassword: "Nhập lại mật khẩu mới",
    hint: "Mật khẩu mới phải có ít nhất 8 ký tự. Nên dùng cụm từ dễ nhớ nhưng bảo mật cao (ví dụ: bai sau kho).",
    submit: "Đổi mật khẩu",
    submitting: "Đang lưu…",
  },
} as const;
