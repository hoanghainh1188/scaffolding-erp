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
  twoFactor: {
    codeTitle: "Nhập mã xác thực",
    codeSubtitle: (username: string) =>
      `Mở ứng dụng tạo mã trên điện thoại, nhập 6 số đang hiện cho tài khoản ${username}.`,
    codeLabel: "Mã 6 số",
    trustDevice: "Tin thiết bị này 30 ngày",
    trustDeviceHint: "Chỉ chọn trên máy riêng. Máy đã tin chỉ cần mật khẩu.",
    confirm: "Xác nhận",
    confirming: "Đang kiểm tra…",
    clockHint: "Mã không đúng dù gõ đúng? Bật giờ tự động trên điện thoại.",
    useBackup: "Dùng mã dự phòng",
    useApp: "Dùng mã từ ứng dụng",
    backToLogin: "Quay lại đăng nhập",
    backupTitle: "Nhập mã dự phòng",
    backupSubtitle:
      "Dùng khi không có điện thoại bên cạnh. Mỗi mã chỉ dùng được một lần.",
    backupLabel: "Mã dự phòng",
    panelCode: "Còn một bước nữa thôi.",
    panelSetup: "Thêm một lớp, yên tâm hơn.",
    panelManage: "Tài khoản đang được bảo vệ.",
    active: "Đang bật",
    steps: ["Nhập lại mật khẩu", "Thêm vào điện thoại", "Lưu mã dự phòng"],
    setupTitle: "Bật xác thực 2 lớp",
    setupSubtitle:
      "Tài khoản của bạn giữ dữ liệu quan trọng nên cần thêm một mã từ điện thoại khi đăng nhập. Nhập lại mật khẩu để bắt đầu.",
    currentPassword: "Mật khẩu hiện tại",
    continue: "Tiếp tục",
    signOut: "Đăng xuất",
    scanTitle: "Thêm vào điện thoại",
    scanSubtitle:
      "Mở Google Authenticator hoặc ứng dụng tạo mã bạn đang dùng, rồi quét mã này.",
    qrLabel: "Mã QR để thêm vào ứng dụng tạo mã",
    manualKey: "Không quét được? Gõ chuỗi này",
    scanCodeLabel: "Mã 6 số đang hiện trên điện thoại",
    saveTitle: "Lưu mã dự phòng",
    saveSubtitle:
      "Khi mất điện thoại, mỗi mã này thay được một lần nhập mã. Mã chỉ hiện đúng một lần này. Cất ở nơi khác điện thoại, ví dụ in ra giấy.",
    copy: "Sao chép",
    copied: "Đã chép",
    print: "In mã",
    saved: "Tôi đã lưu các mã này",
    finish: "Hoàn tất",
    manageTitle: "Xác thực 2 lớp",
    manageSubtitle:
      "Khi đăng nhập trên máy chưa tin, bạn cần mã từ điện thoại.",
    backupRow: "Mã dự phòng",
    backupLeft: (count: number) => `Còn ${count} mã dự phòng`,
    regenerate: "Tạo lại mã",
    devicesRow: "Thiết bị đã tin",
    devicesLeft: (count: number) =>
      `Đang tin ${count} thiết bị. Mỗi máy hết hạn sau 30 ngày không đăng nhập.`,
    forget: "Quên mọi thiết bị đã tin",
    forgetBody: "Lần đăng nhập sau, mọi máy đã tin sẽ phải nhập mã lại.",
    phoneRow: "Điện thoại tạo mã",
    phoneHint: "Đổi máy thì mã cũ và mã dự phòng cũ hết dùng được.",
    replace: "Đổi điện thoại",
    replaceBody:
      "Sau khi đổi, mã dự phòng cũ và mọi máy đã tin đều hết dùng được. Các máy khác sẽ phải đăng nhập lại.",
    codeOrBackup: "Mã 6 số hoặc mã dự phòng",
    cancel: "Hủy",
    close: "Đóng",
    regenerateTitle: "Tạo lại mã dự phòng",
    regenerateBody: "Bộ mã cũ sẽ hết dùng được ngay.",
    newCodesTitle: "Bộ mã dự phòng mới",
    demoOff: "Bản demo không dùng xác thực 2 lớp.",
    menu: "Xác thực 2 lớp",
    menuAdmin: "Gỡ xác thực 2 lớp cho người khác",
    resetItem: "Gỡ xác thực 2 lớp",
    resetTitle: (name: string) => `Gỡ xác thực 2 lớp của ${name}?`,
    resetBody: (name: string) =>
      `${name} sẽ phải đăng nhập lại và bật lại từ đầu. Mã dự phòng và máy đã tin hết dùng được. Chỉ gỡ khi đã xác minh đúng người yêu cầu.`,
    adminPassword: "Mật khẩu của bạn",
    adminCode: "Mã 6 số của bạn",
    resetAction: "Gỡ 2 lớp",
  },
  sessions: {
    title: "Thiết bị đăng nhập",
    panel: "Máy nào đang dùng tài khoản của bạn.",
    backDashboard: "Về Tổng quan",
    backHome: "Về trang chính",
    demoOff:
      "Bản demo: tài khoản này nhiều người dùng chung nên không xem và đăng xuất máy được. Tạo tài khoản riêng ở Người dùng để thử tính năng.",
    summary: (count: number) =>
      `Bạn đang đăng nhập ở ${count} thiết bị. Thấy máy lạ thì đăng xuất máy đó rồi đổi mật khẩu.`,
    thisDevice: "Máy này",
    inUse: "Đang dùng",
    signedIn: (when: string) => `Đăng nhập: ${when}`,
    lastActive: (when: string) => `Hoạt động gần nhất: ${when}`,
    note: "Hoạt động gần nhất cập nhật khoảng một lần mỗi ngày. Không hiện địa chỉ IP.",
    signOutOne: "Đăng xuất máy này",
    signOutOthers: "Đăng xuất mọi máy khác",
    noOthers: "Không có máy nào khác.",
    cancel: "Hủy",
    confirmOneTitle: (device: string) => `Đăng xuất ${device}?`,
    confirmOneBody:
      "Máy đó sẽ phải đăng nhập lại ở thao tác kế tiếp. Máy này vẫn đăng nhập.",
    confirmOneAction: "Đăng xuất",
    lostBefore: "Nếu máy bị mất: sau khi đăng xuất, vào ",
    lostLink: "Xác thực 2 lớp",
    lostAfter:
      ' → "Quên mọi thiết bị đã tin". Nghi lộ mật khẩu thì đổi mật khẩu.',
    confirmOthersTitle: (count: number) => `Đăng xuất ${count} máy khác?`,
    confirmOthersBody: (count: number) =>
      `Máy này vẫn đăng nhập. ${count} máy còn lại phải đăng nhập lại ở thao tác kế tiếp.`,
    confirmOthersTrusted:
      "Các máy đã tin cũng bị quên, lần sau phải nhập mã 6 số, kể cả trên máy này.",
    confirmOthersAction: (count: number) => `Đăng xuất ${count} máy`,
    signedOutOne: (device: string) => `Đã đăng xuất ${device}.`,
    signedOutOthers: (count: number, forgotten: number) =>
      `Đã đăng xuất ${count} máy.${forgotten > 0 ? ` Đã quên ${forgotten} máy đã tin.` : ""}`,
    menu: "Thiết bị đăng nhập",
    allItem: "Đăng xuất mọi máy",
    allTitle: (name: string) => `Đăng xuất mọi máy của ${name}?`,
    allBody: (name: string) =>
      `${name} phải đăng nhập lại trên mọi máy. Tài khoản vẫn Đang dùng. Máy đã tin của xác thực 2 lớp (nếu có) cũng bị quên.`,
    allLeakedBefore:
      "Nếu mật khẩu có thể đã lộ (lưu sẵn trên máy bị mất), dùng ",
    allLeakedLink: "Đặt lại mật khẩu",
    allLeakedAfter: ".",
    allResult: (username: string, count: number, forgotten: number) => {
      if (count > 0 && forgotten > 0) {
        return `Đã đăng xuất ${count} máy của ${username}. Đã quên ${forgotten} máy đã tin.`;
      }
      if (count > 0) return `Đã đăng xuất ${count} máy của ${username}`;
      if (forgotten > 0)
        return `Đã quên ${forgotten} máy đã tin của ${username}`;
      return "Không có máy nào đang đăng nhập";
    },
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
