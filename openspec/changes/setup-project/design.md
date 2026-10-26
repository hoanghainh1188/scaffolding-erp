# Design: setup-project

## Context

- Repo chưa có code; chỉ có `docs/`, `CLAUDE.md`, `openspec/`. Lý do làm: xem `proposal.md` → Why.
- Máy dev: Node 24, npm 11, Docker 29. Chưa cài `psql` → mọi thao tác DB đi qua Docker hoặc script Node.
- Lựa chọn đã được người dùng chốt (26/10/2026): **Drizzle**, **Better Auth** (cài ở change 2), **Vitest + Playwright**, **Docker Compose** cho PostgreSQL.
- Yêu cầu hành vi: xem `specs/app-shell`, `specs/ui-components`, `specs/domain-values`, `specs/system-health`.

## Goals / Non-Goals

**Goals:**
- Khung thư mục và quy ước mà 12 change MVP còn lại dùng thẳng, không phải sửa lại.
- Logic giá trị nghiệp vụ (tiền, số lượng, ngày) là hàm thuần, test được không cần DB hay trình duyệt.
- Một lệnh chạy được toàn bộ kiểm tra: `npm run lint && npm run typecheck && npm test`.

**Non-Goals:**
- Không tạo bảng nghiệp vụ, không tạo bảng của Better Auth.
- Không có CSP đầy đủ (cần nonce qua middleware) — làm cùng `auth-and-roles`, khi đã có middleware.
- Không tối ưu bundle/hiệu năng ngoài mặc định của Next.js.

## Decisions

### D1. Next.js App Router, một ứng dụng duy nhất

- Next.js bản ổn định mới nhất (16.x) + React 19, TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. Ghim **phiên bản chính xác** trong `package.json`.
- Quản lý gói: **npm** (khớp lệnh trong `CLAUDE.md`). Lưu `package-lock.json`, file `.nvmrc` = `24`.
- *Đã cân nhắc:* tách API riêng (NestJS/Express) → bỏ, vì quy mô nhỏ và `CLAUDE.md` đã chốt Next.js làm cả API.

### D2. Cấu trúc thư mục

```text
src/
├── app/
│   ├── layout.tsx               # font, globals.css, metadata
│   ├── page.tsx                 # redirect('/dashboard')
│   ├── manifest.ts              # PWA manifest
│   ├── (desktop)/
│   │   ├── layout.tsx           # DesktopShell; vai trò Mobile → redirect('/m')
│   │   ├── dashboard/page.tsx   # D1 (giữ chỗ)
│   │   ├── purchasing/ inventory/ repairs/ sales/
│   │   ├── receivables/ reports/ catalog/ settings/
│   ├── (mobile)/m/
│   │   ├── layout.tsx           # MobileShell
│   │   ├── page.tsx             # Việc hôm nay (M1, giữ chỗ)
│   │   ├── scan/ history/ profile/
│   ├── dev/components/page.tsx  # trang trưng bày component, notFound() ở production
│   └── api/health/route.ts
├── components/
│   ├── ui/                      # file sinh bởi shadcn/ui (không sửa tay nhiều)
│   ├── shell/desktop/           # DesktopShell, AppSidebar, TopHeader
│   ├── shell/mobile/            # MobileShell, BottomNav, AppBar, OfflineBanner
│   └── domain/                  # ConditionBadge, DocumentStatusBadge, LocationBadge,
│                                # Stepper, DataTable, ConditionSplit
├── domain/                      # hàm thuần, không import React/DB
│   ├── money.ts  quantity.ts  business-date.ts
│   ├── condition.ts  role.ts  document-status.ts  location-type.ts
│   └── condition-split.ts
├── lib/
│   ├── env.ts                   # đọc + kiểm tra biến môi trường (zod)
│   ├── current-user.ts          # người dùng giả lập (thay ở change 2)
│   ├── navigation.ts            # cấu hình menu + lọc theo vai trò
│   ├── api-response.ts          # ok() / fail() theo envelope chung
│   └── hooks/use-online-status.ts
├── db/
│   ├── client.ts                # postgres.js + drizzle
│   ├── schema/index.ts          # rỗng ở change này
│   └── migrate.ts               # script chạy migration
└── instrumentation.ts           # gọi kiểm tra env khi server khởi động
drizzle/                          # file migration SQL (sinh + viết tay)
tests/e2e/                        # Playwright
docker/postgres/init.sql          # tạo DB test
```

