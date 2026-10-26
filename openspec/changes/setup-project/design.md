# Design: setup-project

## Context

- Repo chưa có code; chỉ có `docs/`, `CLAUDE.md`, `openspec/`. Lý do làm: xem `proposal.md` → Why.
- Máy dev: Node 24, npm 11, Docker 29. Chưa cài `psql` → mọi thao tác DB đi qua Docker hoặc script Node.
- Lựa chọn đã được người dùng chốt (26/10/2026): **Drizzle**, **Better Auth** (cài ở change 2), **Vitest + Playwright**, **Docker Compose** cho PostgreSQL.
- Token Bright Blue Base có sẵn ở `docs/design-system/tokens.json` (màu Sáng/Tối, chữ, khoảng cách, bo góc, bóng); quy tắc dùng ở `docs/design-system/README.md`. Đây là nguồn duy nhất; code không ghi mã màu tay.
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
│   ├── layout.tsx               # 2 font, globals.css, metadata
│   ├── globals.css              # Tailwind + @import "../styles/tokens.css"
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
├── styles/tokens.css            # SINH TỰ ĐỘNG từ tokens.json — không sửa tay
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
scripts/build-tokens.ts           # tokens.json → src/styles/tokens.css
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

### D5. Số lượng: số nguyên "phần nghìn" kèm đơn vị

- Kiểu `Quantity = { unit: QuantityUnit; milli: number }`, `QuantityUnit = 'PIECE' | 'KG'` (nhãn "cái", "kg"). `milli` là giá trị × 1000. VD 250,5 kg → `{ unit: 'KG', milli: 250500 }`. Cộng trừ trên số nguyên nên không có sai số dấu phẩy động (0,1 + 0,2 = 0,3 đúng).
- `PIECE`: `milli` phải chia hết cho 1000 (số nguyên cái). `KG`: tối đa 3 chữ số thập phân. Kiểm tra trong `toQuantity`/`parseQuantity(input, unit)`, sai thì ném `DomainValueError` với câu báo của spec.
- `addQuantity`/`subtractQuantity` ném lỗi khi khác đơn vị. Quy đổi cái ↔ kg (theo trọng lượng chuẩn) và đơn vị khác (tấn, bộ) **không** làm ở đây — thuộc `master-data`/`purchase-orders`.
- Dạng sửa: `formatQuantityForInput` → `"1234,5"` (không ngăn cách hàng nghìn); `formatMoneyForInput` → `"1250000"`. Ô nhập hiện dạng sửa khi focus, dạng hiển thị khi blur.
- Đọc chuỗi: không nhận dấu ngăn cách hàng nghìn; `.` và `,` đều là dấu thập phân. Nhờ quy tắc "cái là số nguyên", gõ "1.234" cái bị báo lỗi thay vì âm thầm thành 1,234 cái.
- Chuỗi **chưa rõ** với kg: khớp `^-?[1-9]\d*\.\d{3}$` (dấu chấm, đúng 3 chữ số sau, không dấu phẩy) như "1.234", "12.500" (chuỗi bắt đầu bằng "0." như "0.500" không khớp vì không thể là số hàng nghìn, đọc ra 0,5) — người Việt có thể muốn 1234 hoặc 1,234. `parseQuantity` ném `DomainValueError("Chưa rõ số này. Gõ 1234 hoặc 1,234")`. Kiểm tra này chạy **trước** khi đổi `.` thành dấu thập phân. Chuỗi có từ hai dấu chấm trở lên (VD "1.234.567") bị từ chối với "Số lượng không hợp lệ. Không dùng dấu chấm ngăn cách hàng nghìn". "250.5", "0.75", "1,234" không khớp nên đọc bình thường. Dạng sửa (`formatQuantityForInput`) luôn dùng dấu phẩy nên đọc lại không bao giờ rơi vào trường hợp chưa rõ.
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

### D12. Giao diện: Tailwind v4 + shadcn/ui + token Bright Blue Base từ `tokens.json`

