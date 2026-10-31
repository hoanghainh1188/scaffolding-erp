# Design: security-headers

## Context

Xem `proposal.md` - Why.
Hệ thống hiện tại cấu hình 4 header bảo mật tĩnh trong `next.config.ts`. Next.js 16 hỗ trợ `src/proxy.ts` để can thiệp vào request/response pipeline trước khi render.

## Goals / Non-Goals

**Goals:**
- Thiết lập Content-Security-Policy (CSP) với cơ chế nonce ngẫu nhiên sinh động tại `src/proxy.ts`.
- Tự động gắn nonce vào toàn bộ framework script, component bundle của Next.js / React.
- Giữ vững tính tương thích của Tailwind CSS 4, shadcn/ui, Better Auth, PWA và tính năng in ấn.

**Non-Goals:**
- Tích hợp dịch vụ giám sát vi phạm CSP bên thứ ba (như Sentry CSP reporting hay Report-URI) trong giai đoạn MVP.
- Bật CSP cho các file tĩnh (`/_next/static/*`, ảnh tĩnh, favicon).

## Decisions

### 1. Cấu hình Directives CSP (Q1)
- `default-src 'self'`: Giới hạn mọi tài nguyên mặc định chỉ tải từ cùng origin.
- `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`:
  - `strict-dynamic` cho phép script gốc có nonce tải tiếp các script phụ thuộc hợp lệ của Next.js.
  - `'unsafe-eval'` chỉ bật khi `process.env.NODE_ENV === "development"` để React hiển thị stack trace lỗi; môi trường production tuyệt đối không bật.
- `style-src 'self' 'unsafe-inline'`: Tailwind CSS 4 và shadcn/ui (Radix UI) sử dụng các style inline động cho vị trí popover, tooltip, sheet và CSS variables. Dùng `'unsafe-inline'` cho style là phương án chuẩn, an toàn vì XSS chủ yếu khai thác qua script execution.
- `img-src 'self' blob: data:`: Cho phép hiển thị ảnh SVG data URI và ảnh chụp kiểm tra / quét QR từ blob URL.
- `font-src 'self'`: Tải font nội bộ từ app.
- `connect-src 'self'`: Cho phép gọi API routes và kết nối WebSocket nội bộ (HMR khi dev).
- `object-src 'none'`: Cấm hoàn toàn Flash/Java applet/plugin.
- `base-uri 'self'`: Chống tấn công giả mạo `<base href>`.
- `form-action 'self'`: Đảm bảo form chỉ gửi dữ liệu về cùng origin.
- `frame-ancestors 'none'`: Chống clickjacking (đồng bộ với `X-Frame-Options: DENY`).
- `upgrade-insecure-requests`: Tự động nâng cấp kết nối HTTP lên HTTPS ở production.

### 2. Nơi sinh Nonce & Cơ chế truyền (Q2)
- **Nơi sinh**: Sinh trực tiếp trong `src/proxy.ts` cho mỗi request bằng `Buffer.from(crypto.randomUUID()).toString("base64")`.
- **Cách truyền**: Gán vào request header `x-nonce` và response header `Content-Security-Policy`.
- **Next.js 16 Integration**: Next.js 16 tự động đọc CSP header từ request và tự chèn thuộc tính `nonce` vào tất cả các thẻ `<script>` do framework render (React bootstrap, chunk scripts).

### 3. Tương thích Next.js 16 Cache Components & Render Pipeline (Q3)
- Tất cả màn hình của Scaffolding ERP đều yêu cầu xác thực phiên đăng nhập (D7), do đó đã được render động theo request (dynamic rendering).
- Việc sinh nonce theo từng request trong `src/proxy.ts` hoàn toàn phù hợp với luồng render hiện có.
- Cấu hình matcher trong `src/proxy.ts` loại trừ các prefetch không cần thiết và tài nguyên tĩnh để tối ưu hiệu năng.

### 4. Tương thích Tailwind 4 và shadcn/ui (Q4)
- Cho phép `'unsafe-inline'` trong `style-src` để không làm gián đoạn các hiệu ứng động của Radix UI/shadcn và biến màu của Tailwind 4.

### 5. Tương thích PWA & Service Worker (Q5)
- File manifest (`/manifest.webmanifest`) và icons không bị ảnh hưởng do nằm trong định dạng JSON/static assets.
- Service worker được đăng ký bởi script chính có nonce hợp lệ.

### 6. Tương thích In ấn (Q6)
- Tính năng in ấn qua `src/lib/print.ts` sử dụng hàm `printDocument()` điều khiển trực tiếp qua trình duyệt, không chèn iframe lạ hay tải script ngoài.

### 7. Báo cáo vi phạm (Q7)
- Bật trực tiếp chế độ enforce `Content-Security-Policy` (không cần qua Report-Only) vì hệ thống là monolith khép kín, đã kiểm thử toàn bộ các đường dẫn nội bộ.

## Risks / Trade-offs

- [Nguy cơ script bên thứ ba bị chặn] $\rightarrow$ Hệ thống ERP nội bộ không sử dụng script quảng cáo hay phân tích bên ngoài; chỉ dùng script nội bộ của Next.js.
- [Dev vs Production chênh lệch eval] $\rightarrow$ Kiểm thử E2E sẽ chạy trên bản build production (`K2`) để đảm bảo không có mã eval lọt vào production.
