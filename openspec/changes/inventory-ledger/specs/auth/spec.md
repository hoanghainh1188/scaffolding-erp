# Spec Delta

## MODIFIED Requirements

### Requirement: Bảng quyền theo vai trò
Hệ thống SHALL có một bảng quyền duy nhất ánh xạ mỗi quyền tới các vai trò được phép. Xem Tổng quan, Thu mua, Kho, Sửa chữa, Bán & Thuê, Danh mục — Giám đốc, Kế toán, Kinh doanh; xem Công nợ — Giám đốc, Kế toán; xem Báo cáo, Cài đặt, quản lý người dùng — Giám đốc. Đọc danh mục qua API — mọi vai trò; sửa vật tư, bộ, nhóm — Giám đốc, Kinh doanh; sửa đối tác, công trình — Giám đốc, Kinh doanh, Kế toán; sửa bãi, xưởng — Giám đốc. Xem tồn kho, thẻ kho, phiếu điều chỉnh (quyền Kho `inventory.view`) — Giám đốc, Kế toán, Kinh doanh; lập phiếu điều chỉnh và tồn đầu kỳ — Giám đốc, Kế toán; duyệt phiếu điều chỉnh và tồn đầu kỳ — Giám đốc. Menu và server SHALL cùng đọc bảng này.

#### Scenario: Menu và server khớp nhau
- **WHEN** vai trò `ACCOUNTANT` không có quyền vào Cài đặt trong bảng quyền
- **THEN** sidebar không hiện mục Cài đặt **AND** mở thẳng `/settings` nhận trang 403

#### Scenario: Thêm quyền mới
- **WHEN** một change sau thêm quyền "duyệt hợp đồng" chỉ cho `DIRECTOR` vào bảng quyền
- **THEN** cả nút trên giao diện lẫn API duyệt đều dùng quyền đó, không khai báo vai trò ở chỗ khác

#### Scenario: Quyền danh mục theo vai trò
- **WHEN** đọc bảng quyền cho các quyền danh mục
- **THEN** `catalog.read` cho cả 5 vai trò; `items.manage` cho `DIRECTOR`, `SALES`; `partners.manage` cho `DIRECTOR`, `SALES`, `ACCOUNTANT`; `locations.manage` chỉ cho `DIRECTOR`

#### Scenario: Kế toán xem Danh mục nhưng không sửa vật tư
- **WHEN** `thuha` (Kế toán) mở `/catalog/items` rồi gửi `POST /api/catalog/items`
- **THEN** trang mở được **AND** API trả 403

#### Scenario: Quyền kho theo vai trò
- **WHEN** đọc bảng quyền cho các quyền kho
- **THEN** `inventory.view` cho `DIRECTOR`, `ACCOUNTANT`, `SALES`; `inventory.adjust` cho `DIRECTOR`, `ACCOUNTANT`; `inventory.approve` chỉ cho `DIRECTOR`

#### Scenario: Kế toán lập nhưng không duyệt điều chỉnh
- **WHEN** `thuha` (Kế toán) gửi `POST /api/inventory/adjustments` rồi gửi duyệt chính phiếu đó qua `POST /api/inventory/adjustments/<id>/approve`
- **THEN** phiếu được tạo **AND** lệnh duyệt trả 403
