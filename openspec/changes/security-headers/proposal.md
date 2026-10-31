# Proposal: security-headers

Giai đoạn: [MVP]
Màn hình liên quan: Không có màn hình mới (áp dụng cho toàn bộ Desktop D1–D18 và Mobile M1–M8).

## Why

Ứng dụng hiện mới chỉ cấu hình 4 header bảo mật tĩnh trong `next.config.ts` (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), nhưng chưa có `Content-Security-Policy` (CSP). Thiếu CSP khiến ứng dụng có nguy cơ bị tấn công XSS (Cross-Site Scripting) và bị chèn mã script độc hại từ bên thứ ba. Cần thiết lập CSP theo nonce (mỗi request HTTP sinh một mã ngẫu nhiên duy nhất) ngay trước khi đưa hệ thống lên production.

## What Changes

- Thêm Content-Security-Policy (CSP) theo nonce được sinh động tại `src/proxy.ts` cho mọi request trang HTML (Desktop và Mobile).
- Mỗi request sinh một nonce ngẫu nhiên (cryptographically secure), chuyển qua header `x-nonce` và đưa vào directive `script-src 'nonce-{nonce}' 'strict-dynamic'` (có `'unsafe-eval'` ở môi trường dev để hỗ trợ debug React).
- Giữ nguyên 4 header bảo mật tĩnh hiện có trong `next.config.ts`.
- Đảm bảo tương thích hoàn toàn với:
  - Next.js 16 (Cache Components, Dynamic rendering khi có request header).
  - CSS của Tailwind CSS 4 và component của shadcn/ui.
  - PWA manifest, service worker và bộ nhớ đệm offline.
  - Tính năng in ấn chứng từ (`printDocument()` / `window.print()`).

### Ngoài phạm vi

- Không thay đổi logic phân quyền hay session của Better Auth.
- Không thêm dịch vụ báo cáo CSP bên ngoài (report URI bên thứ ba) trong MVP; chỉ log vi phạm nếu cần.
- Không cấu hình CSP cho các file tĩnh nội bộ (`/_next/static`, hình ảnh tĩnh, `favicon.ico`) để tránh làm chậm tải tài nguyên tĩnh.

## Capabilities

### New Capabilities

- `security-headers`: Quy định các chỉ thị bảo mật Content-Security-Policy và nonce áp dụng cho các trang web của hệ thống.

### Modified Capabilities

(Không có thay đổi yêu cầu đối với các capability hiện có).

## Impact

- **Mã nguồn ảnh hưởng**: `src/proxy.ts`, `next.config.ts`, `src/app/layout.tsx`.
- **Hiệu năng & Caching**: Các trang HTML sẽ render theo request để nhận nonce tương ứng.
- **Kiểm thử**: Bổ sung kiểm thử proxy/header, kiểm thử E2E xác nhận script không có nonce bị trình duyệt chặn, và 4 header cũ vẫn tồn tại.
