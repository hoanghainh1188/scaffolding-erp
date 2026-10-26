# Tasks: setup-project

## 1. Khởi tạo dự án

- [x] 1.1 Tạo dự án Next.js (App Router, TypeScript, `src/`, npm) ngay tại thư mục repo, không ghi đè `docs/`, `openspec/`, `CLAUDE.md`, `README.md`; ghim phiên bản chính xác, thêm `.nvmrc` = `24` — kiểm tra: `npm run dev` mở được `http://localhost:3000`
- [x] 1.2 Bật `strict` + `noUncheckedIndexedAccess` trong `tsconfig.json`, thêm script `typecheck` — kiểm tra: `npm run typecheck` không lỗi
- [x] 1.3 Cấu hình ESLint (flat config của Next.js) + Prettier (`prettier-plugin-tailwindcss`), script `lint`, `format` — kiểm tra: `npm run lint` không lỗi
- [x] 1.4 Thêm header bảo mật trong `next.config.ts` theo design D16 — kiểm tra: `curl -I localhost:3000` thấy đủ 4 header
- [x] 1.5 Cập nhật mục **Stack** trong `CLAUDE.md` (Drizzle, Better Auth cho change 2, Vitest + Playwright, Docker Compose) và bỏ dòng "Chưa chốt" — kiểm tra: đọc lại `CLAUDE.md` khớp design

## 2. Bộ test

- [x] 2.1 Cài Vitest với 3 project `unit` (node), `component` (jsdom + Testing Library), `integration` (node, cần `TEST_DATABASE_URL`, tự bỏ qua có thông báo khi thiếu ở local); script `test`, `test:unit`, `test:int`, `test:coverage` với ngưỡng 80% cho `src/domain/**`, `src/lib/**` — kiểm tra: một test mẫu mỗi project chạy xanh bằng `npm test`
- [ ] 2.2 Cài Playwright + `@axe-core/playwright`; `playwright.config.ts` dùng kênh `msedge` (đổi được bằng `PW_CHANNEL`, máy không có Edge thì dùng Chromium), 2 project Desktop 1280×720 và 1366×768 + 1 project Mobile 375×812 (Edge), project `firefox` và `webkit` chỉ chạy thẻ `@basic`, `next dev` ở local và `next build && next start` khi `CI=true`, script `test:e2e` — kiểm tra: test mẫu mở `/` chạy xanh trên cả 5 project

## 3. Cơ sở dữ liệu

- [x] 3.1 Thêm `docker-compose.yml` (`postgres:17-alpine`, volume có tên, cổng đổi được), `docker/postgres/init.sql` tạo DB `scaffolding_erp_test`, `.env.example` theo design D8; script `db:up`, `db:down` — kiểm tra: `npm run db:up` rồi `docker compose exec postgres psql -U erp -l` thấy 2 DB
- [x] 3.2 Cài `drizzle-orm`, `postgres`, `drizzle-kit`; tạo `drizzle.config.ts`, `src/db/client.ts` (đặt `timezone=UTC`), `src/db/schema/index.ts` rỗng, `src/db/migrate.ts`; script `db:generate`, `db:migrate`, `db:studio` — kiểm tra: `npm run db:migrate` chạy thành công trên DB rỗng và tạo bảng theo dõi migration
- [x] 3.3 Viết integration test `src/db/client.int.test.ts`: kết nối DB test, `select 1` trả 1 và `show timezone` trả `UTC` — kiểm tra: `npm run test:int` xanh
- [x] 3.4 Ghi hướng dẫn chạy DB local (db:up, db:migrate, test DB) vào `README.md` — kiểm tra: làm theo README trên máy sạch chạy được

## 4. Giá trị nghiệp vụ (hàm thuần + unit test viết trước)

