## ADDED Requirements

### Requirement: Đơn giá đã nhận hàng không đổi
Khi một dòng đơn đã có trên phiếu nhập, đơn giá, đơn vị và vật tư của dòng đó SHALL không đổi được, kể cả khi ghi thẳng vào cơ sở dữ liệu (trigger chặn), vì khoản phải trả người bán tính từ chúng (spec `payables`). Dòng đơn đã có trên phiếu nhập SHALL không xóa được.

#### Scenario: Đổi đơn giá qua DB bị chặn
- **WHEN** dòng Khung 1,7m của `PO-2026-051` đã có trên `PN-2026-087` và role app chạy `UPDATE purchase_order_line SET unit_price = 1 WHERE id = <dòng đó>`
- **THEN** PostgreSQL từ chối với "Dòng đơn đã có phiếu nhập: không đổi đơn giá, đơn vị, vật tư." **AND** khoản `PN-2026-087` vẫn phát sinh 58.000.000 ₫

#### Scenario: Dòng chưa nhận vẫn sửa được
- **WHEN** `PO-2026-055` đã đặt, chưa có phiếu nhập, và Kinh doanh đổi đơn giá Khung 1,7m từ 185.000 ₫ thành 188.000 ₫
- **THEN** thay đổi được lưu như trước change này