- Tailwind v4 (cấu hình trong CSS bằng `@theme`). shadcn/ui khởi tạo với kiểu `new-york`, biểu tượng `lucide-react`.
- **Nguồn token:** `docs/design-system/tokens.json`. Script `scripts/build-tokens.ts` (`npm run tokens`) sinh `src/styles/tokens.css`:
  - Màu chế độ Sáng → CSS variables trùng tên shadcn (`--background`, `--primary`, `--accent`, `--muted`, `--destructive`, `--ring`…) và các màu thêm `--highlight`, `--pop`, `--success`, `--warning` kèm `*-foreground`. Giá trị tham chiếu như `{primary}` được thay bằng giá trị thật.
  - Bo góc `--radius-sm/md/lg/xl/pill`, `--radius` = `radius-md` (biến của shadcn); khoảng cách `--space-1…16`; bóng `--shadow-popover`; kiểu chữ `display-xl`, `display`, `h1`, `h2`, `body-lg`, `body`, `label`, `caption`.
  - Khối `@theme inline` ánh xạ các biến sang tiện ích Tailwind (`bg-primary`, `text-success`, `rounded-lg`, `font-display`…).
  - Giá trị chế độ Tối **không** sinh ở change này (ngoài phạm vi).
- **Chống lệch:** unit test chạy hàm sinh trên `tokens.json` và so với `src/styles/tokens.css` đã commit; lệch là test đỏ. ESLint chặn tên màu Tailwind cứng (`blue-600`, `slate-50`…) và mã hex trong `src/` (trừ file sinh).
- **Font** qua `next/font/google`, `display: swap`, subset `vietnamese` + `latin`:
  - `display` = **Bricolage Grotesque** (700) cho tiêu đề trang, tiêu đề khối, con số lớn.
  - `body` = **Be Vietnam Pro** (400/500/600) cho nội dung, nhãn, nút. Ô nhập luôn 16px.
  - Hai họ chữ là giới hạn tối đa của dự án. Cột số dùng `tabular-nums`.
- **Sidebar Desktop:** nền `card`, viền phải `border`; mục đang chọn nền `accent` + chữ `accent-foreground`; rê chuột cũng `accent`. Không dùng sidebar nền tối.
- **Badge** (bo `radius-pill`, chữ kiểu `caption`):

| Token | Kiểu | Dùng cho |
|---|---|---|
| `highlight` | nền `highlight`, chữ `highlight-foreground` | Mới |
| `muted` | nền `muted`, chữ `muted-foreground` | Phế liệu, Nháp |
| `primary` | nền `primary`, chữ `primary-foreground` | Đang xử lý |
| `destructive` | nền `destructive`, chữ `destructive-foreground` | Quá hạn |
| `success` | viền + chữ `success`, nền `card` | Tốt, Hoàn thành |
| `warning` | viền + chữ `warning`, nền `card` | Chờ sửa, Chờ duyệt |

  `success`/`warning` không có `*-foreground` trong token nên dùng kiểu viền; README xác nhận hai màu này đọc được (≥ 4.5:1) khi làm chữ trên `card`. Mọi cặp còn lại là cặp chữ/nền đã ghi trong token.
- **Trạng thái tương tác:** focus `ring` 2px liền, cách 2px; nút nhấn thu nhỏ 0.97 trong 120ms; tắt chuyển động khi `prefers-reduced-motion`.
- Chỉ giao diện sáng ở MVP.
- shadcn/ui component cần thêm: `button`, `badge`, `card`, `input`, `label`, `table`, `dropdown-menu`, `sheet`, `sidebar`, `tooltip`, `separator`, `avatar`, `skeleton`.
- *Đã cân nhắc:* chép tay giá trị từ `tokens.json` vào `globals.css` → dễ lệch khi token đổi; sinh tự động + test chống lệch rẻ hơn về lâu dài. Tự viết sidebar → bỏ; block `sidebar` của shadcn đã có chế độ chỉ biểu tượng, ngăn trượt trên màn hẹp và nhớ trạng thái bằng cookie (render đúng ngay từ server, không nháy). Chỉ đổi breakpoint màn hẹp từ 768 lên **1024px** theo spec.
- **Mốc màn hình:** dùng mốc mặc định của Tailwind, không tự đặt: `md` = 768px, `lg` = 1024px, `xl` = 1280px. Kiểu `hideBelow` của DataTable và hook `useBreakpoint()` dùng đúng ba tên này.
- **Sidebar theo cỡ:** cookie `sidebar_state` chỉ được ghi khi người dùng bấm (giá trị `expanded` | `collapsed`). Không có cookie → mặc định theo bề rộng: `< lg` ngăn trượt (`Sheet`), `lg`–`< xl` chỉ biểu tượng, `≥ xl` mở rộng. Có cookie → áp dụng ở mọi bề rộng `≥ lg`. Server không biết bề rộng nên lần render đầu khi chưa có cookie dùng CSS (`lg:`/`xl:`) để đúng ngay, không nháy; trạng thái JS nhận lại sau khi hydrate.
- **Header < `md`:** ô tìm kiếm thành nút biểu tượng `aria-label="Tìm kiếm"`; nút tạo nhanh thu thành một nút "+" có menu. Các phần header dùng `min-w-0` + `truncate` để không tràn.

