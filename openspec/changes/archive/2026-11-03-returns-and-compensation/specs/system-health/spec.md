## ADDED Requirements

### Requirement: Cảnh báo dung lượng ảnh thu hồi
Hệ thống SHALL tính tổng dung lượng ảnh thu hồi đã lưu và so với ngưỡng cảnh báo đặt một chỗ trong `src/domain` (mặc định 200 MB). Khi vượt ngưỡng, `GET /api/health` SHALL trả thêm `data.photoStorage` là `"warning"` (không kèm số liệu), và trang Cài đặt của Giám đốc SHALL hiện cảnh báo kèm số MB đang dùng. Dưới ngưỡng thì `photoStorage` là `"ok"`.

#### Scenario: Vượt ngưỡng
- **WHEN** tổng ảnh thu hồi là 210 MB
- **THEN** `GET /api/health` trả HTTP 200 với `data.photoStorage` là `"warning"` **AND** trang Cài đặt của `minhanh` hiện "Ảnh thu hồi đang dùng 210 MB, vượt ngưỡng 200 MB. Cần chuyển ảnh sang kho riêng trước khi cơ sở dữ liệu đầy."

#### Scenario: Dưới ngưỡng
- **WHEN** tổng ảnh thu hồi là 35 MB
- **THEN** `data.photoStorage` là `"ok"` **AND** trang Cài đặt không có cảnh báo

#### Scenario: Không lộ số liệu ra ngoài
- **WHEN** gọi `GET /api/health` khi chưa đăng nhập
- **THEN** phản hồi không chứa số MB hay số ảnh