- Logic nghiệp vụ ở `src/domain/` (theo `CLAUDE.md`: không viết trong component hay route handler). Các change sau thêm module vào đây (`inventory-ledger`, `rental-billing`...).
- Desktop dùng route group `(desktop)` (URL không có tiền tố); Mobile dùng `(mobile)/m` để có tiền tố `/m` và không trùng đường dẫn với Desktop.

### D3. Bảng đường dẫn và menu theo vai trò

| Mục | Đường dẫn | DIRECTOR | ACCOUNTANT | SALES |
|---|---|:-:|:-:|:-:|
| Tổng quan | `/dashboard` | ✓ | ✓ | ✓ |
| Thu mua | `/purchasing` | ✓ | ✓ | ✓ |
| Kho | `/inventory` | ✓ | ✓ | ✓ |
| Sửa chữa | `/repairs` | ✓ | ✓ | ✓ |
| Bán & Thuê | `/sales` | ✓ | ✓ | ✓ |
| Công nợ | `/receivables` | ✓ | ✓ | |
| Báo cáo | `/reports` | ✓ | | |
| Danh mục | `/catalog` | ✓ | ✓ | ✓ |
| Cài đặt | `/settings` | ✓ | | |

- `WAREHOUSE`, `WORKSHOP` không có menu Desktop; layout `(desktop)` chuyển họ tới `/m`.
- Cấu hình ở `src/lib/navigation.ts` dạng mảng bất biến `{ href, label, icon, roles }`; hàm `navItemsForRole(role)` là hàm thuần, có unit test.
- Bảng quyền này **chỉ là hiển thị**. Kiểm tra quyền thật ở server làm trong `auth-and-roles`, và change đó được phép chỉnh bảng.

### D4. Tiền: `number` nguyên an toàn, DB `bigint`

- Kiểu `Money` (branded `number`), tạo qua `toMoney()` — kiểm tra `Number.isSafeInteger`, sai thì ném `DomainValueError`.
- DB: cột `bigint` với Drizzle `mode: 'number'`.
- Hiển thị: `Intl.NumberFormat('vi-VN')` + `" ₫"`. Đọc: bỏ dấu chấm, khoảng trắng, `₫`; phần còn lại phải khớp `^-?\d+$`.
- *Đã cân nhắc:* `bigint` của JS → an toàn tuyệt đối nhưng phiền khi chia (giá bình quân), khi đưa vào JSON và thư viện bảng. Giới hạn số nguyên an toàn ≈ 9 triệu tỷ đồng, vượt xa quy mô công ty → chọn `number` có kiểm tra.

### D5. Số lượng: số nguyên "phần nghìn"

- Kiểu `Quantity` (branded `number`) lưu giá trị × 1000. VD 250,5 kg → `250500`. Cộng trừ trên số nguyên nên không có sai số dấu phẩy động (0,1 + 0,2 = 0,3 đúng).
- DB: `numeric(14,3)`; driver trả chuỗi → `quantityFromDb("250.500")` đổi bằng xử lý chuỗi, **không** qua `parseFloat`.
- Giới hạn `numeric(14,3)` = 99.999.999.999,999 → × 1000 ≈ 10¹⁴ < 2⁵³, an toàn.
- Phép nhân số lượng × đơn giá và quy tắc làm tròn **không** làm ở đây; change `inventory-ledger` sẽ định nghĩa.
- *Đã cân nhắc:* `decimal.js`/`big.js` → thêm thư viện, dễ lẫn kiểu; tính trong SQL → không unit test được thuần. Số nguyên phần nghìn đủ dùng và đơn giản.

