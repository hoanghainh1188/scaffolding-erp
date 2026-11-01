# user-management Specification Delta

## ADDED Requirements

### Requirement: Bảo vệ tài khoản demo trong quản trị người dùng
Khi hệ thống hoạt động ở chế độ demo (`DEMO_MODE=true`), hệ thống SHALL từ chối các thao tác khóa tài khoản, đặt lại mật khẩu, hoặc thay đổi vai trò đối với 5 tài khoản demo dùng chung (`giamdoc`, `ketoan`, `kinhdoanh`, `thukho`, `xuong`) với mã lỗi HTTP 409 và thông báo lỗi tương ứng.

#### Scenario: Chặn đặt lại mật khẩu tài khoản demo khi bật chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** Giám đốc yêu cầu đặt lại mật khẩu cho tài khoản `thukho`
- **THEN** hệ thống trả mã lỗi HTTP 409 với thông báo "Tài khoản demo dùng chung không thể đặt lại mật khẩu"
- **AND** mật khẩu của `thukho` không bị thay đổi

#### Scenario: Chặn khóa tài khoản demo khi bật chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** Giám đốc yêu cầu khóa tài khoản `thukho`
- **THEN** hệ thống trả mã lỗi HTTP 409 với thông báo "Tài khoản demo dùng chung không thể khóa"
- **AND** trạng thái của `thukho` vẫn là `ACTIVE`

#### Scenario: Chặn đổi vai trò tài khoản demo khi bật chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** Giám đốc yêu cầu đổi vai trò của `thukho` sang `SALES`
- **THEN** hệ thống trả mã lỗi HTTP 409 với thông báo "Tài khoản demo dùng chung không thể đổi vai trò"
- **AND** vai trò của `thukho` vẫn là `WAREHOUSE`

#### Scenario: Cho phép quản lý tài khoản tạo mới trong chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** Giám đốc khóa hoặc đặt lại mật khẩu cho một tài khoản mới được tạo thử nghiệm (không thuộc danh sách 5 tài khoản demo)
- **THEN** thao tác được thực hiện thành công
