## MODIFIED Requirements

### Requirement: Chỉ Giám đốc quản lý người dùng
Màn `/settings/users` và mọi API quản lý người dùng SHALL chỉ dành cho vai trò `DIRECTOR`. Vai trò khác nhận 403 (theo bảng quyền của capability `auth`). Ngoại lệ: tài khoản có cờ Admin hệ thống SHALL mở được `/settings/users` và gọi được API gỡ xác thực 2 lớp; nếu không phải `DIRECTOR`, tài khoản đó SHALL chỉ thấy danh sách và mục "Gỡ xác thực 2 lớp", không có thao tác quản lý nào khác.

#### Scenario: Giám đốc mở D17
- **WHEN** `minhanh` (Giám đốc) bấm Cài đặt › Người dùng
- **THEN** trang `/settings/users` hiện danh sách người dùng

#### Scenario: Kế toán gọi API danh sách
- **WHEN** `thuha` (Kế toán) gọi `GET /api/users`
- **THEN** API trả 403, không trả danh sách

#### Scenario: Admin không phải Giám đốc mở D17
- **WHEN** `quocbao` (Kinh doanh, có cờ Admin hệ thống) mở `/settings/users`
- **THEN** trang hiện danh sách **AND** menu của dòng chỉ có "Gỡ xác thực 2 lớp"

#### Scenario: Admin không phải Giám đốc khóa tài khoản
- **WHEN** `quocbao` (Kinh doanh, có cờ) gửi `POST /api/users/<id>/lock`
- **THEN** API trả 403 và tài khoản không đổi
