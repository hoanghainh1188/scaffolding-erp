# Scaffolding ERP

Phần mềm quản lý cho công ty thu mua, sửa chữa, bán và cho thuê giàn giáo, vật tư xây dựng đã qua sử dụng.

## Tài liệu

- [Nghiệp vụ](docs/requirements.md)
- [Giao diện](docs/ui.md)
- [Lộ trình change](docs/roadmap.md)
- [Hướng dẫn cho Claude Code](CLAUDE.md)

## Chạy local

Cần: Node 24 (xem `.nvmrc`), Docker Desktop.

```bash
npm ci
cp .env.example .env     # chỉnh nếu cần
npm run db:up            # bật PostgreSQL 17 trong Docker, chờ tới khi sẵn sàng
npm run db:migrate       # chạy migration trong drizzle/ bằng owner (DATABASE_URL_MIGRATE), cấp quyền cho erp_app
npm run db:seed:dev      # 5 tài khoản mẫu, mật khẩu là DEV_SEED_PASSWORD trong .env
npm run dev              # http://localhost:3000, đăng nhập bằng giamdoc / ketoan / kinhdoanh / thukho / xuong
```

### Đăng nhập và tài khoản

- Mọi trang đều cần đăng nhập. Tài khoản do Giám đốc tạo ở **Cài đặt › Người dùng**; người mới nhận mật khẩu tạm và phải đổi ở lần đăng nhập đầu.
- **Cài đặt lần đầu (kể cả production):** tạo role app `erp_app` (xem mục Cơ sở dữ liệu), đặt `DATABASE_URL` (role `erp_app`), `DATABASE_URL_MIGRATE` (owner, chỉ ở máy chạy migration, không đặt trên server app), `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` (địa chỉ công khai, ví dụ `https://erp.congty.vn`), chạy `npm run db:migrate`, rồi:

  ```bash
  npm run auth:create-director -- --username minhanh --name "Minh Anh"
  ```

  Lệnh in mật khẩu tạm **một lần**; đưa cho Giám đốc. Đã có Giám đốc đang dùng thì lệnh từ chối.

- **Production phải chạy sau reverse proxy** (nginx, Caddy...) có thêm địa chỉ người dùng vào `X-Forwarded-For` (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). Giới hạn 20 lần đăng nhập/phút/IP và khóa tạm theo IP dựa vào header này.
- **Cứu hộ khi tài khoản bị tạm khóa (do nhập sai mật khẩu quá 5 lần):** chạy lệnh server để gỡ tạm khóa ngay lập tức:
  ```bash
  npm run auth:unlock -- --username <tên-đăng-nhập>
  # hoặc gỡ toàn bộ hệ thống:
  npm run auth:unlock -- --all
  ```
- **Cứu hộ khi Giám đốc duy nhất quên mật khẩu:** người quản trị server khóa tài khoản đó bằng SQL (`update "user" set status = 'LOCKED' where username = '...';`), chạy `npm run auth:create-director` để có Giám đốc tạm, đăng nhập bằng tài khoản tạm rồi **Mở khóa** tài khoản cũ (nhận mật khẩu tạm mới) và khóa tài khoản tạm.

### Cơ sở dữ liệu

- `npm run db:up` tạo 2 DB trong cùng container:
  - `scaffolding_erp` — dùng khi chạy app (`DATABASE_URL`).
  - `scaffolding_erp_test` — chỉ cho integration test (`TEST_DATABASE_URL`).
