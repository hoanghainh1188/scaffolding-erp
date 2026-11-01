// Inventory ledger, stock views, adjustments, and revaluations.
export const inventory = {
  title: "Quản lý kho",
  stockTable: {
    itemCode: "Mã hàng",
    atYard: "Tại bãi",
    atWorkshop: "Tại xưởng",
    atSites: "Tại công trình",
    totalQuantity: "Tổng tồn",
    totalValue: "Giá trị tồn",
    searchPlaceholder: "Tìm kiếm theo mã hoặc tên hàng",
  },
  conditions: {
    NEW: "Hàng mới",
    GOOD: "Dùng tốt",
    NEEDS_REPAIR: "Chờ sửa",
    SCRAP: "Phế liệu",
  },
  cards: {
    awaitingRepair: "Chờ sửa chữa",
    scrapAtYard: "Phế liệu tại bãi",
    convertedScrap: (kg: string, pcs: string) =>
      `Bao gồm ${kg} kg (quy đổi từ ${pcs} cái)`,
  },
  adjustments: {
    title: "Phiếu điều chỉnh kho",
    createMenu: "Lập phiếu điều chỉnh",
    types: {
      ADJUSTMENT: "Điều chỉnh số lượng",
      OPENING: "Tồn kho đầu kỳ",
      REVALUE: "Điều chỉnh giá trị kho",
      TRIP: "Sửa chi phí chuyến xe",
    },
    confirmDeleteDraft: "Bản nháp sẽ bị xóa vĩnh viễn và không làm thay đổi sổ kho.",
    deleteDraft: "Xóa bản nháp",
    deleteDraftTitle: (code: string) => `Xóa bản nháp ${code}?`,
    submitForApproval: "Gửi duyệt",
    returnAction: "Trả lại",
    returnTitle: (code: string) => `Trả lại phiếu ${code}`,
    returnHelp: "Phiếu sẽ chuyển về trạng thái Nháp để người lập chỉnh sửa bổ sung. Vui lòng ghi rõ nội dung cần sửa.",
    returnReasonLabel: "Lý do trả lại",
    approveTitle: (code: string) => `Duyệt và ghi sổ ${code}?`,
    confirmPost: "Số liệu sẽ được ghi chính thức vào sổ kho và không thể chỉnh sửa sau khi duyệt.",
    approveAndPost: "Duyệt và ghi sổ",
    newAverageCost: "Giá bình quân mới",
    revalueReasonPlaceholder: "VD: Nhập nhầm đơn giá khung giàn giáo ở phiếu nhập",
  },
  revalueMessages: {
    deltaZero: "Chênh lệch giá trị điều chỉnh phải khác 0",
    deltaWhole: "Chênh lệch giá trị phải là số nguyên đồng",
    duplicate: (code: string) => `Mã hàng ${code} đã tồn tại trên phiếu`,
    soldOut: (code: string) => `Mã hàng ${code} hiện không còn tồn kho, không thể điều chỉnh giá trị`,
    negative: (code: string, value: string) =>
      `Giá trị tồn kho sau điều chỉnh của ${code} không được âm (${value})`,
    relatedMissing: "Vui lòng nhập mã chứng từ gốc cần điều chỉnh",
    relatedNotFound: (code: string) =>
      `Không tìm thấy chứng từ gốc ${code} trong sổ kho`,
    pairNotInRelated: (related: string, code: string) =>
      `Chứng từ ${related} không chứa giao dịch của ${code}`,
    tripCost: "Chi phí chuyến xe phải là số nguyên không âm",
    tripCostPositive: "Chi phí chuyến xe phải là số không âm",
    tripUnchanged: "Chi phí chuyến không thay đổi, không có phát sinh để điều chỉnh",
    tripNotReproducible: (receipt: string) =>
      `Không thể tự động phân bổ lại chi phí theo phiếu ${receipt}. Vui lòng nhập dòng điều chỉnh thủ công.`,
    tripOpen: (receipt: string, adjustment: string) =>
      `Phiếu nhập ${receipt} đang có phiếu điều chỉnh giá trị ${adjustment} ở trạng thái chờ duyệt`,
  },
} as const;