- [ ] 4.1 `src/domain/money.ts`: kiểu `Money`, `toMoney`, `formatMoney`, `formatMoneyForInput`, `parseMoney`, `DomainValueError`; test đủ scenario của spec `domain-values` (số lẻ bị từ chối, 0, âm, "1.250.000 ₫", "12a00", dạng sửa "1250000") viết trước — kiểm tra: `npm run test:unit` xanh
- [ ] 4.2 `src/domain/quantity.ts`: kiểu `Quantity` `{ unit: 'PIECE' | 'KG', milli }`, `toQuantity`, `parseQuantity(input, unit)`, `formatQuantity`, `formatQuantityForInput`, `quantityFromDb`, `quantityToDb`, `addQuantity`, `subtractQuantity` (lỗi khi khác đơn vị); test viết trước: "12,5" cái bị từ chối, "1.234" cái bị từ chối, "250.5" kg, "1,2345" kg bị từ chối, 0 cái, 0,1 + 0,2 = 0,3 kg, 10 cái + 2,5 kg báo lỗi, giới hạn 99.999.999.999,999, hiển thị "1.234,5"/"80", dạng sửa "1234,5"/"0" đọc lại đúng; chuỗi kg chưa rõ "1.234" và "12.500" báo "Chưa rõ số này. Gõ 1234 hoặc 1,234", còn "250.5", "0.75", "1,234" đọc ra 250,5 / 0,75 / 1,234 kg — kiểm tra: unit test xanh
- [ ] 4.3 `src/domain/business-date.ts`: `toBusinessDate`, `formatBusinessDate`, `formatDateTime` theo Asia/Ho_Chi_Minh; test 2026-10-26T17:00:00Z → 27/10/2026 "27/10/2026 00:00" và 16:59:59Z → 26/10/2026 — kiểm tra: unit test xanh
- [ ] 4.4 `src/domain/condition.ts`, `role.ts`, `location-type.ts`: hằng số, nhãn tiếng Việt, `isSellableCondition`, `parseRole` (báo lỗi + liệt kê 5 vai trò), `defaultSurfaceForRole` — kiểm tra: unit test xanh cho từng scenario của spec
- [ ] 4.5 `src/domain/document-status.ts`: `STORED_DOCUMENT_STATUSES` (4 giá trị, không có `OVERDUE`), kiểu `DisplayDocumentStatus` (+ `OVERDUE`), nhãn tiếng Việt, `assertStorableStatus` ném "Quá hạn là trạng thái tính ra, không được lưu"; ghi chú trong code: hàm tính Quá hạn thuộc change `receivables` — kiểm tra: unit test xanh
- [ ] 4.6 `src/domain/condition-split.ts`: `computeConditionSplit(total, parts)` trả `allocated`, `remaining`, `status`; test các scenario khớp/thiếu/vượt/tổng 0/số lẻ kg/có phần Mất, mọi phần cùng đơn vị với tổng — kiểm tra: unit test xanh, coverage `src/domain` ≥ 80%

## 5. Cấu hình, người dùng giả lập và API

- [ ] 5.1 `src/lib/env.ts` (zod) + `src/instrumentation.ts`: kiểm tra `DATABASE_URL`, `DEV_ROLE`, `NODE_ENV`; lỗi chỉ in tên biến; unit test thiếu biến, URL sai định dạng (không in lại giá trị), vai trò "ADMIN" — kiểm tra: unit test xanh và `DATABASE_URL= npm run dev` dừng với thông báo đúng
- [ ] 5.2 `src/lib/current-user.ts`: trả người dùng giả lập theo `DEV_ROLE`, ném `ConfigError` khi `NODE_ENV=production`; unit test cả hai trường hợp — kiểm tra: unit test xanh
- [ ] 5.3 `src/lib/navigation.ts`: cấu hình 9 mục menu theo bảng D3 + `navItemsForRole`; unit test DIRECTOR 9 mục, SALES 6 mục, ACCOUNTANT có Công nợ không có Báo cáo/Cài đặt, WAREHOUSE rỗng — kiểm tra: unit test xanh
- [ ] 5.4 `src/lib/api-response.ts` (`ok`, `fail`) + `GET /api/health` (giới hạn 3 giây, log lỗi phía server); integration test DB ổn → 200 và DB sai địa chỉ → 503 không lộ `DATABASE_URL`/lỗi driver; test chậm quá 3 giây dùng hàm truy vấn giả — kiểm tra: `npm run test:int` xanh, `curl localhost:3000/api/health` trả 200

- [ ] 5.5 `src/lib/print.ts` `printDocument({ title? })` theo design D18 + quy tắc ESLint chặn `window.print` ngoài file này; unit test (jsdom) gọi `window.print` đúng một lần, đổi và trả lại `document.title` sau `afterprint` — kiểm tra: unit test xanh, `npm run lint` báo lỗi khi thử gọi `window.print()` trong một component

## 6. Giao diện nền và component

