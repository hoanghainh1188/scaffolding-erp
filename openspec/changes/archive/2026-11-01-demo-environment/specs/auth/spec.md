# auth Specification Delta

## ADDED Requirements

### Requirement: Bảo vệ tài khẩu demo khi đổi mật khẩu
Khi hệ thống hoạt động ở chế độ demo (`DEMO_MODE=true`), hệ thống SHALL từ chối yêu cầu đổi mật khẩu cá nhân của 5 tài khoản demo dùng chung (`giamdoc`, `ketoan`, `kinhdoanh`, `thukho`, `xuong`) với mã lỗi HTTP 400 và thông báo tiếng Việt "Tài khoản demo dùng chung không được đổi mật khẩu".

#### Scenario: Chặn tài khoản demo đổi mật khẩu khi bật chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** tài khoản `ketoan` gửi yêu cầu đổi mật khẩu cá nhân
- **THEN** hệ thống trả mã lỗi HTTP 400 với thông báo "Tài khoản demo dùng chung không được đổi mật khẩu"
- **AND** mật khẩu của tài khoản không bị thay đổi

#### Scenario: Cho phép đổi mật khẩu khi tắt chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=false` (hoặc không cấu hình)
- **WHEN** tài khoản `ketoan` gửi yêu cầu đổi mật khẩu với mật khẩu hiện tại chính xác
- **THEN** hệ thống đổi mật khẩu thành công
