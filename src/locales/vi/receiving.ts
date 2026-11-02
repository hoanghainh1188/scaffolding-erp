// Mobile receiving: arrival list and receipt anomalies (D5b).
export const receiving = {
  home: {
    arrivalsHeader: "Xe sắp về bãi",
    kindShort: { NEW: "hàng mới", USED: "hàng cũ" },
    viewLater: (count: number) => `Xem ${count} đơn ngày sau`,
    waitingRest: (count: number | string) => `Đang nhận · chờ giao bù ${count}`,
    startReceiving: "Bắt đầu nhập hàng",
    continueReceiving: "Tiếp tục nhập",
  },
  anomalies: {
    piecesOver: (got: string, rest: string) =>
      `Số lượng nhận (${got} cái) vượt quá số lượng còn lại trên đơn (${rest} cái). Bạn có chắc chắn muốn nhập không?`,
    kgOver: (got: string, rest: string) =>
      `Khối lượng nhận (${got} kg) vượt quá số lượng còn lại trên đơn (${rest} kg). Bạn có chắc chắn muốn nhập không?`,
    costsOver: (trip: string, expected: string) =>
      `Chi phí chuyến này (${trip}) vượt quá tổng chi phí dự kiến cả đơn (${expected}). Bạn có muốn tiếp tục ghi nhận không?`,
    noteOver: (code: string, got: string, rest: string, unit: string) =>
      `nhận dư ${code} ${got}/${rest} ${unit}`,
    noteCostHigh: (cost: string) => `chi phí cao ${cost}`,
  },
} as const;
