# Design: e2e-production-build

## Context

Xem `proposal.md` - Why.
Playwright hiện tại khởi chạy `npm run dev` thông qua cấu hình `webServer` trong `playwright.config.ts`. Điều này giúp phát triển cục bộ nhanh nhưng có thể bỏ qua các lỗi liên quan đến prerendering tĩnh, Server Component bundle, hoặc proxy header ở môi trường production.

## Goals / Non-Goals

**Goals:**
- Tự động chạy E2E trên bản production build (`npm run build && npm start`) ở môi trường CI (`CI=true`).
- Cung cấp lệnh `npm run test:e2e:prod` để chạy thử cục bộ trên bản build production.
- Giữ trải nghiệm dev nhanh cho `npm run test:e2e` ở máy local (vẫn dùng `next dev` khi không có cờ production).
- Giữ các trang dev showcase (`/dev/components`, `/m/dev/detail`) hoạt động trong môi trường kiểm thử E2E (`E2E=1`) và trả về 404 trên production thực tế.

**Non-Goals:**
- Thay đổi logic nghiệp vụ của các bài test E2E.
- Thay đổi cấu hình Vitest.

## Decisions

### 1. Phân biệt môi trường Local vs CI (Q1)
- Biến cờ `isProd = Boolean(process.env.CI) || process.env.PW_PRODUCTION === "1"`.
- Trong `playwright.config.ts`:
  - Khi `isProd === true`: `webServer.command = "npm start -- -p " + port`.
  - Khi `isProd === false`: `webServer.command = "npm run dev -- -p " + port`.
- Thêm script `npm run test:e2e:prod` trong `package.json` với nội dung `next build && PW_PRODUCTION=1 playwright test`.

### 2. Quản lý ảnh mốc Visual Snapshots (Q2)
- Visual snapshots trên CI tiếp tục chạy trên Edge (Linux) nhưng chuyển sang phục vụ từ bản production build (`next start`).
- Điều này đảm bảo ảnh mốc phản ánh chính xác 100% giao diện thực tế khi người dùng truy cập bản release.
- Nếu có sự khác biệt nhỏ về pixel giữa `next dev` và `next build`, workflow `update-snapshots.yml` sẽ cập nhật ảnh mốc mới.

### 3. Biến môi trường cho Production Build khi chạy E2E (Q3)
- `E2E=1`: Ẩn dev indicator của Next.js và cho phép render các trang mẫu phục vụ test.
- `BETTER_AUTH_URL`: Trỏ tới URL máy chủ test (`http://localhost:${port}`).
- `AUTH_SIGN_IN_LIMIT_PER_MINUTE=1000`: Nâng ngưỡng rate limit đăng nhập từ localhost để tránh bị throttle khi nhiều worker cùng đăng nhập tài khoản test.

### 4. Xử lý các trang Dev Showcase (Q4)
- Trang `/dev/components` và `/m/dev/detail` cập nhật điều kiện:
  ```typescript
  if (process.env.NODE_ENV === "production" && process.env.E2E !== "1") {
    notFound();
  }
  ```
- Khi chạy build thật đưa lên server (không có `E2E=1`), hai trang này luôn trả về 404 Not Found, đảm bảo an toàn.

### 5. Tối ưu thời gian CI & Cache (Q5)
- Trong các job E2E trên `.github/workflows/ci.yml` và `update-snapshots.yml`:
  - Thêm bước `npm run build` trước lệnh chạy Playwright.
  - Sử dụng GitHub Actions cache cho `.next/cache` để các lần chạy sau chỉ mất khoảng 10-15 giây để build.
  - Playwright `webServer` chỉ việc chạy `npm start` ngay lập tức mà không phải chờ compile từng trang lần đầu như `next dev`.

## Risks / Trade-offs

- [Tăng thời gian chạy CI do thêm bước build] $\rightarrow$ Bù lại bằng việc `next start` tải trang nhanh hơn nhiều so với `next dev` (vốn phải compile JIT từng route trong mỗi worker), tổng thời gian thực thi E2E có thể tương đương hoặc nhanh hơn.
- [Trang showcase có nguy cơ lộ] $\rightarrow$ Đã giới hạn chặt chẽ chỉ mở khi có cờ `E2E=1`.
