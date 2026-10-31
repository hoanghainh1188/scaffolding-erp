# Tasks: security-headers

## 1. Cấu hình Content-Security-Policy và sinh Nonce

- [x] 1.1 Viết hàm tiện ích sinh nonce ngẫu nhiên và build chuỗi CSP header trong `src/lib/security/csp.ts`. Kiểm: Unit test kiểm tra đầy đủ các directive, môi trường dev có `'unsafe-eval'`, môi trường prod không có, nonce được định dạng base64 hợp lệ.
- [x] 1.2 Tích hợp sinh nonce và gán CSP header vào `src/proxy.ts` cho các request HTML; cấu hình matcher bỏ qua tài nguyên tĩnh (`_next/static`, icons, favicon) và các request prefetch không cần CSP. Kiểm: Unit test proxy (`src/proxy.test.ts`) xác nhận mọi trang trả về header `Content-Security-Policy` có `nonce-` và header `x-nonce`.
- [x] 1.3 Kiểm tra 4 header tĩnh trong `next.config.ts`: đảm bảo `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, và `Permissions-Policy` vẫn tồn tại đầy đủ trên mọi phản hồi HTTP. Kiểm: Integration test route headers.

## 2. Kiểm thử tự động và Tương thích

- [x] 2.1 Viết integration test (`tests/integration/security-headers.int.test.ts`): gọi hai request liên tiếp xác nhận nonce luôn thay đổi; kiểm tra các trang chính (`/login`, `/dashboard`, `/m`, `/manifest.webmanifest`) trả về đúng header.
- [x] 2.2 Viết E2E test Playwright (`tests/e2e/security-headers.spec.ts`): kiểm tra trang tải bình thường không có lỗi CSP vi phạm trong console; chèn thử script không có nonce vào DOM và xác nhận trình duyệt chặn thực thi.
- [x] 2.3 Kiểm tra tương thích PWA: manifest `/manifest.webmanifest` tải thành công và app mobile chạy bình thường.

## 3. Kiểm tra chất lượng và Hoàn tất

- [x] 3.1 Chạy toàn bộ bộ kiểm tra máy: `npm run lint && npm run typecheck && npm test && npm run test:e2e` xanh; `npx openspec validate security-headers --strict` xanh.
- [ ] 3.2 Kiểm tra tay trên Edge, Chrome: mở các màn chính Desktop và Mobile, kiểm tra console sạch không có vi phạm CSP; đăng nhập, đăng xuất và in ấn (`printDocument()`) hoạt động trơn tru.

## Workflow follow-up

- Review proposal trên PR, comment "Duyệt", rồi chạy `/opsx:apply security-headers`.
- Sau khi merge PR apply: chạy `/opsx:archive security-headers` → merge → đóng issue #23.
