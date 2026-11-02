// Repair order validation (D12).
export const repairs = {
  messages: {
    noLines: "Thêm ít nhất một mã hàng",
    tooManyLines: "Phiếu tối đa 200 mã hàng",
    kgItem: (code: string) => `${code} tính theo kg, không lập phiếu sửa được`,
    duplicateItem: (code: string) => `${code} đã có trên phiếu`,
    wholePieces: (code: string) =>
      `${code} tính theo cái, số lượng phải là số nguyên`,
    quantityNegative: (code: string) => `${code}: số lượng không được âm`,
    takenZero: (code: string) => `${code}: số lấy ra phải lớn hơn 0`,
    sumMismatch: (sum: string, taken: string) =>
      `sửa xong + phế liệu (${sum}) phải bằng số lấy ra (${taken})`,
    cost: "Chi phí sửa phải là số đồng không âm",
    costWithoutGood: (code: string) =>
      `${code}: không có hàng sửa xong để tính chi phí sửa`,
    futureDate: "Ngày sửa xong không được sau hôm nay",
    noWeight: (code: string) =>
      `${code} chưa có trọng lượng chuẩn, không tính được giá phế liệu`,
    repairedByTooLong: (max: number) => `Người/tổ sửa dài tối đa ${max} ký tự`,
    noteTooLong: (max: number) => `Ghi chú dài tối đa ${max} ký tự`,
  },
} as const;