- [ ] 6.1 `scripts/build-tokens.ts` + script `npm run tokens`: đọc `docs/design-system/tokens.json`, sinh `src/styles/tokens.css` (màu chế độ Sáng theo tên shadcn + `highlight`, `pop`, `success`, `warning`; giải tham chiếu `{primary}`; bo góc, khoảng cách, bóng, kiểu chữ; khối `@theme inline`); unit test chống lệch so file sinh với file đã commit — kiểm tra: `npm run tokens` rồi `git diff` sạch, sửa tay `tokens.css` thì test đỏ
- [ ] 6.2 Khởi tạo shadcn/ui (Tailwind v4, `new-york`, `lucide-react`), thêm các component ở design D12, `globals.css` import `tokens.css`; font Bricolage Grotesque (`display`, 700) + Be Vietnam Pro (`body`, 400/500/600) qua `next/font`, subset `vietnamese`; quy tắc ESLint chặn màu Tailwind cứng và mã hex trong `src/` (trừ file sinh) — kiểm tra: `npm run build` thành công, nút `Button` mặc định có màu `#1D5BFF`, tiêu đề mẫu đủ dấu tiếng Việt hiển thị đúng, `npm run lint` báo lỗi khi thử thêm `bg-blue-600`
- [ ] 6.3 `ConditionBadge`, `DocumentStatusBadge` (nhận `DisplayDocumentStatus`), `LocationBadge` lấy nhãn từ `src/domain/*`, kiểu badge theo bảng D12 (`highlight`/`muted`/`primary`/`destructive` nền đặc; `success`/`warning` viền + chữ); component test nhãn và token đúng cho mọi giá trị — kiểm tra: `npm test` xanh
- [ ] 6.4 Ô nhập số dùng chung (dạng hiển thị khi blur, dạng sửa khi focus, `inputMode` theo đơn vị) + `Stepper` nhận `Quantity`: nút 48×48px, min/max/step, gõ trực tiếp, kiểm tra theo đơn vị khi rời ô; component test các scenario (tăng, chặn ở 0, chặn ở max, gõ 150 → 100, gõ "abc" → giá trị cũ, "12,5" cái → 12 kèm lời nhắc, "250,5" kg nhận, focus hiện "1500" / blur hiện "1.500") — kiểm tra: `npm test` xanh
- [ ] 6.5 `DataTable` (TanStack Table + shadcn table): khung cuộn ngang riêng, cột đầu dính trái (ô góc dính cả hai chiều), `meta.hideBelow` `'md' | 'lg' | 'xl'` ẩn bằng CSS, tiêu đề dính, sắp xếp 3 trạng thái, phân trang 20 dòng "1–20 / 45", cột số căn phải, sắp xếp bằng Enter, prop bắt buộc `emptyState` (câu mời + nút tùy chọn, căn giữa, ẩn phân trang); component test các scenario gồm cột "Ghi chú" `hideBelow: 'xl'` có lớp ẩn đúng, "Chưa có đơn thu mua nào" + "Tạo đơn", bấm nút gọi hành động, trạng thái rỗng không có nút — kiểm tra: `npm test` xanh, `npm run typecheck` báo lỗi khi bỏ `emptyState`
- [ ] 6.6 `ConditionSplit` dùng `computeConditionSplit` và ô nhập số dùng chung, tùy chọn `withLost`, thông báo "Còn 5 chưa phân loại" / "Vượt 5 so với tổng", ô gõ "79,5" cái báo lỗi và không tính vào tổng; component test — kiểm tra: `npm test` xanh
- [ ] 6.7 Trang `/dev/components` trưng bày mọi trạng thái component (gồm badge 4 tình trạng + 5 trạng thái chứng từ, bảng rỗng, tiêu đề mẫu đủ dấu bằng họ chữ `display`), `notFound()` khi production — kiểm tra: mở trang ở dev thấy đủ component; `next build && next start` thì trang trả 404

## 7. Layout Desktop

