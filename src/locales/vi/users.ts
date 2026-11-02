// User management (D17).
export const users = {
  roles: {
    descriptions: {
      DIRECTOR: "Duyệt hợp đồng, đền bù, quản lý người dùng. Dùng máy tính.",
      ACCOUNTANT:
        "Chốt tiền thuê, theo dõi công nợ, xuất báo cáo Excel (máy tính).",
      SALES: "Mua hàng, báo giá, lập hợp đồng (máy tính).",
      WAREHOUSE:
        "Quét mã, nhập kho, xuất kho, kiểm kê thực tế tại bãi (điện thoại).",
      WORKSHOP:
        "Lập phiếu sửa chữa, ghi nhận tân trang hàng hóa (điện thoại).",
    },
  },
} as const;
