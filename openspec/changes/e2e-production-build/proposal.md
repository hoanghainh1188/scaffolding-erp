# Proposal: e2e-production-build

Giai đoạn: [MVP]
Màn hình liên quan: Không có màn hình mới (ảnh hưởng tới toàn bộ test suite E2E và CI workflow).

## Why

Hiện tại bộ kiểm thử Playwright E2E đang chạy trên máy chủ phát triển `next dev`. Môi trường dev có hành vi khác với production (không tối ưu hóa bundle tĩnh, không áp dụng SSR build tĩnh, xử lý header và cache khác biệt), khiến một số lỗi chỉ xuất hiện ở bản production có thể bị lọt qua. Cần chuyển Playwright trên CI sang chạy trên bản production build (`next build && next start`) trước khi bàn giao hệ thống.

## What Changes

- Cấu hình Playwright `webServer` trong `playwright.config.ts` để chạy `npm start` khi ở môi trường CI (`CI=true`) hoặc khi có cờ `PW_PRODUCTION=1`; ở môi trường local mặc định vẫn dùng `next dev` để giữ tốc độ phản hồi nhanh.
- Thêm script `test:e2e:prod` trong `package.json` (`next build && PW_PRODUCTION=1 playwright test`) để lập trình viên có thể kiểm thử bản production ngay tại máy local.
- Cập nhật workflow CI `.github/workflows/ci.yml` và `.github/workflows/update-snapshots.yml`: thêm bước `npm run build` trước khi thực thi Playwright test và cache thư mục `.next/cache` để tối ưu thời gian chạy.
- Cho phép các trang trưng bày dev-only (`/dev/components` và `/m/dev/detail`) hiển thị khi `process.env.E2E === "1"`, và chỉ trả về 404 khi chạy production thực tế (`E2E !== "1"`).
- Cập nhật tài liệu `CLAUDE.md` và `README.md` về quy trình kiểm thử E2E trên bản production build.

### Ngoài phạm vi

- Không thay đổi các kịch bản kiểm thử E2E hiện có (chỉ chuyển đổi môi trường máy chủ chạy test).
- Không thay đổi cấu hình kiểm thử unit / integration trong Vitest.

## Capabilities

### Modified Capabilities

- `system-health`: Bổ sung yêu cầu về việc hệ thống phải biên dịch và phục vụ thành công các phản hồi trên bản build production (`next build && next start`).

## Impact

- **Mã nguồn ảnh hưởng**: `playwright.config.ts`, `package.json`, `.github/workflows/ci.yml`, `.github/workflows/update-snapshots.yml`, `src/app/dev/components/page.tsx`, `src/app/(mobile)/m/dev/detail/page.tsx`, `CLAUDE.md`, `README.md`.
- **CI Pipeline**: Cần thêm bước build production cho các job E2E trên CI.
