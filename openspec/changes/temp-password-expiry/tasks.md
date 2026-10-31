# Tasks

## 1. Database Schema & Migration

- [ ] 1.1 Thêm cột `temp_password_expires_at` (timestamp with time zone, nullable) vào bảng `user` trong `src/db/schema/auth.ts`.
- [ ] 1.2 Tạo migration Drizzle, cập nhật dữ liệu hiện tại có `must_change_password = true` với hạn 48 giờ, và chạy migrate trên test & local database.

## 2. Core Backend & Sign-In Logic

- [ ] 2.1 Cập nhật `src/lib/users/service.ts`, `src/lib/users/first-director.ts`, `src/lib/users/seed.ts` để gán hạn `now + 48h` khi tạo tài khoản, đặt lại mật khẩu, mở khóa tài khoản; xóa hạn khi người dùng đổi mật khẩu thành công.
- [ ] 2.2 Cập nhật `src/lib/auth/sign-in.ts`: kiểm tra nếu `account.mustChange` và `now >= tempPasswordExpiresAt` thì từ chối đăng nhập với status 401 và thông báo "Mật khẩu tạm đã hết hạn. Liên hệ Giám đốc để cấp lại".
- [ ] 2.3 Viết integration tests cho sign-in: mật khẩu tạm trước 48h đăng nhập được, sau 48h bị từ chối; gõ sai mật khẩu trả thông báo chung.

## 3. UI Display & User Actions (D17)

- [ ] 3.1 Cập nhật `UserRow` trong `src/lib/users/service.ts` trả thêm `tempPasswordExpiresAt` (ISO string hoặc null).
- [ ] 3.2 Cập nhật `src/components/users/users-screen.tsx`: hiển thị badge "Hết hạn mật khẩu tạm" ở cột trạng thái khi mật khẩu tạm quá hạn 48 giờ.
- [ ] 3.3 Cập nhật `src/components/users/user-row-actions.tsx`: hiển thị nhãn "Cấp lại mật khẩu tạm" cho tài khoản đang hết hạn mật khẩu tạm.
- [ ] 3.4 Viết component unit test kiểm tra hiển thị trạng thái và nút hành động trên D17.

## 4. Verification

- [ ] 4.1 Chạy `npx openspec validate temp-password-expiry --strict`.
- [ ] 4.2 Chạy `npm run lint && npm run typecheck && npm test && npm run test:e2e`.

## Workflow follow-up

- Archive change sau khi hoàn tất review và merge PR.
