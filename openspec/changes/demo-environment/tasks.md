# Tasks

## 1. Environment & Configuration

- [ ] 1.1 Thêm biến `DEMO_MODE` (boolean, mặc định `false`) vào `src/lib/env.ts` và export helper `isDemoMode()`.
- [ ] 1.2 Hỗ trợ tự động suy diễn `BETTER_AUTH_URL` từ `VERCEL_URL` khi `VERCEL_ENV=preview` trong `src/lib/env.ts`.
- [ ] 1.3 Viết unit test cho `src/lib/env.ts` trong `src/lib/env.test.ts` kiểm tra `DEMO_MODE` và fallback Vercel preview URL.

## 2. Bảo vệ tài khoản demo

- [ ] 2.1 Định nghĩa `DEMO_USERNAMES` và helper `isDemoAccount(username)` dựa trên danh sách `DEV_ACCOUNTS`.
- [ ] 2.2 Cập nhật `src/lib/auth/change-password.ts`: từ chối yêu cầu đổi mật khẩu tài khoản demo khi `isDemoMode()` với mã 400.
- [ ] 2.3 Cập nhật `src/lib/users/service.ts`: từ chối các thao tác `resetPassword`, `lockUser`, `changeRole` đối với tài khoản demo khi `isDemoMode()` với mã 409.
- [ ] 2.4 Viết integration tests trong `src/lib/auth/change-password.int.test.ts` và `src/lib/users/service.int.test.ts` xác thực chặn tài khoản demo khi bật `DEMO_MODE` và vẫn hoạt động khi tắt.

## 3. Giao diện Demo Banner & Metadata

- [ ] 3.1 Tạo component `DemoBanner` trong `src/components/shell/demo-banner.tsx` hiển thị thanh thông báo thử nghiệm.
- [ ] 3.2 Tích hợp `DemoBanner` vào `src/app/layout.tsx` và bổ sung thẻ metadata robots `noindex, nofollow` khi `isDemoMode()`.
- [ ] 3.3 Viết component test cho `DemoBanner`.

## 4. Script Seed Demo

- [ ] 4.1 Tạo `scripts/seed-demo.mts` cho phép chạy ở production khi `DEMO_MODE=true` và dời ngày mẫu về gần thời điểm chạy.
- [ ] 4.2 Thêm lệnh `npm run db:seed:demo` vào `package.json`.
- [ ] 4.3 Viết test kiểm tra logic dịch chuyển ngày mẫu của seed demo.

## 5. Verification

- [ ] 5.1 Chạy `npx openspec validate demo-environment --strict`.
- [ ] 5.2 Chạy `npm run lint && npm run typecheck && npm test && npx playwright test tests/e2e/auth.spec.ts`.

## Workflow follow-up

- Dừng lại sau khi propose để Giám đốc duyệt trước khi apply.
