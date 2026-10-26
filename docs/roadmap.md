# Lộ trình các change (OpenSpec)

Làm theo thứ tự. Mỗi dòng là một change: `/opsx:propose <tên-change>`.

Trước mỗi change có màn hình: vẽ và chốt thiết kế bằng Claude Design, rồi đưa link vào lúc `/opsx:explore`.

## MVP

| # | Tên change | Nội dung | Màn hình | Phụ thuộc |
|---|---|---|---|---|
| 1 | `setup-project` | Khung Next.js, DB, ORM, test runner, layout Desktop + Mobile, token Bright Blue Base, component nền (Badge, Stepper, DataTable, ConditionSplit) | Layout D, M | – |
| 2 | `auth-and-roles` | Đăng nhập, 5 vai trò, phân quyền phía server, quản lý người dùng | D17 | 1 |
| 3 | `master-data` | Danh mục vật tư (trọng lượng chuẩn, giá thuê mặc định), Bộ (tùy chọn), nhà cung cấp, nhà thầu, công trình, kho | D9, D16 | 2 |
| 4 | `inventory-ledger` | **Sổ kho**, 4 tình trạng, giá vốn bình quân, tồn kho tổng hợp, thẻ kho | D10, D11 | 3 |
| 5 | `purchase-orders` | Đơn thu mua, đa đơn vị tính, chi phí landed cost và cách phân bổ | D2, D3 | 4 |
| 6 | `goods-receipt` | Nhập thực tế từ PO trên mobile, tách tình trạng, ghi sổ kho | M1, M2, M3, M7 | 5 |
| 7 | `contracts` | Hợp đồng bán/thuê, giá theo bộ/linh kiện, bảng giá đền bù, Giám đốc duyệt | D4, D5 | 4 |
| 8 | `deliveries` | Xuất kho theo đợt, rã bộ, cước vận chuyển, tiến độ công trình | D6, M5 | 7 |
| 9 | `returns-and-compensation` | Thu hồi trên mobile (Tốt/Chờ sửa/Phế liệu/Mất, chụp ảnh), phiếu đền bù, Giám đốc duyệt | M4, D8 | 8 |
| 10 | `simple-repair` | Chuyển Chờ sửa → Tốt/Phế liệu, cộng chi phí vào giá vốn | D12 | 4 |
| 11 | `rental-billing` | Tính tiền thuê theo kỳ (tính ngày xuất, không tính ngày trả) | D7 | 9 |
| 12 | `receivables` | Công nợ phải thu, ghi thanh toán, cảnh báo quá hạn, xuất Excel | D14 | 11 |
| 13 | `dashboard-basic` | Việc chờ duyệt, tồn kho theo tình trạng, nợ quá hạn | D1 | 12 |

## Bản 2

| # | Tên change | Nội dung | Màn hình |
|---|---|---|---|
| 14 | `repair-work-orders` | Lệnh sửa chữa đầy đủ: vật tư phụ, công thợ, nghiệm thu; xưởng dùng mobile | D12, M8 |
| 15 | `stocktake` | Kiểm kê trên mobile, duyệt chênh lệch, phiếu điều chỉnh | M6, D13 |
| 16 | `payables` | Công nợ phải trả | D14 |
| 17 | `management-reports` | Lợi nhuận gộp, tỷ lệ khai thác, biểu đồ dashboard | D1, D15 |

## Ghi chú

- Change 4 (`inventory-ledger`) là lõi của hệ thống. Làm kỹ và test kỹ trước khi đi tiếp.
- Change 7 và 10 chỉ cần change 4, có thể làm song song với 5–6 nếu muốn.
