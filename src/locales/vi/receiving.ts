// Mobile receiving, goods receipts, arrival lists, trip costs, and anomalies.
export const receiving = {
  home: {
    title: "Nhập hàng",
    arrivalsHeader: "Xe sắp về bãi",
    greeting: (name: string, count: number) =>
      count > 0
        ? `Chào ${name}, hôm nay có ${count} phiếu cần xử lý`
        : `Chào ${name}, hôm nay chưa có phiếu nào cần xử lý`,
    noArrivals: "Các chuyến hàng dự kiến về kho sẽ xuất hiện ở đây.",
    viewLater: (count: number) => `Xem ${count} đơn ngày sau`,
    waitingRest: (count: number | string) => `Đang nhận · chờ giao bù ${count}`,
  },
  form: {
    startReceiving: "Bắt đầu nhập hàng",
    continueReceiving: "Tiếp tục nhập",
    saveDraft: "Lưu nháp",
    confirmReceipt: "Xác nhận nhập kho",
    countingSection: "Kiểm đếm và phân loại",
    yardLabel: "Bãi nhập kho",
    selectYard: "Chọn bãi nhập",
    vehicleNumber: "Biển số xe",
    tripNumber: "Chuyến số",
    deliveredBy: "Tài xế / Người giao",
    queuedNotice: "Phiếu đã lưu và sẽ tự động gửi khi có kết nối mạng",
    sessionExpired: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại để gửi phiếu.",
    tripSkipped: "Chuyến này chưa giao",
    waitForNextTrip: "Chờ giao ở chuyến sau",
  },
  anomalies: {
    quantityOver: (got: string, rest: string, unit: string) =>
      `Số lượng nhận (${got} ${unit}) vượt quá số lượng còn lại trên đơn (${rest} ${unit}). Bạn có chắc chắn muốn nhập không?`,
    costsOver: (trip: string, expected: string) =>
      `Chi phí chuyến này (${trip}) vượt quá tổng chi phí dự kiến cả đơn (${expected}). Bạn có muốn tiếp tục ghi nhận không?`,
    noteOver: (code: string, got: string, rest: string, unit: string) =>
      `nhận dư ${code} ${got}/${rest} ${unit}`,
    noteCostHigh: (cost: string) => `chi phí cao ${cost}`,
  },
} as const;
