## ADDED Requirements

### Requirement: Quyền lệnh sửa theo vai trò
Bảng quyền SHALL có `repairs.work` cho `DIRECTOR`, `WORKSHOP` (nhận lệnh, ghi số, báo sửa xong) và `repairs.count` cho `DIRECTOR`, `WAREHOUSE` (đếm nghiệm thu). `repairs.view` và `repairs.manage` giữ nguyên. `repairs.work` và `repairs.count` SHALL không cho xem giá hay mở trang sửa chữa desktop.

#### Scenario: Đọc bảng quyền lệnh sửa
- **WHEN** đọc bảng quyền cho các quyền sửa chữa
- **THEN** `repairs.view` cho `DIRECTOR`, `ACCOUNTANT`, `SALES`; `repairs.manage` cho `DIRECTOR`, `ACCOUNTANT`; `repairs.work` cho `DIRECTOR`, `WORKSHOP`; `repairs.count` cho `DIRECTOR`, `WAREHOUSE`

#### Scenario: Xưởng mở trang desktop
- **WHEN** `hoangnam` (Xưởng) mở `/repairs/PSC-2026-031`
- **THEN** trang trả 403 **AND** `/m/repairs/PSC-2026-031` mở được

#### Scenario: Kế toán không báo sửa xong
- **WHEN** `thuha` (Kế toán) gửi lệnh báo sửa xong qua `/api/m/repairs/PSC-2026-031/report`
- **THEN** API trả 403
