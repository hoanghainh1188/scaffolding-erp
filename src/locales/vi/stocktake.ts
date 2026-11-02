// Stocktake sessions (D13, M-stocktake).
export const stocktake = {
  title: "Kiểm kê",
  startNew: "Bắt đầu kiểm kê",
  statuses: {
    COUNTING: "Đang đếm",
    SUBMITTED: "Chờ duyệt",
    DONE: "Đã ghi sổ",
    CANCELLED: "Đã hủy",
  },
  home: {
    waitingApproval: "Chờ Giám đốc duyệt",
    recountNeeded: (count: number) => `Cần đếm lại ${count} dòng`,
    returnedNotice: (reason: string) => `Bị trả lại: ${reason}`,
    continueCount: "Tiếp tục đếm",
    recountAction: "Đếm lại",
  },
  messages: {
    siteRefused: "Chỉ hỗ trợ kiểm kê tại Bãi và Xưởng",
    emptyScope: (place: string) =>
      `Phạm vi kiểm kê đã chọn không có hàng hóa nào tại ${place}`,
    openSession: (place: string, code: string) =>
      `Kho/vị trí ${place} đang có phiên kiểm kê ${code} chưa hoàn thành`,
    nothingCounted:
      "Vui lòng nhập số liệu kiểm đếm cho ít nhất một mã hàng trước khi gửi duyệt",
    missingCondition: (conditionName: string) =>
      `Vui lòng nhập số lượng cho tình trạng ${conditionName} (nhập 0 nếu không có)`,
    wholePieces: (code: string, unit = "cái") =>
      `${code} quản lý theo ${unit}, số lượng phải là số nguyên`,
    negative: (code: string) => `${code}: số lượng không được âm`,
    duplicateItem: (code: string) => `${code} gửi hai lần trong một lần gửi`,
    duplicateCondition: (code: string, conditionName: string) =>
      `${code} ${conditionName} nhập hai lần`,
    noRecount: (code: string) =>
      `Mã hàng ${code} không nằm trong danh sách cần đếm lại`,
    noLines: (code: string) => `${code}: nhập số cho ít nhất một tình trạng`,
    recountMissing: (lines: number) =>
      `Còn ${lines} dòng cần đếm lại theo yêu cầu. Vui lòng hoàn thành trước khi gửi duyệt.`,
    alreadySubmitted: "Phiên đã gửi văn phòng",
    cancelAfterSubmit:
      "Phiên kiểm kê đã gửi duyệt lên văn phòng. Vui lòng liên hệ Giám đốc để hủy phiên.",
    alreadyPosted: "Phiên kiểm kê đã được ghi sổ",
    cancelled: "Phiên kiểm kê đã hủy",
    notSubmitted: "Phiên chưa gửi văn phòng",
    notCounting: "Phiên không ở trạng thái đang đếm",
    recountNothing: "Chọn ít nhất một dòng đã đếm để đếm lại",
    recountUncounted: "Chỉ yêu cầu đếm lại dòng đã đếm",
    cancelReason: "Nhập lý do hủy",
    offlineStart: "Cần có kết nối mạng để bắt đầu phiên kiểm kê",
  },
} as const;
