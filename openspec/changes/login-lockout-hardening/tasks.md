# Tasks

## 1. Database Schema & Migration

- [x] 1.1 Cập nhật bảng `login_throttle` trong `src/db/schema/auth.ts`: thêm cột `ip` (text, not null) và đổi khóa chính thành composite primary key `(username_key, ip)`.
- [x] 1.2 Tạo migration script Drizzle và chạy migrate trong môi trường test/local, kiểm tra bảng tạo thành công.

## 2. Core Domain & Business Logic

- [x] 2.1 Cập nhật `src/domain/login-throttle.ts`: hỗ trợ key theo `(usernameKey, ip)`. Viết unit test cho logic throttle trong `src/domain/login-throttle.test.ts`.
- [x] 2.2 Cập nhật `src/lib/auth/sign-in.ts`: truyền client IP vào hàm kiểm tra throttle và lưu failure theo `(usernameKey, ip)`.
- [x] 2.3 Cập nhật hàm Giám đốc reset mật khẩu xóa toàn bộ bản ghi `login_throttle` theo `usernameKey` trên mọi IP.

## 3. Rescue CLI & Integration Tests

- [x] 3.1 Tạo script dòng lệnh `scripts/unlock-user.mts` và cấu hình lệnh `npm run unlock` trong `package.json` để xóa bản ghi khóa theo tên người dùng.
- [x] 3.2 Viết integration tests kiểm tra:
  - Nhập sai 5 lần từ IP A bị khóa trên IP A.
  - Từ IP B vẫn đăng nhập thành công với mật khẩu đúng.
  - Tên không tồn tại cũng bị khóa và trả thông báo đồng nhất.
  - Nhiều yêu cầu gửi đồng thời (concurrent failures) được ghi nhận chính xác không làm hỏng khóa.
  - Lệnh unlock dọn sạch bản ghi khóa.

## 4. Documentation & Verification

- [x] 4.1 Cập nhật `README.md` và `CLAUDE.md` hướng dẫn sử dụng lệnh cứu hộ khi bị khóa.
- [x] 4.2 Chạy `npx openspec validate login-lockout-hardening --strict` và toàn bộ test suite `npm run lint && npm run typecheck && npm test && npm run test:e2e`.

## Workflow follow-up

- Archive change sau khi hoàn tất review và merge PR.
