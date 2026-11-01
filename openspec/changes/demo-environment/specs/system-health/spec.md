# system-health Specification Delta

## ADDED Requirements

### Requirement: Chế độ môi trường demo
Hệ thống SHALL hỗ trợ cờ cấu hình `DEMO_MODE` để nhận biết môi trường thử nghiệm công khai, hiển thị thông báo nhận diện cho người dùng, ngăn chặn máy tìm kiếm và hỗ trợ suy diễn URL xác thực cho bản xem trước Vercel.

#### Scenario: Hiển thị banner cảnh báo và cấm chỉ mục khi bật chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** người dùng truy cập bất kỳ trang nào của ứng dụng
- **THEN** trang web hiển thị thanh thông báo có nội dung "Bản thử nghiệm — Dữ liệu được làm mới vào 0:00 mỗi ngày"
- **AND** mã HTML chứa thẻ metadata robots `noindex, nofollow`

#### Scenario: Tự động nhận diện BETTER_AUTH_URL cho Vercel Preview
- **GIVEN** ứng dụng chạy trên Vercel ở chế độ `VERCEL_ENV=preview` và có biến `VERCEL_URL`
- **WHEN** biến `BETTER_AUTH_URL` không được cấu hình thủ công
- **THEN** hệ thống tự động suy diễn `BETTER_AUTH_URL` là `https://<VERCEL_URL>` mà không báo lỗi thiếu biến môi trường