### D6. Ngày nghiệp vụ không dùng thư viện ngày

- Thời điểm: cột `timestamptz`; kết nối DB đặt `timezone=UTC`.
- Ngày nghiệp vụ: kiểu `BusinessDate` = chuỗi `YYYY-MM-DD`, cột `date`. `toBusinessDate(instant)` dùng `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })`.
- Hiển thị `dd/MM/yyyy` và `dd/MM/yyyy HH:mm` cũng qua `Intl` với cùng múi giờ.
- *Đã cân nhắc:* `date-fns-tz`/`dayjs` → không cần cho vài hàm này; `Temporal` → chưa ổn định trên mọi trình duyệt mục tiêu.

### D7. Drizzle + postgres.js, migration là file SQL

- `drizzle-orm` + driver `postgres` (postgres.js). `drizzle-kit generate` sinh SQL vào `drizzle/`, commit vào repo. Migration viết tay (VD trigger chặn UPDATE/DELETE sổ kho ở change 4) đặt cùng thư mục.
- `npm run db:migrate` chạy `src/db/migrate.ts` (bộ migrator của drizzle-orm), không dùng `drizzle-kit push` (push không để lại lịch sử).
- Change này không có bảng; `db:migrate` chạy được trên DB rỗng và tạo bảng theo dõi migration của Drizzle.
- Transaction nhiều bảng: dùng `db.transaction(...)` — quy ước ghi trong `CLAUDE.md`, áp dụng từ change 3.
- *Đã cân nhắc:* Prisma → người dùng chọn Drizzle (gần SQL, kiểu `bigint`/`numeric` rõ, dễ viết trigger).

### D8. PostgreSQL local bằng Docker Compose

- `docker-compose.yml`: image `postgres:17-alpine`, cổng `5432` (đổi được qua `POSTGRES_PORT`), volume có tên.
- `docker/postgres/init.sql` tạo thêm DB `scaffolding_erp_test` cho integration test.
- `.env.example`: `DATABASE_URL=postgres://erp:erp@localhost:5432/scaffolding_erp`, `TEST_DATABASE_URL=.../scaffolding_erp_test`, `DEV_ROLE=DIRECTOR`. Mật khẩu chỉ dùng cho local.

### D9. Kiểm tra env khi khởi động

- `src/lib/env.ts`: schema `zod` cho `DATABASE_URL` (URL bắt đầu `postgres://` hoặc `postgresql://`), `DEV_ROLE` (một trong 5 vai trò, mặc định `DIRECTOR`), `NODE_ENV`. Lỗi chỉ in **tên biến** và lý do, không in giá trị.
- Gọi trong `register()` của `src/instrumentation.ts` → server dừng ngay khi cấu hình sai.

### D10. Người dùng giả lập

- `getCurrentUser()` trong `src/lib/current-user.ts` trả `{ id: 'dev', name: 'Người dùng thử', role: env.DEV_ROLE }`.
- Khi `NODE_ENV === 'production'`: ném `ConfigError("Chưa cấu hình đăng nhập")` → trang lỗi của Next.js. Không bao giờ âm thầm cho vào với vai trò Giám đốc.
- Change `auth-and-roles` thay thân hàm bằng session của Better Auth, giữ nguyên chữ ký hàm.

### D11. API response và `GET /api/health`

- Envelope chung cho mọi API: `{ success: boolean, data: T | null, error: string | null }` qua `ok(data)` / `fail(message, status)` trong `src/lib/api-response.ts`.
- `GET /api/health`: `dynamic = 'force-dynamic'`; chạy `select 1` với giới hạn 3 giây (`Promise.race` + `connect_timeout`).

| Kết quả | HTTP | Body |
|---|---|---|
| DB ổn | 200 | `{ success: true, data: { status: "ok", database: "ok" }, error: null }` |
| DB lỗi/chậm | 503 | `{ success: false, data: { status: "degraded", database: "unreachable" }, error: "Không kết nối được cơ sở dữ liệu" }` |