### D13. Component nền

- **DataTable:** `@tanstack/react-table` v8 (đây là lõi mà công thức DataTable của shadcn/ui dùng, không phải thư viện giao diện mới). Change này phân trang/sắp xếp phía client; các change sau bật `manualPagination` cho dữ liệu lớn mà không đổi giao diện. Cột số khai báo `meta.align = 'right'`. Tiêu đề dính bằng `position: sticky`.
  - Khung bảng `overflow-x: auto` có `max-width: 100%`; trang không cuộn ngang. Cột đầu `position: sticky; left: 0` nền `card`; ô góc (tiêu đề cột đầu) dính cả `top` và `left`, `z-index` cao hơn tiêu đề và cột thường.
  - Cột khai báo `meta.hideBelow?: 'md' | 'lg' | 'xl'`; ẩn bằng lớp CSS (`hidden md:table-cell`…) nên không nháy khi tải. Cột đầu không được khai báo `hideBelow` (kiểm tra lúc dev).
  - Prop **bắt buộc** `emptyState: { message: string; action?: { label: string; onClick?: () => void; href?: string } }`. Thiếu prop là lỗi TypeScript, nên không thể có bảng rỗng ghi "Không có dữ liệu". Trạng thái rỗng căn giữa (ngoại lệ căn giữa theo README), ẩn phân trang.
- **Stepper:** component có kiểm soát (`value: Quantity`, `onChange`, `min=0`, `max?`, `step=1`); đơn vị lấy từ `value.unit`. Nút 48×48px. Gõ trực tiếp, kiểm tra bằng `parseQuantity(input, unit)` khi rời ô (blur); sai thì trả về giá trị cũ và hiện lời nhắc.
- **Ô nhập số** (dùng trong Stepper, ConditionSplit, sau này ô tiền): hiện `formatQuantity`/`formatMoney` khi không focus, `formatQuantityForInput`/`formatMoneyForInput` khi focus; `inputMode="decimal"` cho kg, `"numeric"` cho cái và tiền.
- **ConditionSplit:** giao diện gọi hàm thuần `computeConditionSplit(total, parts)` ở `src/domain/condition-split.ts` → `{ allocated, remaining, status: 'balanced' | 'under' | 'over' }`. Tính trên `Quantity` (phần nghìn); mọi phần cùng đơn vị với tổng, phần gõ sai quy tắc đơn vị không được tính. Tùy chọn `withLost` để thêm phần Mất.
- Badge: map từ hằng số ở `src/domain/*` sang nhãn tiếng Việt + token (bảng ở D12); không lặp chuỗi nhãn trong component.
- **Trạng thái chứng từ:** `src/domain/document-status.ts` tách `STORED_DOCUMENT_STATUSES` (`DRAFT`, `PENDING_APPROVAL`, `IN_PROGRESS`, `DONE` — dùng cho enum DB ở các change sau) và `DisplayDocumentStatus` = các giá trị đó + `OVERDUE`. `assertStorableStatus()` ném lỗi với `OVERDUE`. `DocumentStatusBadge` nhận `DisplayDocumentStatus`. Hàm tính Quá hạn từ ngày đến hạn làm ở `receivables`.
- Trang `/dev/components` trưng bày mọi trạng thái component — dùng cho chụp màn hình và kiểm tra a11y.

### D14. Mobile shell và PWA

