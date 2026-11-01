# Design: error-monitoring (K11)

## Overview

Tài liệu thiết kế kiến trúc theo dõi lỗi tập trung cho hệ thống Scaffolding ERP khi vận hành trên production, đảm bảo phát hiện kịp thời các sự cố cả ở phía server lẫn client trình duyệt, đồng thời loại bỏ 100% rủi ro rò rỉ dữ liệu cá nhân (PII) ra bên ngoài.

---

## Decisions

### 1. Lựa chọn công cụ giám sát: Sentry vs Vercel Log Drain vs Tự xây dựng

- **Phân tích các phương án**:
  1. *Sentry*:
     - **Ưu điểm**: Đầy đủ stacktrace, sourcemap, phân nhóm lỗi thông minh, bắt lỗi client-side và server-side rất chi tiết.
     - **Nhược điểm**: Máy chủ đặt ở nước ngoài (Mỹ/EU), cần thỏa thuận xử lý dữ liệu và đánh giá tác động chuyển dữ liệu cá nhân ra nước ngoài theo Nghị định 13/2023/NĐ-CP (Issue #78).
  2. *Vercel Log Drain*:
     - **Ưu điểm**: Có sẵn trong hạ tầng Vercel, không thêm dependency.
     - **Nhược điểm**: Chỉ thu thập log stdout/stderr từ server/edge functions, hoàn toàn mù mờ đối với các lỗi runtime JavaScript trên trình duyệt của người dùng (nhất là thiết bị di động ở kho/bãi).
  3. *Kiến trúc Hybrid Pluggable (Khuyến nghị)*:
     - **Cơ chế thu thập**:
       - Phía Server: Dùng hàm chuẩn `onRequestError` trong `src/instrumentation.ts` do Next.js cung cấp sẵn.
       - Phía Client: Component nhỏ gọn `ErrorReporter` bắt các sự kiện `error` và `unhandledrejection`, gửi về route `/api/telemetry/errors`.
     - **Cơ chế xử lý (Pluggable Sink)**:
       - Mọi payload lỗi bắt buộc đi qua tầng làm sạch `sanitizeErrorPayload()` trước khi ghi log hoặc gửi ra ngoài.
       - Nếu có cấu hình `SENTRY_DSN` (hoặc `ERROR_MONITORING_DSN`): gửi payload đã khử trùng tới endpoint giám sát từ xa (Sentry hoặc webhook tự chủ).
       - Nếu không cấu hình DSN (mặc định): ghi log có cấu trúc (JSON structured log) ra stdout để Vercel Log Drain / CloudWatch tự động thu thập.
     - **Lợi ích**: Không bị phụ thuộc vào một nhà cung cấp cụ thể, linh hoạt chuyển đổi giữa Sentry, webhook nội bộ hoặc Vercel logs mà không cần viết lại mã nguồn.

### 2. Che giấu và khử trùng dữ liệu cá nhân (Data Sanitization Rules)

Hàm `sanitizeErrorPayload(raw)` thực hiện các quy tắc sau:
1. **Xóa hoàn toàn các trường xác thực và nhạy cảm**:
   - Các key: `password`, `currentPassword`, `newPassword`, `confirmPassword`, `secret`, `token`, `authorization`, `cookie`, `set-cookie`.
   - Giá trị được thay thế bằng chuỗi `"[REDACTED]"`.
2. **Che dữ liệu cá nhân (PII)**:
   - Căn cước công dân / CMND (`idNumber`, `identityNumber` hoặc chuỗi khớp regex 9/12 số): sử dụng `maskIdNumber` giữ 3 số đầu và 2 số cuối: `001***99`.
   - Số tài khoản ngân hàng (`bankAccount` hoặc chuỗi khớp regex 6–20 số): sử dụng `maskBankAccount` giữ 3 số cuối: `***789`.
   - Header `Cookie`: chỉ giữ lại thông tin có mặt của cookie session (`hasSession: true`), xóa hoàn toàn nội dung cookie token.
3. **Làm sạch URL & Headers**:
   - Query string của URL nếu chứa token/key sẽ được loại bỏ giá trị tham số.
   - Header `Authorization` được thay bằng `"[REDACTED]"`.

### 3. Cập nhật Content-Security-Policy (CSP)

- Trong `src/lib/security/csp.ts`:
  - Hiện tại: `connect-src 'self'`.
  - Khi bật giám sát với Sentry (hoặc endpoint ngoài):
    ```ts
    const connectDirectives = ["'self'"];
    if (sentryHost) {
      connectDirectives.push(`https://${sentryHost}`);
    }
    ```
  - Giữ nguyên 100% tính bảo mật của `script-src`: giữ `nonce` động cho mỗi request và `'strict-dynamic'`.

### 4. Bật/Tắt theo môi trường (Environment Configuration)

- Biến môi trường:
  - `SENTRY_DSN` (tùy chọn, string): URL DSN của Sentry nếu muốn gửi lỗi về dashboard Sentry.
  - `ERROR_MONITORING_ENABLED`: boolean (tùy chọn, mặc định `true` khi `NODE_ENV === "production" && SENTRY_DSN !== undefined`).
- Khi chạy ở môi trường `development` hoặc `test`:
  - Không gửi telemetry từ xa để tránh tốn quota và tránh làm loãng dữ liệu dashboard.
  - Lỗi hiển thị đầy đủ trên màn hình / console dev để lập trình viên gỡ lỗi thuận tiện.