- [ ] 7.1 `(desktop)/layout.tsx` + `AppSidebar` (block sidebar của shadcn, nền `card` viền `border`, mục đang chọn nền `accent` + `aria-current="page"`, theo cỡ màn hình: `< lg` ngăn trượt, `lg`–`< xl` chỉ biểu tượng có tooltip, `≥ xl` mở rộng; cookie chỉ ghi khi người dùng bấm và thắng mặc định từ `lg`; mặc định render bằng CSS để không nháy) dùng `navItemsForRole(getCurrentUser().role)`; vai trò Mobile → `redirect('/m')` — kiểm tra: đổi `DEV_ROLE` thấy menu đổi đúng bảng D3; kéo cửa sổ qua 900/1100/1366px thấy sidebar đổi đúng 3 dạng khi chưa bấm
- [ ] 7.2 `TopHeader`: ô tìm kiếm, nút tạo nhanh, thông báo (chỉ hiển thị), khu người dùng hiện tên + vai trò tiếng Việt; nút mở sidebar ở màn hẹp; dưới `md` ô tìm kiếm thành nút biểu tượng `aria-label="Tìm kiếm"` và nút tạo nhanh thu thành "+"; `min-w-0` + `truncate` chống tràn — kiểm tra: ở 768px bấm nút menu thấy sidebar trượt ra, Esc đóng; ở 375px header không tràn
- [ ] 7.3 `src/app/page.tsx` chuyển tới `/dashboard`; 9 trang giữ chỗ (tiêu đề đúng tên mục bằng họ chữ `display` + "Đang xây dựng") dùng chung một component — kiểm tra: bấm từng mục menu không có trang 404

## 8. Layout Mobile và PWA

- [ ] 8.1 `(mobile)/m/layout.tsx` (không kiểm tra vai trò — mọi vai trò vào được) + `BottomNav` (4 tab, vùng bấm ≥ 48px, tab đang chọn nền `accent` bo `radius-pill`) + `AppBar` (`title` họ chữ `display`, `backHref?`) + 4 trang giữ chỗ; khung và BottomNav `max-w-[640px]` căn giữa; `viewport-fit=cover`, `safe-area-inset-*` cho AppBar/BottomNav, `min-h-dvh` — kiểm tra: ở 375px chuyển qua lại 4 tab đúng đường dẫn; ở 1366px khung rộng 640px căn giữa; DevTools giả lập iPhone thấy tab nằm trên vùng an toàn; `DEV_ROLE=DIRECTOR` mở `/m/history` không bị chuyển đi
- [ ] 8.2 `useOnlineStatus` + `OfflineBanner` ("Mất kết nối", `role="status"`); component test giả lập sự kiện `offline`/`online` — kiểm tra: `npm test` xanh
- [ ] 8.3 `src/app/manifest.ts` + biểu tượng tạm 192/512 trong `public/icons/`, `theme_color`/`background_color` đọc từ `tokens.json` — kiểm tra: `curl localhost:3000/manifest.webmanifest` có `start_url: "/m"`, `display: "standalone"`, `theme_color: "#1D5BFF"`, 2 biểu tượng; Chrome DevTools → Application báo cài được
- [ ] 8.4 Hook `useKeepFocusedInputVisible()` gắn ở `MobileShell` theo design D14 (`focusin` + `visualViewport.resize` → `scrollIntoView({ block: 'center' })`, tôn trọng `prefers-reduced-motion`); component test giả `visualViewport` co lại khi một ô đang focus nằm dưới mép → `scrollIntoView` được gọi, ô nằm trong vùng nhìn thấy → không gọi — kiểm tra: `npm test` xanh

## 9. Kiểm tra E2E, giao diện và a11y

