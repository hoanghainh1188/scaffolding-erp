// Login and password change.
export const auth = {
  login: {
    title: "Đăng nhập",
    subtitle: "Dùng tên đăng nhập Giám đốc đã cấp cho bạn.",
    usernameLabel: "Tên đăng nhập",
    usernamePlaceholder: "VD: minhanh",
    passwordLabel: "Mật khẩu",
    showPassword: "Hiện mật khẩu",
    hidePassword: "Ẩn mật khẩu",
    rememberMe: "Giữ đăng nhập trên máy này",
    submit: "Đăng nhập",
    submitting: "Đang đăng nhập…",
    forgotPassword: "Quên mật khẩu? Nhờ Giám đốc đặt lại trong mục",
    forgotPasswordPlace: "Cài đặt › Người dùng",
  },
  changePassword: {
    currentPassword: "Mật khẩu hiện tại",
    newPassword: "Mật khẩu mới",
    confirmPassword: "Nhập lại mật khẩu mới",
    hint: "Ít nhất 8 ký tự. Một cụm từ dễ nhớ là tốt nhất, ví dụ “bai sau kho”.",
    submit: "Đổi mật khẩu",
    submitting: "Đang lưu…",
  },
} as const;
