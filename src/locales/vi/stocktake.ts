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
    siteRefused: "Chỉ kiểm kê bãi và xưởng",
    emptyScope: (place: string) =>
      `Phạm vi đã chọn không có hàng nào ở ${place}`,
    openSession: (place: string, code: string) =>
      `${place} đang có phiên ${code} chưa xong`,
    nothingCounted: "Đếm ít nhất một mã trước khi gửi",
    missingCondition: (conditionName: string) =>
      `Nhập số cho ${conditionName} (0 nếu không có)`,
    wholePieces: (code: string) =>
      `${code} tính theo cái, số lượng phải là số nguyên`,
    negative: (code: string) => `${code}: số lượng không được âm`,
    duplicateItem: (code: string) => `${code} gửi hai lần trong một lần gửi`,
    duplicateCondition: (code: string, conditionName: string) =>
      `${code} ${conditionName} nhập hai lần`,
    noRecount: (code: string) => `${code} không cần đếm lại`,
    noLines: (code: string) => `${code}: nhập số cho ít nhất một tình trạng`,
    recountMissing: (lines: number) =>
      `Còn ${lines} dòng văn phòng yêu cầu đếm lại, đếm xong mới gửi được`,
    alreadySubmitted: "Phiên đã gửi văn phòng",
    cancelAfterSubmit: "Phiên đã gửi văn phòng, nhờ Giám đốc hủy",
    alreadyPosted: "Phiên kiểm kê đã được ghi sổ",
    cancelled: "Phiên kiểm kê đã hủy",
    notSubmitted: "Phiên chưa gửi văn phòng",
    notCounting: "Phiên không ở trạng thái đang đếm",
    recountNothing: "Chọn ít nhất một dòng đã đếm để đếm lại",
    recountUncounted: "Chỉ yêu cầu đếm lại dòng đã đếm",
    cancelReason: "Nhập lý do hủy",
    offlineStart: "Cần có mạng để bắt đầu phiên kiểm kê",
  },
} as const;
