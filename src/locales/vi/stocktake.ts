// Stocktake sessions, counting, blind counts, recounts, and approval messages.
export const stocktake = {
  title: "Kiểm kê kho bãi",
  startNew: "Bắt đầu kiểm kê",
  scopeHelp: "Hệ thống chỉ hỗ trợ kiểm kê tại Bãi và Xưởng",
  statuses: {
    COUNTING: "Đang đếm",
    SUBMITTED: "Chờ duyệt",
    DONE: "Đã ghi sổ",
    CANCELLED: "Đã hủy",
  },
  home: {
    inProgress: "Đang kiểm đếm",
    waitingApproval: "Chờ Giám đốc duyệt",
    recountNeeded: (count: number) => `Cần đếm lại ${count} dòng`,
    returnedNotice: (reason: string) => `Bị trả lại: ${reason}`,
    continueCount: "Tiếp tục đếm",
    recountAction: "Đếm lại",
  },
  count: {
    saveLine: "Lưu số đếm",
    editLine: "Sửa số đếm",
    manualEntry: "Nhập mã thủ công",
    scanCode: "Quét mã QR",
    addUnlistedItem: "Thêm vật tư ngoài danh sách kiểm kê",
    confirmCancelSession:
      "Phiên kiểm kê đã hủy sẽ không ghi vào sổ kho. Toàn bộ số liệu đã đếm sẽ bị xóa.",
    confirmSubmit: "Gửi duyệt kiểm kê",
    returnToWarehouseHelp:
      "Phiên kiểm kê sẽ được chuyển lại cho thủ kho kiểm đếm lại. Các số liệu đã đếm trước đó vẫn được bảo lưu.",
    newSessionAvailable: "Kho / vị trí này hiện đã có thể tạo phiên kiểm kê mới.",
  },
  messages: {
    siteRefused: "Chỉ hỗ trợ kiểm kê tại bãi và xưởng",
    emptyScope: (place: string) => `Phạm vi kiểm kê đã chọn không có hàng hóa nào tại ${place}`,
    openSession: (place: string, code: string) =>
      `Kho / vị trí ${place} đang có phiên kiểm kê ${code} chưa hoàn thành`,
    nothingCounted: "Vui lòng nhập số liệu kiểm đếm cho ít nhất một mã hàng trước khi gửi duyệt",
    missingCondition: (conditionName: string) =>
      `Vui lòng nhập số lượng cho tình trạng ${conditionName} (nhập 0 nếu không có)`,
    wholePieces: (code: string) =>
      `${code} quản lý theo cái, số lượng phải là số nguyên`,
    negative: (code: string) => `${code}: Số lượng kiểm đếm không được âm`,
    duplicateItem: (code: string) => `Mã hàng ${code} bị trùng lặp trong dữ liệu gửi`,
    duplicateCondition: (code: string, conditionName: string) =>
      `Mã hàng ${code} bị nhập trùng tình trạng ${conditionName}`,
    noRecount: (code: string) => `Mã hàng ${code} không nằm trong danh sách cần đếm lại`,
    noLines: (code: string) => `${code}: Vui lòng nhập số lượng cho ít nhất một tình trạng`,
    recountMissing: (lines: number) =>
      `Còn ${lines} dòng cần đếm lại theo yêu cầu. Vui lòng hoàn thành trước khi gửi duyệt.`,
    alreadySubmitted: "Phiên kiểm kê đã được gửi duyệt trước đó",
    cancelAfterSubmit:
      "Phiên kiểm kê đã gửi duyệt lên văn phòng. Vui lòng liên hệ Giám đốc để hủy phiên.",
    alreadyPosted: "Phiên kiểm kê đã được duyệt và ghi vào sổ kho",
    cancelled: "Phiên kiểm kê đã hủy",
    notSubmitted: "Phiên kiểm kê chưa được gửi duyệt lên văn phòng",
    notCounting: "Phiên kiểm kê không ở trạng thái đang kiểm đếm",
    recountNothing: "Vui lòng chọn ít nhất một dòng đã đếm để yêu cầu đếm lại",
    recountUncounted: "Chỉ được yêu cầu đếm lại các dòng đã hoàn thành kiểm đếm",
    cancelReason: "Vui lòng nhập lý do hủy phiên kiểm kê",
    offlineStart: "Cần có kết nối mạng để bắt đầu phiên kiểm kê",
  },
} as const;