- `BottomNav` 4 tab, tab đang chọn nền `accent` bo `radius-pill`; `AppBar` nhận `title` và `backHref?`, tiêu đề dùng họ chữ `display`.
- **Màn rộng:** khung nội dung và `BottomNav` (fixed) dùng `max-w-[640px] mx-auto w-full`; ngoài khung là nền `background`.
- **Vùng an toàn:** `viewport` có `viewport-fit=cover` (khai báo `export const viewport` ở layout gốc). `AppBar` thêm `padding-top: env(safe-area-inset-top)`, `BottomNav` thêm `padding-bottom: env(safe-area-inset-bottom)`; nội dung chừa đáy bằng chiều cao BottomNav + vùng an toàn. Trái/phải dùng `safe-area-inset-left/right` khi xoay ngang.
- **Chiều cao:** khung Mobile `min-h-dvh` (không dùng `100vh`, vì trên điện thoại `vh` tính cả phần thanh địa chỉ che).
- **Bàn phím ảo:** hook `useKeepFocusedInputVisible()` gắn một lần ở `MobileShell`: nghe `focusin` trên `input`/`textarea`/`select` và `resize` của `window.visualViewport`; khi vùng nhìn thấy co lại mà ô đang focus nằm dưới mép dưới, gọi `scrollIntoView({ block: 'center' })` (tắt hiệu ứng mượt khi `prefers-reduced-motion`). Không cần sửa từng form.
- Layout `(mobile)/m` **không** kiểm tra vai trò: mọi vai trò mở được (Giám đốc xem trên điện thoại). Chỉ layout `(desktop)` chuyển vai trò Mobile sang `/m`.
- `useOnlineStatus()` dùng `useSyncExternalStore` với sự kiện `online`/`offline`; `OfflineBanner` có `role="status"`.
- `src/app/manifest.ts` sinh `/manifest.webmanifest`. `theme_color` và `background_color` đọc từ `tokens.json` (`primary`, `background` chế độ Sáng) lúc build, không ghi tay. Biểu tượng PNG 192/512 trong `public/icons/` (logo tạm, thay khi có thiết kế).
- **Không** có service worker ở change này (không offline; Chrome không còn bắt buộc service worker để cài PWA).

### D15. Test

| Loại | Công cụ | File | Môi trường |
|---|---|---|---|
| Unit | Vitest | `src/**/*.test.ts` | node |
| Component | Vitest + Testing Library | `src/**/*.test.tsx` | jsdom |
| Integration | Vitest | `src/**/*.int.test.ts` | node + `TEST_DATABASE_URL` |
| E2E | Playwright | `tests/e2e/*.spec.ts` | Microsoft Edge (kênh `msedge`); Desktop 1280×720, 1366×768; Mobile 375×812 |
| Không cuộn ngang | Playwright | `tests/e2e/responsive.spec.ts` | Edge; 360, 375, 768, 1024, 1280, 1366px |
| Hỗ trợ cơ bản | Playwright, thẻ `@basic` | `tests/e2e/basic-browsers.spec.ts` | Firefox + WebKit (lõi của Safari) |
| Ảnh mốc | Playwright, thẻ `@visual` | `tests/e2e/visual.spec.ts` | **Chỉ CI** (Linux + Edge); 360, 375, 768, 1024, 1280, 1366px |

- Vitest dùng `projects` để chạy 3 nhóm riêng; `npm test` chạy cả 3. Integration bỏ qua có thông báo rõ nếu thiếu `TEST_DATABASE_URL` khi chạy local, nhưng **bắt buộc** trên CI.
- Coverage (v8) ngưỡng 80% cho `src/domain/**` và `src/lib/**`.
- A11y: `@axe-core/playwright` quét `/dashboard`, `/m`, `/dev/components`, không cho phép lỗi mức `serious`/`critical`.
- Playwright local dùng `next dev`; CI dùng `next build && next start`.
- **Trình duyệt:** nền tảng chính là Windows 10/11 + Edge. Playwright dùng `channel: 'msedge'`. CI chạy trên runner Linux và cài Edge bằng `npx playwright install msedge`. Không dùng runner Windows vì runner đó không chạy được service container (Postgres). Ở máy dev, nếu không có Edge thì dùng Chromium (`PW_CHANNEL` để đổi); Edge và Chromium cùng lõi nên khác biệt nhỏ.
- **Cỡ màn hình chuẩn:** 360, 375 (điện thoại), 768 (máy tính bảng), 1024, 1280, 1366 (màn hình văn phòng phổ biến); bỏ 1440px.
- **Không cuộn ngang:** `responsive.spec.ts` mở `/dashboard`, `/inventory`, `/m`, `/m/history`, `/dev/components` ở 6 cỡ và kiểm tra `document.documentElement.scrollWidth <= window.innerWidth`. Cùng file kiểm tra sidebar ở 900/1100/1366px (ngăn trượt / chỉ biểu tượng / mở rộng) và khung `/m` rộng 640px ở 1366px.
- **Ma trận trình duyệt:**

