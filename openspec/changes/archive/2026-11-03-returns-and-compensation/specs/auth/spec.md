## ADDED Requirements

### Requirement: Quyền thu hồi và đền bù theo vai trò
Bảng quyền SHALL có `returns.receive` (mở M4, gửi ảnh, lưu phiếu thu hồi) cho `DIRECTOR`, `WAREHOUSE`, và `compensations.approve` (sửa đơn giá, giảm trừ, duyệt, từ chối phiếu đền bù) chỉ cho `DIRECTOR`. Xem phiếu thu hồi, phiếu đền bù và ảnh trên Desktop SHALL dùng quyền xem hợp đồng thuê. Không khai báo vai trò cho hai loại phiếu này ở chỗ khác.

#### Scenario: Đọc bảng quyền thu hồi
- **WHEN** đọc bảng quyền
- **THEN** `returns.receive` chỉ cho `DIRECTOR`, `WAREHOUSE` **AND** `compensations.approve` chỉ cho `DIRECTOR`

#### Scenario: Xưởng gọi API thu hồi
- **WHEN** một tài khoản `WORKSHOP` gửi `POST /api/m/returns`
- **THEN** API trả 403 với "Bạn không có quyền thực hiện thao tác này"

#### Scenario: Thủ kho thu hồi nhưng không mở D8
- **WHEN** `vantung` mở `/m/returns/new` rồi mở `/sales/compensations`
- **THEN** M4 mở được **AND** trang D8 trả 403
