# Tasks: e2e-production-build

## 1. Cấu hình máy chủ kiểm thử E2E và Showcase

- [ ] 1.1 Cập nhật `src/app/dev/components/page.tsx` và `src/app/(mobile)/m/dev/detail/page.tsx`: cho phép hiển thị khi `process.env.E2E === "1"` ở môi trường production. Kiểm: kiểm tra điều kiện trả về `notFound()` khi `NODE_ENV === "production"` và `E2E !== "1"`.
- [ ] 1.2 Cập nhật `playwright.config.ts`: khi `CI=true` hoặc `PW_PRODUCTION=1`, `webServer.command` chuyển sang `npm start -- -p ${port}`. Thêm script `test:e2e:prod` vào `package.json`. Kiểm: chạy thử cục bộ `npm run test:e2e:prod` thành công.

## 2. Tối ưu hóa GitHub Actions CI Workflows

- [ ] 2.1 Cập nhật `.github/workflows/ci.yml`: thêm bước `npm run build` trước khi thực thi Playwright test trong các job `e2e`, `visual`, `e2e-basic` và tích hợp cache `.next/cache`. Kiểm: cú pháp workflow hợp lệ.
- [ ] 2.2 Cập nhật `.github/workflows/update-snapshots.yml`: thêm bước `npm run build` trước khi chụp ảnh mốc. Kiểm: cú pháp workflow hợp lệ.

## 3. Cập nhật tài liệu và Xác thực

- [ ] 3.1 Cập nhật `CLAUDE.md` và `README.md`: giải thích rõ cơ chế E2E chạy trên production build ở CI và bổ sung lệnh `npm run test:e2e:prod`. Kiểm: `npm run format:check` xanh.
- [ ] 3.2 Kiểm tra toàn bộ hệ thống: `npm run lint && npm run typecheck && npm test && npx openspec validate e2e-production-build --strict` xanh.

## Workflow follow-up

- Review proposal trên PR, comment "Duyệt", rồi chạy `/opsx:apply e2e-production-build`.
- Sau khi merge PR apply: chạy `npx openspec archive e2e-production-build -y` → PR → merge → đóng issue #24.
