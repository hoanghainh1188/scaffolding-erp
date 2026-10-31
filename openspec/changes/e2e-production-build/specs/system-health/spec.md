# Spec Delta

## ADDED Requirements

### Requirement: Khởi chạy bản build production
Hệ thống SHALL biên dịch (`next build`) và phục vụ các yêu cầu ở môi trường production (`next start`) mà không có lỗi biên dịch tĩnh hay phụ thuộc vào chế độ dev.

#### Scenario: Chạy ứng dụng trên bản build production
- **WHEN** hệ thống được biên dịch bằng `next build` và khởi động bằng `next start`
- **THEN** các trang `/login`, `/dashboard`, `/m` phản hồi HTTP 200 mà không gặp lỗi render hay thiếu tài nguyên tĩnh
