# Tasks

## 1. Data Sanitization & Domain Rules

- [ ] 1.1 Tạo hàm khử trùng `sanitizeErrorPayload` trong `src/lib/monitoring/sanitize.ts` che CCCD, STK, mật khẩu, cookie, tokens.
- [ ] 1.2 Viết unit tests kiểm tra che dữ liệu cá nhân và xóa mật khẩu trong `src/lib/monitoring/sanitize.test.ts`.

## 2. Server Error Tracking

- [ ] 2.1 Cấu hình `onRequestError` trong `src/instrumentation.ts` để bắt và lọc lỗi server.
- [ ] 2.2 Viết unit test cho logic xử lý lỗi server trong `src/instrumentation.test.ts`.

## 3. Client Error Tracking & Telemetry Route

- [ ] 3.1 Tạo component `src/components/shell/error-reporter.tsx` bắt lỗi browser `window.onerror` và `unhandledrejection`.
- [ ] 3.2 Tích hợp `ErrorReporter` vào `src/app/layout.tsx`.
- [ ] 3.3 Tạo route nhận log lỗi client `src/app/api/telemetry/errors/route.ts`.
- [ ] 3.4 Viết integration test cho telemetry route trong `src/app/api/telemetry/errors/route.int.test.ts`.

## 4. CSP & Configuration

- [ ] 4.1 Bổ sung biến môi trường `SENTRY_DSN` và `ERROR_MONITORING_ENABLED` vào `src/lib/env.ts`.
- [ ] 4.2 Cập nhật `buildCspHeader` trong `src/lib/security/csp.ts` cho phép DSN host trong `connect-src`.
- [ ] 4.3 Viết unit test cho CSP khi bật/tắt giám sát trong `src/lib/security/csp.test.ts`.

## 5. Verification

- [ ] 5.1 Chạy `npx openspec validate error-monitoring --strict`.
- [ ] 5.2 Chạy `npm run lint && npm run typecheck && npm test`.

## Workflow follow-up

- Dừng lại sau khi propose để Giám đốc duyệt trước khi apply.