- Lỗi gốc chỉ ghi log phía server (`console.error` có ngữ cảnh), không trả về client.

### D12. Giao diện: Tailwind v4 + shadcn/ui + token Bright Blue Base

- Tailwind v4 (cấu hình trong CSS bằng `@theme`). shadcn/ui khởi tạo với kiểu `new-york`, màu nền `slate`, biểu tượng `lucide-react`.
- Token khai báo trong `src/app/globals.css` dưới dạng CSS variables, ghi đè biến của shadcn:

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--primary` | blue-600 `#2563EB` | nút chính, mục menu đang chọn, focus ring |
| `--background` | slate-50 | nền trang |
| `--card` | white | thẻ nội dung |
| `--sidebar` | slate-900 | nền sidebar (tách lớp rõ với nội dung) |
| `--destructive` | red-600 | nút nguy hiểm |
| `--condition-{new,good,needs-repair,scrap}` | indigo / green / amber / slate (nền nhạt + chữ đậm) | `ConditionBadge` |
| `--status-{draft,pending,progress,done,overdue}` | slate / amber / blue / green / red | `DocumentStatusBadge` |

- Font: **Be Vietnam Pro** qua `next/font/google` (subset `vietnamese`, `latin`; 400/500/600/700; `display: swap`) — thiết kế cho dấu tiếng Việt. Cột số dùng `tabular-nums`. Một họ font duy nhất.
- Chỉ giao diện sáng ở MVP.
- shadcn/ui component cần thêm: `button`, `badge`, `card`, `input`, `label`, `table`, `dropdown-menu`, `sheet`, `sidebar`, `tooltip`, `separator`, `avatar`, `skeleton`.
- *Đã cân nhắc:* tự viết sidebar → bỏ; block `sidebar` của shadcn đã có chế độ chỉ biểu tượng, ngăn trượt trên màn hẹp và nhớ trạng thái bằng cookie (render đúng ngay từ server, không nháy). Chỉ đổi breakpoint màn hẹp từ 768 lên **1024px** theo spec.

### D13. Component nền

- **DataTable:** `@tanstack/react-table` v8 (đây là lõi mà công thức DataTable của shadcn/ui dùng, không phải thư viện giao diện mới). Change này phân trang/sắp xếp phía client; các change sau bật `manualPagination` cho dữ liệu lớn mà không đổi giao diện. Cột số khai báo `meta.align = 'right'`. Tiêu đề dính bằng `position: sticky`.
- **Stepper:** component có kiểm soát (`value`, `onChange`, `min=0`, `max?`, `step=1`). Nút 48×48px. Gõ trực tiếp, kiểm tra khi rời ô (blur).
- **ConditionSplit:** giao diện gọi hàm thuần `computeConditionSplit(total, parts)` ở `src/domain/condition-split.ts` → `{ allocated, remaining, status: 'balanced' | 'under' | 'over' }`. Tính trên `Quantity` (phần nghìn). Tùy chọn `withLost` để thêm phần Mất.
- Badge: map từ hằng số ở `src/domain/*` sang nhãn tiếng Việt + token màu; không lặp chuỗi nhãn trong component.
- Trang `/dev/components` trưng bày mọi trạng thái component — dùng cho chụp màn hình và kiểm tra a11y.

### D14. Mobile shell và PWA

- `BottomNav` 4 tab, `AppBar` nhận `title` và `backHref?`.
- `useOnlineStatus()` dùng `useSyncExternalStore` với sự kiện `online`/`offline`; `OfflineBanner` có `role="status"`.
- `src/app/manifest.ts` sinh `/manifest.webmanifest`. Biểu tượng PNG 192/512 trong `public/icons/` (logo tạm, thay khi có thiết kế).
- **Không** có service worker ở change này (không offline; Chrome không còn bắt buộc service worker để cài PWA).

