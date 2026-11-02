// Stock adjustments and value adjustments.
export const inventory = {
  adjustments: {
    deleteDraft: "Xóa nháp",
    deleteDraftTitle: (code: string) => `Xóa ${code}?`,
    confirmDeleteDraft: "Bản nháp sẽ bị xóa vĩnh viễn và không làm thay đổi sổ kho.",
    deleteConfirm: "Xóa",
    submitForApproval: "Gửi duyệt",
    returnAction: "Trả lại",
    returnTitle: (code: string) => `Trả lại ${code}`,
    returnHelp: "Phiếu về Nháp để người lập sửa. Ghi rõ cần sửa gì.",
    returnReasonLabel: "Lý do trả lại",
    approveAndPost: "Duyệt và ghi sổ",
    approveTitle: (code: string) => `Duyệt ${code}?`,
    confirmPost:
      "Số liệu sẽ được ghi chính thức vào sổ kho và không thể chỉnh sửa sau khi duyệt.",
  },
  revalueMessages: {
    deltaZero: "Chênh lệch giá trị điều chỉnh phải khác 0",
    deltaWhole: "Chênh lệch giá trị phải là số nguyên đồng",
    duplicate: (pair: string) => `${pair} đã có trên phiếu`,
    soldOut: (pair: string) =>
      `Mã hàng ${pair} hiện không còn tồn kho, không thể điều chỉnh giá trị`,
    negative: (pair: string, value: string) =>
      `Giá trị tồn kho sau điều chỉnh của ${pair} không được âm (${value})`,
    relatedMissing: "Vui lòng nhập mã chứng từ gốc cần điều chỉnh",
    relatedNotFound: (code: string) =>
      `Không tìm thấy chứng từ gốc ${code} trong sổ kho`,
    pairNotInRelated: (related: string, pair: string) =>
      `${related} không có dòng sổ của ${pair}`,
    tripCost: "Chi phí chuyến phải là số nguyên không âm",
    tripUnchanged: "Chi phí chuyến không thay đổi, không có phát sinh để điều chỉnh",
    tripNotReproducible: (receipt: string) =>
      `Không thể tự động phân bổ lại chi phí theo phiếu ${receipt}. Vui lòng nhập dòng điều chỉnh thủ công.`,
    tripOpen: (receipt: string, adjustment: string) =>
      `${receipt} đã có phiếu điều chỉnh giá ${adjustment} chưa ghi sổ`,
  },
} as const;