| Mức | Trình duyệt | Cách kiểm tra |
|---|---|---|
| Chính | Edge trên Windows 10/11 | Toàn bộ E2E + ảnh mốc (Edge trên Linux CI) + kiểm tra tay trên Windows (task 11.1) |
| Đầy đủ | Chrome/Edge bản mới trên Windows, macOS, Ubuntu; Chrome Android | Như trên (cùng lõi Chromium); kiểm tra tay Chrome macOS, Chrome Android |
| Cơ bản | Firefox, Safari bản mới (gồm Safari iPhone) | `@basic` trên Firefox + WebKit: trang mở được, không lỗi console, không cuộn ngang, bấm được menu/tab; kiểm tra tay Safari iPhone. Không có ảnh mốc |

  "Bản mới" = hai bản phát hành gần nhất; không thêm polyfill cho bản cũ hơn.
- **Ảnh mốc chỉ tạo và so sánh trên CI** (font và cách vẽ chữ khác nhau giữa macOS và Linux làm ảnh lệch giả):
  - Test ảnh gắn thẻ `@visual`. `npm run test:e2e` ở local chạy với `--grep-invert @visual`; khi `CI=true` chạy cả nhóm `@visual`.
  - `snapshotPathTemplate` không chứa tên hệ điều hành; ảnh mốc commit trong `tests/e2e/__screenshots__/`.
  - Tạo/cập nhật ảnh mốc: workflow `.github/workflows/update-snapshots.yml` chạy tay (`workflow_dispatch`, chọn nhánh) → `playwright test --grep @visual --update-snapshots` → commit ảnh vào chính nhánh đó (quyền `contents: write`) → `gh workflow run ci.yml --ref <nhánh>` (quyền `actions: write`). Bước cuối cần vì commit bằng `GITHUB_TOKEN` không tự kích hoạt workflow; riêng sự kiện `workflow_dispatch` thì được phép. Lần chạy CI đó gắn với commit ảnh nên hiện trên PR. Không ai tạo ảnh mốc trên máy dev.
  - Khi chưa có ảnh mốc, job CI so sánh ảnh báo đỏ kèm hướng dẫn chạy workflow trên.

### D16. Chất lượng code và CI

