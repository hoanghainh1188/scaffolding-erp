// Catalog row actions and item definitions.
export const catalog = {
  items: {
    rowActionAria: (code: string) => `Thao tác với ${code}`,
    editAction: "Chỉnh sửa",
    deactivateAction: "Ngừng sử dụng",
    activateAction: "Kích hoạt lại",
    deleteAction: "Xóa",
    archiveTitle: (code: string) => `Ngừng sử dụng ${code}?`,
    unarchiveTitle: (code: string) => `Kích hoạt lại ${code}?`,
    deactivatedNotice:
      "Vật tư ngừng sử dụng sẽ không xuất hiện khi tạo chứng từ mới. Các chứng từ cũ vẫn được bảo lưu.",
    activatedNotice:
      "Vật tư có thể được chọn lại khi tạo bộ hàng và chứng từ mới.",
    deleteTitle: (code: string) => `Xóa ${code}?`,
    deleteHelpText:
      "Chỉ có thể xóa vật tư chưa từng phát sinh giao dịch. Đối với vật tư đã có dữ liệu, vui lòng chọn Ngừng sử dụng.",
  },
  // catalog-extensions (D8): categories, old codes, units, provinces,
  // sales staff.
  categories: {
    label: "Phân loại",
    all: "Tất cả",
    EQUIPMENT: "Thiết bị",
    MATERIAL: "Vật tư",
    equipmentHint: "Hàng kinh doanh: giàn giáo, phụ kiện cho thuê/bán",
    materialHint: "Nguyên vật liệu, vật tư xưởng: thép ống, tôn, sơn, que hàn",
  },
  oldCodes: {
    label: "Mã cũ",
    rowPrefix: "Mã cũ:",
    help: "Tên gọi khác để tìm và gõ mã, tối đa 5. Nhãn QR vẫn in mã chính.",
    add: "Thêm",
    remove: (code: string) => `Bỏ mã cũ ${code}`,
    placeholder: "VD: K1,7",
    full: "Đã đủ 5 mã cũ",
  },
  units: {
    legend: "Đơn vị tính",
    countGroup: "Đếm (số nguyên)",
    measureGroup: "Đo (số lẻ)",
    weightLabel: (unit: string) => `Trọng lượng chuẩn (kg / ${unit})`,
    kgNote: "Hàng tính theo kg không có trọng lượng chuẩn.",
    dailyPrice: (unit: string) => `Giá thuê / ngày (₫/${unit})`,
    lostPrice: (unit: string) => `Mất (₫/${unit})`,
    damagePrice: (unit: string) => `Hỏng, sửa được (₫/${unit})`,
  },
  provinces: {
    label: "Tỉnh/thành",
    region: "Khu vực",
    allRegions: "Tất cả khu vực",
    allProvinces: "Tất cả tỉnh/thành",
    unknownRegion: "Chưa rõ",
    notChosen: "Chưa chọn",
    choose: "Chọn tỉnh/thành",
    search: "Tìm tỉnh/thành",
  },
  salesStaff: {
    label: "Nhân viên phụ trách",
    all: "Tất cả nhân viên",
    none: "Chưa có người phụ trách",
    noneOption: "Không có",
    locked: (name: string) => `${name} (đã khóa)`,
  },
} as const;