### D15. Test

| Loại | Công cụ | File | Môi trường |
|---|---|---|---|
| Unit | Vitest | `src/**/*.test.ts` | node |
| Component | Vitest + Testing Library | `src/**/*.test.tsx` | jsdom |
| Integration | Vitest | `src/**/*.int.test.ts` | node + `TEST_DATABASE_URL` |
| E2E | Playwright | `tests/e2e/*.spec.ts` | Chromium; ảnh ở 375, 768, 1024, 1440px |

- Vitest dùng `projects` để chạy 3 nhóm riêng; `npm test` chạy cả 3. Integration bỏ qua có thông báo rõ nếu thiếu `TEST_DATABASE_URL` khi chạy local, nhưng **bắt buộc** trên CI.
- Coverage (v8) ngưỡng 80% cho `src/domain/**` và `src/lib/**`.
- A11y: `@axe-core/playwright` quét `/dashboard`, `/m`, `/dev/components`, không cho phép lỗi mức `serious`/`critical`.
- Playwright local dùng `next dev`; CI dùng `next build && next start`.

### D16. Chất lượng code và CI

- ESLint (cấu hình của Next.js, flat config) + Prettier (`prettier-plugin-tailwindcss`). `npm run typecheck` = `tsc --noEmit`.
- Header bảo mật trong `next.config.ts`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()` (camera cần cho quét QR/chụp ảnh sau này).
- `.github/workflows/ci.yml`: service `postgres:17-alpine` → `npm ci` → lint → typecheck → `db:migrate` trên DB test → `npm test` → build → Playwright.

### D17. Lệnh chuẩn (`package.json`)

| Lệnh | Việc |
|---|---|
| `dev` / `build` / `start` | Next.js |
| `lint` / `format` / `typecheck` | ESLint / Prettier / tsc |
| `test` / `test:unit` / `test:int` / `test:coverage` | Vitest |
| `test:e2e` | Playwright |
| `db:up` / `db:down` | `docker compose up -d` / `down` |
| `db:generate` / `db:migrate` / `db:studio` | drizzle-kit generate / script migrate / drizzle-kit studio |

## Risks / Trade-offs

- [Token "Bright Blue Base" chưa có file gốc trong repo; giá trị ở D12 suy ra từ `docs/ui.md`] → Tập trung mọi màu vào CSS variables ở `globals.css`; khi có file token chính thức chỉ cần thay giá trị, không sửa component.
- [`number` cho tiền: lỡ có phép tính ra số lẻ (chia giá bình quân)] → Mọi giá trị tiền đi qua `toMoney()` và bị chặn nếu không nguyên; quy tắc làm tròn bắt buộc định nghĩa ở change `inventory-ledger`.
- [Bảng menu theo vai trò ở D3 là giả định] → Chỉ ảnh hưởng hiển thị; `auth-and-roles` rà lại khi làm phân quyền server.
- [Người dùng giả lập lọt lên production] → Hàm ném lỗi khi `NODE_ENV=production`; có unit test cho trường hợp này.
- [Chưa có CSP] → Ghi rõ là việc của `auth-and-roles` (cần middleware sinh nonce). Hiện chưa có dữ liệu thật, chưa triển khai production.
- [Phiên bản thư viện mới (Next 16, Tailwind 4) thay đổi API so với tài liệu cũ] → Tra tài liệu hiện hành (Context7) khi cài; ghim phiên bản chính xác.
- [Integration test phụ thuộc Docker] → `npm run test:unit` chạy được không cần DB; CI có service Postgres riêng.

## Migration Plan

- Dự án mới, không có dữ liệu cũ. Không cần chuyển đổi.
- Rollback: revert commit của change.

## Open Questions

- File token chính thức của Bright Blue Base (nếu có từ Claude Design) — khi có chỉ thay giá trị CSS variables, không đổi cấu trúc hay task.
- Logo và biểu tượng PWA chính thức — dùng logo tạm cho tới khi có.
