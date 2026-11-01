# Proposal: error-monitoring (K11)

Theo dõi lỗi tập trung cho server và trình duyệt ở môi trường production, tự động làm sạch và che giấu toàn bộ dữ liệu cá nhân (CCCD, số tài khoản, mật khẩu, cookie) trước khi phát tín hiệu báo động.

Refs: #79

## Why

Khi vận hành trên môi trường production, đội ngũ kỹ thuật cần phát hiện ngay khi xảy ra sự cố server hoặc lỗi trình duyệt của người dùng (desktop và điện thoại) thay vì đợi người dùng phản ánh.

Đồng thời, tuân thủ nghiêm ngặt quy định bảo vệ dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP và quy ước CLAUDE.md), nội dung thông báo lỗi tuyệt đối không được chứa thông tin nhạy cảm: mật khẩu, mã xác thực, cookie phiên đăng nhập, số CCCD/CMND và số tài khoản ngân hàng của đối tác/người dùng.

## What Changes

1. **Bộ lọc làm sạch dữ liệu lỗi (`src/lib/monitoring/sanitize.ts`)**:
   - Xóa bỏ hoặc che giấu các trường nhạy cảm: `password`, `newPassword`, `currentPassword`, `token`, `secret`, `cookie`, `authorization`.
   - Che số căn cước công dân (CCCD) và số tài khoản ngân hàng (STK) theo đúng chuẩn bảo mật `maskIdNumber` và `maskBankAccount`.
   - Làm sạch URLs và query parameters có chứa token hoặc thông tin nhạy cảm.

2. **Server-side Error Tracking (`src/instrumentation.ts`)**:
   - Tận dụng hook chuẩn `onRequestError` của Next.js để bắt mọi exception trên server components, route handlers và server actions.
   - Chuẩn hóa payload lỗi và lọc sạch trước khi ghi log hoặc gửi tới dịch vụ giám sát.

3. **Client-side Error Tracking (`src/components/shell/error-reporter.tsx`)**:
   - Bắt các lỗi JavaScript chưa được xử lý (`window.onerror`, `unhandledrejection`) ở phía trình duyệt người dùng.
   - Gửi payload đã được lọc sạch về route thu thập nội bộ `/api/telemetry/errors` hoặc dịch vụ giám sát tập trung.

4. **Tích hợp CSP (`src/lib/security/csp.ts`)**:
   - Cho phép kết nối tới endpoint giám sát (ví dụ Sentry ingest domain nếu bật `SENTRY_DSN`) trong `connect-src` mà không làm ảnh hưởng đến cơ chế nonce.

5. **Cấu hình & Biến môi trường (`src/lib/env.ts`)**:
   - Bổ sung `ERROR_MONITORING_DSN` / `SENTRY_DSN` (tùy chọn).
   - Mặc định chỉ kích hoạt chế độ báo cáo lỗi từ xa khi ở môi trường `production` và có DSN.

## Impact & Migration

- Không yêu cầu thay đổi cấu trúc cơ sở dữ liệu.
- Hoạt động nhẹ nhàng, không gây ảnh hưởng đến hiệu năng hay trải nghiệm người dùng.
- Hoàn toàn tương thích và an toàn với các quy định bảo vệ dữ liệu cá nhân.
