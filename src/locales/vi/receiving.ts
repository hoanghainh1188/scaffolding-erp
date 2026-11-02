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
      `Nhận ${got} cái, đơn chỉ còn ${rest}. Đúng không?`,
    kgOver: (got: string, rest: string) =>
      `Nhận ${got} kg, đơn chỉ còn ${rest} kg. Đúng không?`,
    costsOver: (trip: string, expected: string) =>
      `Chi phí chuyến ${trip}, cả đơn dự kiến ${expected}. Đúng không?`,
    noteOver: (code: string, got: string, rest: string, unit: string) =>
      `nhận dư ${code} ${got}/${rest} ${unit}`,
    noteCostHigh: (cost: string) => `chi phí cao ${cost}`,
  },
} as const;
