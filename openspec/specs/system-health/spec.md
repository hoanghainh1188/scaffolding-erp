# system-health Specification

## Purpose

Cho người vận hành biết ứng dụng và cơ sở dữ liệu có đang chạy đúng không, và chặn ứng dụng khởi động khi thiếu cấu hình bắt buộc.

## Requirements

### Requirement: API kiểm tra sức khỏe
Hệ thống SHALL cung cấp `GET /api/health` không cần đăng nhập. Khi ứng dụng và cơ sở dữ liệu đều hoạt động, API SHALL trả HTTP 200. Khi không kết nối được cơ sở dữ liệu, API SHALL trả HTTP 503. Phản hồi SHALL không chứa chuỗi kết nối, mật khẩu hay chi tiết lỗi nội bộ.

#### Scenario: Mọi thứ hoạt động
- **WHEN** gọi `GET /api/health` khi cơ sở dữ liệu đang chạy
- **THEN** nhận HTTP 200 với nội dung `{ "success": true, "data": { "status": "ok", "database": "ok" }, "error": null }`

#### Scenario: Mất kết nối cơ sở dữ liệu
- **WHEN** gọi `GET /api/health` khi cơ sở dữ liệu đã tắt
- **THEN** nhận HTTP 503 với `data.database` là `"unreachable"` và `error` là "Không kết nối được cơ sở dữ liệu"
- **AND** phản hồi không chứa `DATABASE_URL` hay thông báo lỗi gốc của driver

#### Scenario: Cơ sở dữ liệu phản hồi chậm
- **WHEN** cơ sở dữ liệu không trả lời trong 3 giây
- **THEN** API trả HTTP 503 với `data.database` là `"unreachable"`, không treo quá 3 giây

### Requirement: Kiểm tra cấu hình khi khởi động
Ứng dụng SHALL kiểm tra các biến môi trường bắt buộc khi khởi động và dừng ngay với thông báo rõ tên biến bị thiếu hoặc sai. Thông báo SHALL không in ra giá trị bí mật.

#### Scenario: Thiếu DATABASE_URL
- **WHEN** khởi động ứng dụng mà không có biến `DATABASE_URL`
- **THEN** ứng dụng không chạy và báo lỗi có nhắc tên `DATABASE_URL`

#### Scenario: DATABASE_URL sai định dạng
- **WHEN** `DATABASE_URL` là "localhost:5432"
- **THEN** ứng dụng không chạy và báo `DATABASE_URL` phải là URL dạng `postgres://...`
- **AND** thông báo không in lại giá trị đã cấu hình

#### Scenario: Vai trò giả lập sai
- **WHEN** ở môi trường dev, biến vai trò giả lập là "ADMIN"
- **THEN** ứng dụng không chạy và báo vai trò phải là một trong `DIRECTOR`, `ACCOUNTANT`, `SALES`, `WAREHOUSE`, `WORKSHOP`

### Requirement: Khởi chạy bản build production
Hệ thống SHALL biên dịch (`next build`) và phục vụ các yêu cầu ở môi trường production (`next start`) mà không có lỗi biên dịch tĩnh hay phụ thuộc vào chế độ dev.

#### Scenario: Chạy ứng dụng trên bản build production
- **WHEN** hệ thống được biên dịch bằng `next build` và khởi động bằng `next start`
- **THEN** các trang `/login`, `/dashboard`, `/m` phản hồi HTTP 200 mà không gặp lỗi render hay thiếu tài nguyên tĩnh
