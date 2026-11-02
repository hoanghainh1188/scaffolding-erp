# Tasks: natural-ui-copy

## Phase 1: Chuẩn hóa từ điển `src/locales/vi/`
- [x] Cập nhật `src/locales/vi/navigation.ts` (Mua hàng, Cho thuê & Bán).
- [x] Cập nhật `src/locales/vi/receiving.ts` và `src/locales/vi/receipt-anomalies.ts`.
- [x] Cập nhật `src/locales/vi/purchasing.ts` và `src/locales/vi/landed-cost.ts`.
- [x] Cập nhật `src/locales/vi/stocktake.ts`.
- [x] Cập nhật `src/locales/vi/repairs.ts`.
- [x] Cập nhật `src/locales/vi/inventory.ts`.
- [x] Cập nhật `src/locales/vi/catalog.ts`.
- [x] Cập nhật `src/locales/vi/auth.ts` và `src/locales/vi/users.ts`.

## Phase 2: Cập nhật Components & Unit / Integration Tests
- [x] Cập nhật tiêu đề metadata trang bán hàng / cho thuê tại `src/app/(desktop)/sales/page.tsx` và trang đăng nhập `src/app/login/page.tsx` (nếu có).
- [x] Cập nhật unit test điều hướng `src/lib/navigation.test.ts`.
- [x] Kiểm tra và cập nhật các component tests hoặc domain messages tests bị ảnh hưởng.
- [x] Chạy `npm test` và `npm run typecheck` để đảm bảo không lỗi kiểu dữ liệu.

## Phase 3: E2E Tests & Visual Snapshots
- [x] Cập nhật test Playwright `tests/e2e/desktop-shell.spec.ts` cho các nhãn menu mới ("Mua hàng", "Cho thuê & Bán").
- [x] Chạy kiểm thử E2E Playwright `npm run test:e2e`.
- [x] Cập nhật lại ảnh chụp visual snapshot nếu có thay đổi nhãn menu trên giao diện Desktop/Mobile.

## Phase 4: Tổng kết & Tạo Pull Request
- [x] Chạy kiểm tra chất lượng toàn diện (`npm run typecheck`, `npm test`, `npm run lint`).
- [x] Tạo Pull Request trên GitHub với mô tả chi tiết, sẵn sàng cho Harry review.
