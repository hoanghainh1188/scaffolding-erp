// Purchase orders and landed costs.
export const purchasing = {
  tabs: {
    all: "Tất cả",
    draft: "Nháp",
    waiting: "Chờ xe về",
    receiving: "Đang nhận",
    done: "Đã nhập",
  },
  kind: {
    NEW: "Hàng mới",
    USED: "Đã qua sử dụng",
  },
  messages: {
    notFound: "Không tìm thấy đơn mua hàng",
    supplierRequired: "Chọn nhà cung cấp",
    supplierArchived: (code: string) => `Nhà cung cấp ${code} đã ngừng dùng`,
    itemRequired: "Chọn mã hàng",
    itemArchived: (code: string) => `Vật tư ${code} đã ngừng dùng`,
    duplicateItem: (code: string) =>
      `Mã hàng ${code} đã có trong đơn, vui lòng điều chỉnh số lượng ở dòng hiện có`,
    kgOnly: (code: string) =>
      `Mã hàng ${code} quản lý theo kg, vui lòng đặt theo đơn vị kg`,
    wholePieces: (code: string) =>
      `${code} quản lý theo cái, số lượng phải là số nguyên`,
    quantityPositive: "Số lượng phải lớn hơn 0",
    pricePositive: "Đơn giá phải là số nguyên không âm",
    costLabelRequired:
      "Vui lòng nhập tên khoản chi phí (VD: Cước xe tải, Bốc xếp)",
    costLabelTooLong: (max: number) =>
      `Tên khoản chi phí dài tối đa ${max} ký tự`,
    costAmountPositive: "Chi phí phải lớn hơn 0",
    noLines: "Đơn cần ít nhất một dòng hàng",
    noDate: "Nhập ngày dự kiến nhập",
    alreadyPlaced: (code: string) => `Đơn hàng ${code} đã được đặt`,
    notPlaced: (code: string) =>
      `Đơn hàng ${code} đang ở trạng thái nháp. Bạn có thể xóa bản nháp nếu không dùng.`,
    alreadyDone: (code: string) => `Đơn hàng ${code} đã hoàn tất, không thể thay đổi`,
    cancelWithReceipts:
      "Đơn hàng đã có phiếu nhập kho. Vui lòng hoàn tất phiếu nhập hoặc đóng đơn thay vì hủy.",
    cancelReasonRequired: "Nhập lý do hủy đơn",
    reasonTooLong: (max: number) => `Lý do dài tối đa ${max} ký tự`,
    closeNoReceipts:
      "Đơn hàng chưa có phiếu nhập kho, vui lòng dùng chức năng Hủy đơn",
    deletePlaced:
      "Đơn hàng đã đặt không thể xóa trực tiếp. Vui lòng dùng chức năng Hủy đơn.",
    editLocked:
      "Đơn đã có phiếu nhập kho. Nhà cung cấp và danh mục hàng đã bị khóa cố định (chỉ sửa được ngày hẹn, xe và ghi chú).",
    stale: "Đơn hàng vừa được cập nhật bởi người khác. Vui lòng tải lại trang.",
  },
  costs: {
    zeroValue:
      "Tiền hàng bằng 0 nên không thể phân bổ chi phí theo giá trị. Vui lòng chọn phân bổ theo trọng lượng.",
    noGoods: "Không có hàng hóa để phân bổ chi phí",
    noScrapPrice:
      "Chưa có đơn giá sắt vụn tham chiếu. Vui lòng cập nhật đơn giá trong Cài đặt.",
    noWeight:
      "Mã hàng chưa được khai báo trọng lượng chuẩn, không thể tính giá vốn phế liệu",
  },
} as const;
