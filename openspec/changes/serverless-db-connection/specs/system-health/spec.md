# system-health Specification Delta

## ADDED Requirements

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
