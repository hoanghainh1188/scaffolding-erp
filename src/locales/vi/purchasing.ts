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
    notFound: "Không tìm thấy đơn thu mua",
    supplierRequired: "Chọn nhà cung cấp",
    supplierArchived: (code: string) => `Nhà cung cấp ${code} đã ngừng dùng`,
    itemRequired: "Chọn mã hàng",
    itemArchived: (code: string) => `Vật tư ${code} đã ngừng dùng`,
    duplicateItem: (code: string) =>
      `${code} đã có trong đơn, sửa số lượng ở dòng cũ`,
    kgOnly: (code: string) => `${code} tính theo kg, chỉ đặt được theo kg`,
    wholePieces: (code: string) =>
      `${code} tính theo cái, số lượng phải là số nguyên`,
    quantityPositive: "Số lượng phải lớn hơn 0",
    pricePositive: "Đơn giá phải là số nguyên không âm",
    costLabelRequired: "Nhập tên khoản chi phí",
    costLabelTooLong: (max: number) =>
      `Tên khoản chi phí dài tối đa ${max} ký tự`,
    costAmountPositive: "Chi phí phải lớn hơn 0",
    noLines: "Đơn cần ít nhất một dòng hàng",
    noDate: "Nhập ngày dự kiến nhập",
    alreadyPlaced: (code: string) => `Đơn ${code} đã đặt rồi`,
    notPlaced: (code: string) =>
      `Đơn ${code} chưa đặt, xóa đơn nháp nếu không cần nữa`,
    alreadyDone: (code: string) => `Đơn ${code} đã xong, không đổi được nữa`,
    cancelWithReceipts:
      "Đơn đã có phiếu nhập thì không hủy được. Hàng nhập sai thì lập phiếu điều chỉnh kho.",
    cancelReasonRequired: "Nhập lý do hủy đơn",
    reasonTooLong: (max: number) => `Lý do dài tối đa ${max} ký tự`,
    closeNoReceipts: "Đơn chưa có phiếu nhập, dùng Hủy đơn",
    deletePlaced: "Đơn đã đặt không xóa được, dùng Hủy đơn",
    editLocked:
      "Đơn đã có phiếu nhập, chỉ sửa được ngày dự kiến, phương tiện và ghi chú",
    stale: "Đơn vừa được người khác sửa, tải lại trang",
  },
  costs: {
    zeroValue:
      "Tiền hàng bằng 0 nên không chia chi phí theo giá trị được, chọn chia theo trọng lượng",
    noGoods: "Không có hàng để chia chi phí",
    noScrapPrice: "Chưa có giá sắt vụn tham khảo, nhờ Giám đốc nhập ở Cài đặt",
    noWeight: "Vật tư chưa có trọng lượng chuẩn, không quy được phế liệu ra kg",
  },
} as const;