- [ ] 9.1 E2E `tests/e2e/desktop-shell.spec.ts`: `/` → `/dashboard`, mục đang chọn khi ở `/inventory`, thu gọn sidebar rồi tải lại vẫn thu gọn, ngăn trượt ở 768px, trang giữ chỗ "Báo cáo", header 375px có nút "Tìm kiếm" thay ô nhập — kiểm tra: `npm run test:e2e` xanh
- [ ] 9.2 E2E `tests/e2e/mobile-shell.spec.ts`: 4 tab, vai trò `DIRECTOR` mở `/m/history` vẫn ở khu Mobile, nút quay lại của app bar, thanh "Mất kết nối" khi `context.setOffline(true)` và biến mất khi `false`, manifest — kiểm tra: `npm run test:e2e` xanh
- [ ] 9.3 Quét axe `/dashboard`, `/m`, `/dev/components` không có lỗi `serious`/`critical` (gồm tương phản badge 4.5:1) — kiểm tra: `npm run test:e2e` xanh ở local
- [ ] 9.4 `tests/e2e/visual.spec.ts` gắn thẻ `@visual`: ảnh `/dashboard`, `/m`, `/dev/components` ở 360, 375, 768, 1024, 1280, 1366px; `snapshotPathTemplate` không chứa tên hệ điều hành; `test:e2e` local dùng `--grep-invert @visual` — kiểm tra: `npm run test:e2e` ở local không chạy và không tạo ảnh nào
- [ ] 9.5 `tests/e2e/responsive.spec.ts`: `/dashboard`, `/inventory`, `/m`, `/m/history`, `/dev/components` ở 360, 375, 768, 1024, 1280, 1366px có `document.documentElement.scrollWidth <= window.innerWidth`; sidebar khi chưa bấm là ngăn trượt / chỉ biểu tượng / mở rộng ở 900 / 1100 / 1366px; bấm mở rộng ở 1100px rồi tải lại vẫn mở rộng; `/m` ở 1366px rộng 640px căn giữa; bảng 10 cột ở `/dev/components` cuộn trong khung với cột đầu đứng yên — kiểm tra: `npm run test:e2e` xanh
- [ ] 9.6 `tests/e2e/basic-browsers.spec.ts` thẻ `@basic` chạy trên Firefox và WebKit: mở `/dashboard` và `/m` không lỗi console, không cuộn ngang, bấm được một mục menu và một tab — kiểm tra: `npm run test:e2e` xanh trên project `firefox` và `webkit`

## 10. CI và tài liệu lệnh

- [ ] 10.1 `.github/workflows/ci.yml` theo design D16 (trigger `push`, `pull_request`, `workflow_dispatch`; service Postgres; cài trình duyệt bằng `npx playwright install --with-deps msedge firefox webkit`; lint, typecheck, migrate, test gồm chống lệch token, build, Playwright gồm `@visual`, tải ảnh khác biệt lên artifact khi lỗi) — kiểm tra: chạy thử trên nhánh, mọi bước xanh trừ `@visual` khi chưa có ảnh mốc
- [ ] 10.2 `.github/workflows/update-snapshots.yml` (`workflow_dispatch`, quyền `contents: write` + `actions: write`): chạy `@visual` với `--update-snapshots`, commit ảnh vào nhánh được chọn, rồi `gh workflow run ci.yml --ref <nhánh>`; chạy một lần để tạo ảnh mốc đầu tiên — kiểm tra: commit ảnh xuất hiện trên nhánh **và** tab Actions có một lần chạy `ci.yml` mới (sự kiện `workflow_dispatch`) trên đúng commit ảnh đó, tự bắt đầu không cần push thêm, xanh hoàn toàn và hiện trong mục check của PR
- [ ] 10.3 Cập nhật mục **Lệnh thường dùng** trong `CLAUDE.md` và phần chạy local trong `README.md` theo bảng D17 (gồm `npm run tokens` và cách cập nhật ảnh mốc bằng workflow chạy tay) — kiểm tra: mọi lệnh ghi trong tài liệu chạy được đúng như mô tả

## 11. Kiểm tra thủ công

- [ ] 11.1 Từ máy sạch: `npm ci` → `npm run db:up` → `npm run db:migrate` → `npm run dev`; đi qua Desktop với 3 vai trò `DIRECTOR`, `ACCOUNTANT`, `SALES` và Mobile với `WAREHOUSE` (Desktop tự chuyển sang `/m`) và `DIRECTOR` (mở `/m` bình thường); tắt mạng trên Mobile thấy thanh báo; trên máy **Windows 10/11 + Edge** mở Desktop ở 1280 và 1366px xem chữ tiếng Việt hai font hiển thị đúng, không cuộn ngang, và bản xem trước khi in (Ctrl+P) không có sidebar/header; trên **Chrome macOS** đi qua Desktop; trên **Safari iPhone** (có thanh vuốt) mở `/m`: tab không bị thanh vuốt đè, chạm ô số lượng ở `/dev/components` thì bàn phím không che ô; trên **Chrome Android** 360px không cuộn ngang — kiểm tra: ghi kết quả vào mô tả PR
- [ ] 11.2 Chạy `openspec validate setup-project --strict` — kiểm tra: không lỗi

## Workflow follow-up

- Sau khi review xong và merge: `/opsx:archive` để gộp 4 spec vào `openspec/specs/`.
- Change tiếp theo: `/opsx:propose auth-and-roles` (thay người dùng giả lập bằng Better Auth, thêm CSP có nonce).