- **Hai role** (change `db-least-privilege`, 0.2 #36):
  - `erp` — owner (chủ bảng): chỉ dùng cho `npm run db:migrate` (`DATABASE_URL_MIGRATE`) và dọn bảng trong integration test (`TEST_DATABASE_URL_MIGRATE`).
  - `erp_app` — app, script, E2E, code trong integration test (`DATABASE_URL`, `TEST_DATABASE_URL`). Không sửa/xóa được `inventory_ledger`, `activity_log`, `scrap_price`; không TRUNCATE, không đổi cấu trúc bảng.
  - Volume Docker mới tự có `erp_app`. Volume tạo trước change này: chạy `npm run db:roles` một lần, cập nhật `.env` theo `.env.example`, rồi migrate lại cả 2 DB (lệnh dưới).
  - `npm run db:migrate` cấp lại quyền cho `erp_app` mỗi lần chạy (bảng mới tự có quyền). Thêm bảng chỉ ghi thêm mới thì thêm tên vào `APPEND_ONLY_TABLES` (`src/db/grants.ts`); test sẽ đỏ nếu quên.
- Cổng mặc định `5432`. Máy đã có Postgres chiếm cổng này thì đặt `POSTGRES_PORT=5433` trong `.env` và sửa cổng trong 2 URL.
- `npm run db:down` tắt container, **giữ** dữ liệu. Muốn xoá sạch: `docker compose down -v`.
- Thêm bảng: sửa `src/db/schema/`, chạy `npm run db:generate`, xem lại file SQL mới trong `drizzle/`, rồi `npm run db:migrate`. Không dùng `drizzle-kit push`.
- `npm run db:studio` mở Drizzle Studio để xem dữ liệu.

### Test

- `npm test` — unit, component và integration. Integration cần `TEST_DATABASE_URL` (role `erp_app`) và `TEST_DATABASE_URL_MIGRATE` (owner, để dọn bảng); thiếu thì được bỏ qua kèm thông báo (trên CI thì bắt buộc).
- `npm run test:int` — chỉ integration test. Chạy migration vào DB test trước nếu test cần bảng: `DATABASE_URL_MIGRATE=postgres://erp:erp@localhost:5432/scaffolding_erp_test npm run db:migrate`.
- `npm run test:e2e` — Playwright trên Microsoft Edge, tự bật `next dev` ở local (trên CI hoặc khi chạy `npm run test:e2e:prod` sẽ chạy trên bản production build). Cần DB dev đã migrate và `E2E_PASSWORD` trong `.env`; global setup tạo lại các tài khoản `e2e.*` mỗi lần chạy. Máy không có Edge: `PW_CHANNEL=chromium npm run test:e2e`. Đang chạy `npm run dev` ở cổng khác thì đặt `PW_PORT` trùng cổng đó để dùng lại, đừng chạy hai server cùng lúc.
- `npm run test:e2e:prod` — Build production với `E2E=1` rồi chạy Playwright E2E trên bản production build.
- Bản production build từ chối khởi động khi có `DATABASE_URL_MIGRATE`. Chạy `npm start` ở local với `.env` có biến này thì để trống nó: `DATABASE_URL_MIGRATE= npm start` (Playwright tự làm vậy).
- Test ảnh mốc (`@visual`) chỉ chạy trên CI. Muốn tạo hoặc cập nhật ảnh mốc: GitHub → Actions → **Update Playwright snapshots** → chọn nhánh → Run workflow. Workflow commit ảnh vào nhánh rồi tự chạy lại CI.

### Design token

Màu, chữ, bo góc lấy từ `docs/design-system/tokens.json`. Sửa file đó xong chạy `npm run tokens` để sinh lại `src/styles/tokens.css` (không sửa tay file CSS này). `npm run lint` báo lỗi nếu code dùng màu Tailwind cứng (`bg-blue-600`) hoặc mã hex.

### CI

`.github/workflows/ci.yml` chạy cho mỗi pull request và mỗi lần push lên `main`: format, lint, typecheck, migration + toàn bộ Vitest trên PostgreSQL, `npm run build`, rồi Playwright (Edge, Firefox, WebKit) và so sánh ảnh mốc.

## Quy trình phát triển

Dùng [OpenSpec](https://github.com/Fission-AI/OpenSpec) với Claude Code:

```bash
npm install -g @fission-ai/openspec@latest
```

Trong Claude Code: `/opsx:explore` → `/opsx:propose` → duyệt → `/opsx:apply` → `/opsx:archive`.

Change đầu tiên: `/opsx:propose setup-project`.
