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

### Requirement: Cấu hình kết nối cơ sở dữ liệu serverless
Hệ thống SHALL hỗ trợ các biến môi trường cấu hình kích thước pool, thời gian chờ kết nối, thời gian đóng kết nối rảnh và chế độ prepared statements phù hợp với môi trường serverless mà vẫn giữ nguyên giá trị mặc định tương thích ngược trên môi trường phát triển cục bộ và CI.

#### Scenario: Cấu hình pool và timeout tùy chỉnh
- **WHEN** cấu hình `DB_POOL_MAX=5`, `DB_CONNECT_TIMEOUT_SECONDS=10`, `DB_IDLE_TIMEOUT_SECONDS=15`, `DB_PREPARE=false`
- **THEN** client kết nối cơ sở dữ liệu khởi tạo pool với tối đa 5 kết nối, timeout kết nối 10 giây, idle timeout 15 giây và tắt prepared statements

#### Scenario: Giá trị mặc định tương thích ngược
- **WHEN** các biến `DB_POOL_MAX`, `DB_CONNECT_TIMEOUT_SECONDS`, `DB_IDLE_TIMEOUT_SECONDS`, `DB_PREPARE` không được cung cấp
- **THEN** client kết nối cơ sở dữ liệu mặc định tối đa 10 kết nối, timeout kết nối 3 giây, không kích hoạt idle timeout và bật prepared statements

#### Scenario: Giá trị cấu hình biến môi trường không hợp lệ
- **WHEN** `DB_POOL_MAX` nhỏ hơn 1 hoặc không phải số nguyên
- **THEN** hệ thống từ chối khởi động và báo lỗi tiếng Việt nêu rõ quy tắc của `DB_POOL_MAX`

### Requirement: Kết nối cơ sở dữ liệu cho tác vụ migration
Script thực thi di chuyển cơ sở dữ liệu (`migrate.mts`) SHALL ưu tiên sử dụng `DATABASE_URL_UNPOOLED` nếu có để kết nối trực tiếp không qua pooler, và fallback sang `DATABASE_URL` khi không có biến này.

#### Scenario: Sử dụng DATABASE_URL_UNPOOLED khi chạy migration
- **WHEN** cả `DATABASE_URL_UNPOOLED` và `DATABASE_URL` đều tồn tại trong môi trường
- **THEN** lệnh di chuyển dữ liệu kết nối tới địa chỉ chỉ định trong `DATABASE_URL_UNPOOLED`
