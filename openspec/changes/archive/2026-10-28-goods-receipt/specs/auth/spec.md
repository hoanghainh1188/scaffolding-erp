# Spec Delta

## MODIFIED Requirements

### Requirement: Bảng quyền theo vai trò
Hệ thống SHALL có một bảng quyền duy nhất ánh xạ mỗi quyền tới các vai trò được phép, gồm quyền xem từng mục menu, quyền danh mục, quyền kho, quyền thu mua, quyền nhận hàng và giá sắt vụn như các kịch bản dưới đây. Menu và server SHALL cùng đọc bảng này.

#### Scenario: Menu và server khớp nhau
- **WHEN** vai trò `ACCOUNTANT` không có quyền vào Cài đặt trong bảng quyền
- **THEN** sidebar không hiện mục Cài đặt **AND** mở thẳng `/settings` nhận trang 403

#### Scenario: Thêm quyền mới
- **WHEN** một change sau thêm quyền "duyệt hợp đồng" chỉ cho `DIRECTOR` vào bảng quyền
- **THEN** cả nút trên giao diện lẫn API duyệt đều dùng quyền đó, không khai báo vai trò ở chỗ khác

#### Scenario: Quyền xem mục menu theo vai trò
- **WHEN** đọc bảng quyền cho các mục menu
- **THEN** Tổng quan, Thu mua, Kho, Sửa chữa, Bán & Thuê, Danh mục cho `DIRECTOR`, `ACCOUNTANT`, `SALES`; Công nợ cho `DIRECTOR`, `ACCOUNTANT`; Báo cáo, Cài đặt, quản lý người dùng chỉ cho `DIRECTOR`

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

#### Scenario: Quyền thu mua theo vai trò
- **WHEN** đọc bảng quyền cho các quyền thu mua
- **THEN** `purchasing.view` cho `DIRECTOR`, `ACCOUNTANT`, `SALES`; `purchasing.manage` chỉ cho `DIRECTOR`, `SALES`

#### Scenario: Kế toán xem đơn thu mua nhưng không tạo
- **WHEN** `thuha` (Kế toán) mở `/purchasing` rồi gửi `POST /api/purchasing/orders`
- **THEN** trang mở được **AND** API trả 403

#### Scenario: Quyền nhận hàng và tra tồn theo vai trò
- **WHEN** đọc bảng quyền cho các quyền nhận hàng
- **THEN** `receiving.manage` cho `DIRECTOR`, `WAREHOUSE`; `stock.lookup` cho cả 5 vai trò; `scrap-price.manage` chỉ cho `DIRECTOR`

#### Scenario: Thủ kho nhận hàng nhưng không mở trang đơn của văn phòng
- **WHEN** `vantung` (Thủ kho) gửi `GET /api/receiving/orders/PO-2026-052` rồi mở `/purchasing/orders/PO-2026-052`
- **THEN** API trả dữ liệu đơn để nhận hàng **AND** trang trả 403
