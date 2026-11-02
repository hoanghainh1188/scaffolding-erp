// Repair order validation (D12).
export const repairs = {
  messages: {
    noLines: "Thêm ít nhất một mã hàng",
    tooManyLines: "Một phiếu sửa chữa tối đa 200 dòng hàng",
    kgItem: (code: string) =>
      `Mã hàng ${code} quản lý theo kg, không áp dụng quy trình sửa chữa theo cái`,
    duplicateItem: (code: string) => `${code} đã có trên phiếu`,
    wholePieces: (code: string) =>
      `${code} quản lý theo cái, số lượng phải là số nguyên`,
    quantityNegative: (code: string) => `${code}: số lượng không được âm`,
    takenZero: (code: string) => `${code}: Số lượng xuất sửa phải lớn hơn 0`,
    sumMismatch: (sum: string, taken: string) =>
      `Tổng số lượng sửa đạt và phế liệu (${sum}) phải bằng số lượng xuất sửa (${taken})`,
    cost: "Chi phí sửa phải là số đồng không âm",
    costWithoutGood: (code: string) =>
      `${code}: Không có sản phẩm sửa đạt chuẩn để phân bổ chi phí sửa chữa`,
    futureDate: "Ngày hoàn thành không được lớn hơn ngày hiện tại",
    noWeight: (code: string) =>
      `Mã ${code} chưa được khai báo trọng lượng chuẩn, không thể tính giá vốn phế liệu`,
    repairedByTooLong: (max: number) => `Người/tổ sửa dài tối đa ${max} ký tự`,
    noteTooLong: (max: number) => `Ghi chú dài tối đa ${max} ký tự`,
  },
} as const;
