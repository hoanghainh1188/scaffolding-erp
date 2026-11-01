// Stock adjustments and value adjustments.
export const inventory = {
  adjustments: {
    deleteDraft: "Xóa nháp",
    deleteDraftTitle: (code: string) => `Xóa ${code}?`,
    confirmDeleteDraft: "Phiếu nháp bị xóa hẳn. Sổ kho không đổi.",
    deleteConfirm: "Xóa",
    submitForApproval: "Gửi duyệt",
    returnAction: "Trả lại",
    returnTitle: (code: string) => `Trả lại ${code}`,
    returnHelp: "Phiếu về Nháp để người lập sửa. Ghi rõ cần sửa gì.",
    returnReasonLabel: "Lý do trả lại",
    approveAndPost: "Duyệt và ghi sổ",
    approveTitle: (code: string) => `Duyệt ${code}?`,
    confirmPost:
      "Các dòng của phiếu được ghi vào sổ kho ngay và không sửa được nữa.",
  },
  revalueMessages: {
    deltaZero: "Chênh lệch giá trị phải khác 0",
    deltaWhole: "Chênh lệch giá trị phải là số nguyên đồng",
    duplicate: (pair: string) => `${pair} đã có trên phiếu`,
    soldOut: (pair: string) =>
      `${pair} đã hết hàng, không điều chỉnh giá trị được`,
    negative: (pair: string, value: string) =>
      `Giá trị sau điều chỉnh của ${pair} bị âm (${value})`,
    relatedMissing: "Nhập mã chứng từ bị sửa",
    relatedNotFound: (code: string) =>
      `Không tìm thấy chứng từ ${code} trong sổ kho`,
    pairNotInRelated: (related: string, pair: string) =>
      `${related} không có dòng sổ của ${pair}`,
    tripCost: "Chi phí chuyến phải là số nguyên không âm",
    tripUnchanged: "Chi phí chuyến không đổi, không có gì để điều chỉnh",
    tripNotReproducible: (receipt: string) =>
      `Không dựng lại được cách chia của ${receipt}, lập dòng tay`,
    tripOpen: (receipt: string, adjustment: string) =>
      `${receipt} đã có phiếu điều chỉnh giá ${adjustment} chưa ghi sổ`,
  },
} as const;
