// Purchasing orders, statuses, landed costs, and order form messages.
export const purchasing = {
  title: "Đơn mua hàng",
  createOrder: "Tạo đơn mua hàng",
  arrivingToday: (count: number) =>
    `Hôm nay có ${count} chuyến hàng dự kiến về kho`,
  tabs: {
    all: "Tất cả",
    draft: "Nháp",
    waiting: "Chờ xe về",
    receiving: "Đang nhận",
    done: "Đã nhập",
  },
  status: {
    DRAFT: "Bản nháp",
    PLACED: "Chờ nhập hàng",
    RECEIVING: "Đang nhập dở",
    COMPLETED: "Đã hoàn tất",
    CANCELLED: "Đã hủy",
  },
  kind: {
    NEW: "Hàng mới",
    USED: "Hàng cũ",
  },
  actions: {
    saveDraft: "Lưu bản nháp",
    placeOrder: "Xác nhận đặt hàng",
    cancelOrder: "Hủy đơn mua",
    closeOrder: "Đóng đơn mua",
    deleteDraft: "Hủy bản nháp",
  },
  messages: {
    notFound: "Không tìm thấy đơn mua hàng",
    supplierRequired: "Vui lòng chọn nhà cung cấp",
    supplierArchived: (code: string) => `Nhà cung cấp ${code} đã ngừng hoạt động`,
    itemRequired: "Vui lòng chọn mã vật tư",
    itemArchived: (code: string) => `Vật tư ${code} đã ngừng sử dụng`,
    duplicateItem: (code: string) =>
      `Mã hàng ${code} đã tồn tại trong đơn. Vui lòng điều chỉnh số lượng ở dòng tương ứng.`,
    kgOnly: (code: string) => `${code} quản lý theo kg, vui lòng nhập số lượng theo kg`,
    wholePieces: (code: string) =>
      `${code} quản lý theo cái, số lượng phải là số nguyên`,
    quantityPositive: "Số lượng đặt phải lớn hơn 0",
    pricePositive: "Đơn giá phải là số không âm",
    costLabelRequired: "Vui lòng nhập tên khoản chi phí",
    costLabelTooLong: (max: number) => `Tên khoản chi phí không vượt quá ${max} ký tự`,
    costAmountPositive: "Chi phí phải lớn hơn 0",
    noLines: "Đơn mua cần ít nhất một dòng hàng hóa",
    noDate: "Vui lòng chọn ngày dự kiến giao hàng",
    alreadyPlaced: (code: string) => `Đơn mua hàng ${code} đã được xác nhận trước đó`,
    notPlaced: (code: string) =>
      `Đơn mua hàng ${code} đang ở trạng thái nháp. Bạn có thể xóa bản nháp nếu không dùng.`,
    alreadyDone: (code: string) =>
      `Đơn mua hàng ${code} đã hoàn tất và được khóa, không thể chỉnh sửa`,
    cancelWithReceipts:
      "Đơn hàng đã phát sinh phiếu nhập kho nên không thể hủy. Nếu số lượng sai lệch, vui lòng lập phiếu điều chỉnh kho.",
    cancelReasonRequired: "Vui lòng nhập lý do hủy đơn mua",
    closeNoReceipts:
      "Đơn hàng chưa phát sinh phiếu nhập kho nào. Vui lòng chọn Hủy đơn thay vì Đóng đơn.",
    closeReasonRequired: "Vui lòng nhập lý do đóng đơn mua",
    deletePlaced: "Đơn mua hàng đã xác nhận không thể xóa. Vui lòng chọn Hủy đơn.",
    reasonTooLong: (max: number) => `Lý do không vượt quá ${max} ký tự`,
    supplierLocked:
      "Đơn đã có phiếu nhập, chỉ sửa được ngày dự kiến, phương tiện và ghi chú",
  },
  costs: {
    allocationBasis: "Cách phân bổ chi phí",
    byValue: "Phân bổ theo giá trị hàng (thành tiền lớn chịu nhiều chi phí hơn)",
    byWeight: "Phân bổ theo trọng lượng chuẩn (phù hợp khi chở nhiều sắt thép nặng)",
    zeroValueWarning:
      "Tổng tiền hàng bằng 0 nên không thể phân bổ theo giá trị. Vui lòng chọn phân bổ theo trọng lượng.",
    noGoods: "Không có hàng hóa để phân bổ chi phí",
    noScrapPrice:
      "Chưa có đơn giá sắt vụn tham chiếu. Vui lòng cập nhật đơn giá trong Cài đặt.",
    noWeight:
      "Vật tư chưa được khai báo trọng lượng chuẩn, không thể quy đổi phế liệu ra kg.",
  },
} as const;
