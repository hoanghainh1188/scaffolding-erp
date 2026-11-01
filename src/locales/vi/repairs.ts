// Repair orders, cost allocation, lines, and approval messages.
export const repairs = {
  title: "Sửa chữa & Tân trang",
  createOrder: "Lập phiếu sửa chữa",
  form: {
    fromLocation: "Kho / Vị trí xuất sửa",
    toLocation: "Kho / Vị trí nhập sau sửa",
    repairedBy: "Thợ sửa / Đội gia công",
    repairDate: "Ngày hoàn thành",
    costEstimate: "Giá thành sau sửa chữa",
    costEstimateHelp:
      "Chi phí sửa chữa chỉ phân bổ cho số lượng sửa đạt chuẩn. Đơn giá vốn làm tròn đến 1 ₫.",
  },
  messages: {
    noLines: "Vui lòng thêm ít nhất một mã hàng cần sửa",
    tooManyLines: "Một phiếu sửa chữa tối đa 200 dòng hàng",
    kgItem: (code: string) =>
      `Mã hàng ${code} quản lý theo kg, không áp dụng quy trình sửa chữa theo cái`,
    duplicateItem: (code: string) => `Mã hàng ${code} đã có trên phiếu`,
    wholePieces: (code: string) =>
      `${code} quản lý theo cái, số lượng phải là số nguyên`,
    quantityNegative: (code: string) => `${code}: Số lượng không được âm`,
    takenZero: (code: string) => `${code}: Số lượng xuất sửa phải lớn hơn 0`,
    sumMismatch: (
      code: string,
      sum: number | string,
      taken: number | string,
    ) =>
      code
        ? `${code}: Tổng số lượng sửa đạt và phế liệu (${sum}) phải bằng số lượng xuất sửa (${taken})`
        : `Tổng số lượng sửa đạt và phế liệu (${sum}) phải bằng số lượng xuất sửa (${taken})`,
    costPositive: "Chi phí sửa chữa phải là số không âm",
    cost: "Chi phí sửa chữa phải là số nguyên đồng không âm",
    costWithoutGood: (code: string) =>
      `${code}: Không có sản phẩm sửa đạt chuẩn để phân bổ chi phí sửa chữa`,
    futureDate: "Ngày hoàn thành không được lớn hơn ngày hiện tại",
    noScrapPrice: "Chưa có đơn giá phế liệu chuẩn, không thể tính giá vốn",
    noWeight: (code: string) =>
      `${code} chưa được khai báo trọng lượng chuẩn, không thể tính giá vốn phế liệu`,
    repairedByTooLong: (max: number) => `Thông tin người/tổ sửa tối đa ${max} ký tự`,
    noteTooLong: (max: number) => `Ghi chú tối đa ${max} ký tự`,
  },
} as const;