- ESLint (cấu hình của Next.js, flat config) + Prettier (`prettier-plugin-tailwindcss`). `npm run typecheck` = `tsc --noEmit`.
- Header bảo mật trong `next.config.ts`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()` (camera cần cho quét QR/chụp ảnh sau này).
- `.github/workflows/ci.yml` (trigger `push`, `pull_request`, `workflow_dispatch`): service `postgres:17-alpine` → `npm ci` → lint → typecheck → `db:migrate` trên DB test → `npm test` (gồm test chống lệch token) → build → Playwright (gồm `@visual`). Ảnh khác biệt được tải lên làm artifact khi lỗi.
- `.github/workflows/update-snapshots.yml`: chạy tay, xem D15.

### D17. Lệnh chuẩn (`package.json`)

| Lệnh | Việc |
|---|---|
| `dev` / `build` / `start` | Next.js |
| `lint` / `format` / `typecheck` | ESLint / Prettier / tsc |
| `test` / `test:unit` / `test:int` / `test:coverage` | Vitest |
| `test:e2e` | Playwright (local bỏ `@visual`) |
| `tokens` | Sinh `src/styles/tokens.css` từ `docs/design-system/tokens.json` |
| `db:up` / `db:down` | `docker compose up -d` / `down` |
| `db:generate` / `db:migrate` / `db:studio` | drizzle-kit generate / script migrate / drizzle-kit studio |

### D18. In chứng từ qua một hàm chung

- `src/lib/print.ts` export `printDocument(options?: { title?: string })`. Bản đầu: nếu có `title` thì đặt tạm `document.title` (Edge dùng làm tên file khi "Lưu dạng PDF"), gọi `window.print()`, trả lại tiêu đề cũ ở sự kiện `afterprint`.
- Đây là **chỗ duy nhất** được gọi `window.print()`. ESLint chặn ở mọi file khác cả `window.print()` / `globalThis.print()` (`no-restricted-properties`) lẫn `print()` trần (`no-restricted-globals`). Sau này đổi sang PDF do server tạo hoặc in qua dịch vụ khác thì chỉ sửa file này.
- Khung giao diện (sidebar, header, BottomNav, AppBar, OfflineBanner) có lớp `print:hidden` để bản in chỉ còn nội dung.
- Unit test (jsdom): giả `window.print`, kiểm tra được gọi đúng một lần, tiêu đề đổi khi in và được trả lại sau `afterprint`.
- *Đã cân nhắc:* tạo PDF phía server ngay từ đầu → thêm thư viện, chưa có mẫu in nào để cần; hộp thoại in của Edge đã có "Lưu dạng PDF".

## Risks / Trade-offs

- [`tokens.json` đổi mà quên sinh lại CSS] → Test chống lệch đỏ trên CI.
- [Bricolage Grotesque thiếu dấu tiếng Việt ở một số ký tự] → Kiểm tra subset `vietnamese` khi cài; trang `/dev/components` có tiêu đề mẫu đủ dấu ("Phiếu nhập thu hồi – Ước tính đền bù") để nhìn bằng mắt và có trong ảnh mốc.
- [Ảnh mốc chỉ ở CI nên dev không xem trước được ở local] → Khi CI lỗi, ảnh khác biệt có trong artifact; cập nhật bằng workflow chạy tay.
- [`number` cho tiền: lỡ có phép tính ra số lẻ (chia giá bình quân)] → Mọi giá trị tiền đi qua `toMoney()` và bị chặn nếu không nguyên; quy tắc làm tròn bắt buộc định nghĩa ở change `inventory-ledger`.
- [Bảng menu theo vai trò ở D3 là giả định] → Chỉ ảnh hưởng hiển thị; `auth-and-roles` rà lại khi làm phân quyền server.
- [Người dùng giả lập lọt lên production] → Hàm ném lỗi khi `NODE_ENV=production`; có unit test cho trường hợp này.
- [Chưa có CSP] → Ghi rõ là việc của `auth-and-roles` (cần middleware sinh nonce). Hiện chưa có dữ liệu thật, chưa triển khai production.
- [Phiên bản thư viện mới (Next 16, Tailwind 4) thay đổi API so với tài liệu cũ] → Tra tài liệu hiện hành (Context7) khi cài; ghim phiên bản chính xác.
- [CI chạy Edge trên Linux, người dùng thật dùng Edge trên Windows: font vẽ khác, ảnh mốc không phản ánh đúng từng điểm ảnh] → Ảnh mốc chỉ để bắt thay đổi bố cục; task 11.1 kiểm tra bằng mắt trên Windows + Edge ở 1280 và 1366px.
- [Chạy lại CI bằng `workflow_dispatch` không theo cùng luồng `pull_request`] → Job trong `ci.yml` giữ tên giống nhau cho mọi trigger để check bắt buộc của nhánh vẫn khớp.
- [Bàn phím ảo trên iOS Safari không làm đổi `window.innerHeight` và Playwright không giả lập được bàn phím] → Dùng `visualViewport` thay vì `resize` của `window`; component test kiểm tra hook gọi `scrollIntoView` khi giả `visualViewport` co lại; kiểm tra tay trên iPhone ở task 11.1.
- [Cookie sidebar chỉ có sau khi người dùng bấm, server không biết bề rộng cửa sổ] → Mặc định theo bề rộng làm bằng CSS nên đúng ngay lần render đầu; chỉ khi có cookie mới render theo cookie.
- [Integration test phụ thuộc Docker] → `npm run test:unit` chạy được không cần DB; CI có service Postgres riêng.

## Migration Plan

- Dự án mới, không có dữ liệu cũ. Không cần chuyển đổi.
- Rollback: revert commit của change.

## Open Questions

- Logo và biểu tượng PWA chính thức — dùng logo tạm cho tới khi có.
