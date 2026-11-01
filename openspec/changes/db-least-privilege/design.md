# Design: db-least-privilege (K12)

## Context

Lý do: xem `proposal.md` mục Why. Hiện trạng liên quan:

- **Một role cho mọi việc.** Local và CI dùng `erp` (superuser của container). Demo trên Neon dùng `neondb_owner` cho cả migrate lẫn app (Vercel có `DATABASE_URL` pooled và `DATABASE_URL_UNPOOLED` cùng role này). Migration trong `drizzle/` không có `GRANT`/`REVOKE`, nên mọi bảng thuộc role chạy migrate.
- **Chặn chỉ ghi thêm bằng trigger:** `inventory_ledger` (0003), `scrap_price` (0005), `activity_log` (0008) có trigger chặn UPDATE/DELETE/TRUNCATE. TRUNCATE chỉ qua được trên DB tên `*_test` khi phiên đặt `inventory.allow_truncate = 'on'` (`truncateWithLedger` ở `src/test/inventory.ts`). Chủ bảng tắt được các trigger này.
- **Migrate:** `src/db/migrate.mts` đọc `DATABASE_URL_UNPOOLED || DATABASE_URL`. Drizzle ghi lịch sử vào schema `drizzle` (`drizzle.__drizzle_migrations`).
- **Các nơi kết nối DB:** app (`src/db/client.ts`), script `seed-dev`, `seed-demo`, `create-director`, `unlock-user`, `inventory-check`, E2E global setup (`tests/e2e/global-setup.ts`, dùng `DATABASE_URL`), integration test (`TEST_DATABASE_URL`), workflow `backup.yml` (`pg_dump`).
- **Quyền app thật sự cần** (rà `src/lib`, `scripts`, `tests/e2e`): INSERT/SELECT mọi bảng; UPDATE/DELETE trên danh mục, đơn, phiếu, phiên đăng nhập, `login_throttle`, `inventory_cost`, `document_counter`, kiểm kê… Không chỗ nào (ngoài test) UPDATE/DELETE `inventory_ledger`, `activity_log`, `scrap_price`. Không chỗ nào dùng TRUNCATE ngoài test. E2E global setup chỉ DELETE `kit`, `item`, `site`, `location`, `purchase_order`, `repair_order`, `user`, `session` và UPDATE `customer`, `user`.
- **Neon:** không có superuser. Role tạo bằng Console/API/CLI tự là thành viên `neon_superuser` (tạo DB, tạo role, đọc/ghi mọi bảng) nên **không dùng được làm role app**. Role tạo bằng SQL (`CREATE ROLE … LOGIN PASSWORD …`) không có `neon_superuser`, chỉ có quyền được cấp; mật khẩu tối thiểu 12 ký tự, có chữ thường, hoa, số, ký hiệu. Nhánh con là bản sao của nhánh cha, gồm cả role và quyền tại thời điểm tạo/reset.
- **Demo đang chạy:** nhánh `seed` (đã migrate + seed bằng `neondb_owner`), nhánh `demo` con của `seed`, reset hằng đêm bằng `neonctl branches reset demo --parent`. `deploy-demo.yml` chỉ chạy tay (`workflow_dispatch`); Vercel tự deploy khi `main` đổi.

## Goals / Non-Goals

**Goals:**

- Lộ `DATABASE_URL` của app không đủ để sửa/xóa sổ kho, nhật ký, giá sắt vụn, hay tắt trigger.
- Không thêm việc tay mỗi lần có bảng mới.
- Local, CI, demo đều chạy bằng role app để lỗi thiếu quyền lộ ra sớm, không chờ production.
- Demo chuyển sang được mà không phải dựng lại project Neon.

**Non-Goals:**

- Không thay trigger chỉ ghi thêm (giữ làm lớp chặn thứ hai, chặn cả owner khi lỡ tay).
- Không làm role chỉ đọc, RLS, tách schema.
- Không tự động tạo role trên Neon bằng workflow.

## Decisions

### D1. Tên role và biến môi trường (điểm cần chốt 1)

| | Role | Biến | Dùng ở đâu |
|---|---|---|---|
| Owner (migrate) | local/CI: `erp`; Neon: `neondb_owner` (giữ role đang có) | `DATABASE_URL_MIGRATE` (kết nối trực tiếp, không qua pooler) | `npm run db:migrate`, `backup.yml`, việc vận hành tay |
| App | `erp_app` (biến `DB_APP_ROLE`, mặc định `erp_app`) | `DATABASE_URL` (Neon: pooled) | app, mọi script `npm run …` khác, E2E |

- **Biến mới `DATABASE_URL_MIGRATE`, bỏ `DATABASE_URL_UNPOOLED`.** Lý do: tên nói rõ "URL owner, chỉ để migrate", khó đặt nhầm lên server app. `DATABASE_URL_UNPOOLED` hiện nằm trên Vercel và mang role owner; giữ tên đó dễ để sót credential owner trên server app. Migrate **không** lùi về `DATABASE_URL`: chạy migrate bằng role app chắc chắn lỗi giữa chừng, báo lỗi sớm dễ hiểu hơn.
- Ở `production`, app từ chối khởi động nếu có `DATABASE_URL_MIGRATE` (`src/lib/env.ts`). `DATABASE_URL_UNPOOLED` bị bỏ khỏi schema env (có thì bỏ qua, không chặn) để không làm sập demo trong lúc chuyển (xem Migration Plan).
- Đã cân nhắc:
  - *Dùng lại `DATABASE_URL_UNPOOLED` cho migrate:* ít đổi, nhưng tên chỉ nói "không qua pooler", không nói "owner"; Vercel đã có biến này cho app. Loại.
  - *Tên role `erp_rw`/`app_user`:* `erp_app` khớp với role owner local `erp` và đọc ra ngay là "role của app".
  - *Role app tạo bằng Neon Console:* bị cộng `neon_superuser`, mất ý nghĩa. Loại.

### D2. Cấp quyền ở đâu (điểm cần chốt 2)

Chọn **bước cấp quyền chạy lại được, gọi ở cuối `db:migrate`**, viết trong `src/db/grants.ts` (một hàm nhận kết nối owner + tên role app), không viết `GRANT` trong `drizzle/*.sql`.

Mỗi lần chạy, trong một transaction, với quyền owner:

1. Kiểm tra role app tồn tại (`pg_roles`); không có thì dừng, chỉ tới hướng dẫn tạo role (D4).
2. `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM <app>`, `REVOKE ALL ON ALL SEQUENCES …` — xóa mọi quyền lỡ cấp tay.
3. `GRANT USAGE ON SCHEMA public`; `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public`; `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public`.
4. `REVOKE UPDATE, DELETE ON <bảng chỉ ghi thêm>` (D3).
5. `REVOKE CREATE ON SCHEMA public FROM PUBLIC` (PG 17 đã mặc định, ghi rõ cho chắc); `REVOKE ALL ON SCHEMA drizzle FROM PUBLIC`.
6. `REVOKE CONNECT ON DATABASE <db hiện tại> FROM PUBLIC`; `GRANT CONNECT … TO <app>` (D6).
7. Kiểm tra lại bằng `has_table_privilege`, `pg_class.relowner`, `has_schema_privilege`, `rolsuper/rolcreaterole/rolcreatedb/rolbypassrls` và thành viên của `pg_write_all_data`, `neon_superuser`: sai thì throw với tên quyền sai.

Vì bước 2–4 chạy lại toàn bộ mỗi lần migrate, **không cần `ALTER DEFAULT PRIVILEGES`**: bảng mới có quyền ngay sau migrate tạo ra nó.

- Đã cân nhắc:
  - *`GRANT` trong file migration:* migration đã chạy thì không sửa được; mỗi migration tạo bảng phải nhớ thêm `GRANT`, quên là app lỗi ở production. Tên role cố định trong SQL nên khó đổi theo `DB_APP_ROLE`. Loại.
  - *`ALTER DEFAULT PRIVILEGES`:* chỉ áp cho bảng do đúng role đó tạo sau này, mặc định cấp UPDATE/DELETE cho cả bảng chỉ ghi thêm mới (phải nhớ thu hồi), và không sửa được quyền lỡ cấp tay. Bước chạy lại được che được cả ba. Loại.
  - *Script hạ tầng riêng (`npm run db:grants`) chạy tay:* dễ quên. Gắn vào migrate thì không thể migrate mà không cấp quyền.

### D3. Bảng nào chỉ INSERT/SELECT (điểm cần chốt 3)

- **Chỉ `SELECT, INSERT`:** `inventory_ledger`, `activity_log`, `scrap_price` — đúng ba bảng có trigger chỉ ghi thêm. Danh sách là hằng `APPEND_ONLY_TABLES` trong `src/db/grants.ts`.
- **Test chống lệch:** integration test đọc `pg_trigger` các bảng có trigger dùng hàm `*_append_only` và so với `APPEND_ONLY_TABLES`. Thêm bảng chỉ ghi thêm mới mà quên danh sách → test đỏ.
- **`SELECT, INSERT, UPDATE, DELETE`:** mọi bảng còn lại, gồm:
  - Đăng nhập: `user`, `session`, `account`, `verification`, `rate_limit`, `auth_rate_limit`, `login_throttle` (Better Auth và chống dò mật khẩu sửa/xóa liên tục).
  - Đếm/tổng hợp: `document_counter`, `inventory_cost` (giá vốn lưu riêng). Role app phải UPDATE được `inventory_cost` khi ghi sổ; ai sửa tay bảng này sẽ bị `npm run inventory:check` bắt (đối chiếu với sổ kho, chạy hằng đêm bằng `inventory-check.yml`).
  - Chứng từ và danh mục: đơn, phiếu nhập, phiếu sửa, kiểm kê, điều chỉnh, `company_profile`, danh mục. Phiếu đã ghi sổ vẫn có trigger khóa riêng (`repair_order_posted_frozen`, `stocktake_done_frozen`); change này không đổi.
- **Không bảng nào có `TRUNCATE`, `REFERENCES`, `TRIGGER`.** Sequence: `USAGE, SELECT` (bảng dùng `GENERATED ALWAYS AS IDENTITY` cần quyền này khi INSERT).
- Đã cân nhắc *chỉ cấp UPDATE/DELETE từng bảng theo danh sách cho phép*: chặt hơn nhưng mỗi bảng mới phải thêm tay, quên là app lỗi. Rủi ro chính của issue là sổ kho và nhật ký; danh sách chặn ngắn, có test chống lệch, an toàn hơn trong thực tế.

### D4. Tạo role ở từng môi trường; seed và E2E dùng role nào (điểm cần chốt 4)

| Môi trường | Owner | Tạo `erp_app` |
|---|---|---|
| Local Docker | `erp` (superuser container) | File `docker/postgres/roles.sql` (idempotent: `CREATE ROLE erp_app LOGIN PASSWORD 'erp_app'` nếu chưa có). Mount vào `docker-entrypoint-initdb.d` cho volume mới; volume cũ chạy `npm run db:roles` (script Node `scripts/db-roles.mts` chạy file đó bằng `DATABASE_URL_MIGRATE`; chỉ nhận host `localhost`/`127.0.0.1`/`postgres` để không tạo role mật khẩu yếu trên Neon). Mật khẩu chỉ dùng local, như `erp`. |
| CI (service container) | `erp` | `npm run db:roles` trước `db:migrate` trong mọi job có Postgres (`ci.yml`, `update-snapshots.yml`); dùng Node nên chạy được cả trong job container Playwright không có `psql`. Chỉ bước migrate có `DATABASE_URL_MIGRATE`, vì bản production build (E2E) từ chối khởi động khi thấy biến này. |
| Neon demo | `neondb_owner` | Một lần, trong SQL Editor trên nhánh **`seed`**: `CREATE ROLE erp_app LOGIN PASSWORD '<mạnh>'`. Nhánh `demo` nhận role khi reset từ `seed`. |
| Neon production | `neondb_owner` | Như demo, trên nhánh gốc production, khi dựng production (#82). |

Seed, script và E2E:

- **App, E2E, `create-director`, `unlock-user`, `inventory-check`, `seed-dev`:** dùng `DATABASE_URL` = role app. Đã rà: không script nào cần quyền ngoài D3 (seed ghi sổ qua `postMovements`, chỉ INSERT). E2E global setup chỉ xóa đơn/phiếu/danh mục `E2E-*` và tài khoản `e2etmp*` chưa có nhật ký — đều là bảng có DELETE; tài khoản có nhật ký đã chỉ bị khóa (UPDATE `user`). Chạy E2E bằng role app chính là bài kiểm tra luồng thật.
- **`seed-demo` trên nhánh `seed`:** chạy bằng `DEMO_SEED_DATABASE_URL` (owner) như hiện nay. Lý do: chạy tay, hiếm, và nhánh `seed` không có secret URL role app; thêm secret chỉ để seed không đáng. Dữ liệu seed là dòng, không tạo đối tượng, nên không ảnh hưởng quyền.
- **`backup.yml`:** `pg_dump` cần đọc cả schema `drizzle` → dùng owner (`PROD_DATABASE_URL_MIGRATE`).

### D5. Dọn bảng trong integration test (điểm cần chốt 5)

Role app không có TRUNCATE, nên `truncateWithLedger` không chạy được bằng role app. Chọn **hai kết nối trong test**:

- `TEST_DATABASE_URL` = role app trên `scaffolding_erp_test`: mọi code cần kiểm (service, route handler, `createAuth`) dùng kết nối này. Cả bộ integration test vì thế kiểm luôn "luồng ghi hiện có chạy được bằng role app".
- `TEST_DATABASE_URL_MIGRATE` = owner trên cùng DB: chỉ helper dọn bảng (`resetAuthTables`, `resetCatalogTables`, `resetInventoryTables`, `truncateWithLedger`) dùng. `TestContext` có thêm `admin: Database`; helper nhận `ctx.admin` thay vì `ctx.db`.
- Giữ nguyên cơ chế `inventory.allow_truncate` + tên DB `*_test` trong trigger: owner vẫn bị trigger chặn TRUNCATE ở DB thật.
- Các test hiện kiểm trigger (`inventory.int.test.ts`, `activity.int.test.ts`, `receiving.int.test.ts`) đang mong lỗi trigger (`P0001`); chạy bằng role app sẽ gặp lỗi quyền (`42501`) trước. Đổi các test đó: chạy bằng `ctx.admin` để giữ kiểm tra trigger (lớp 2), thêm test mới bằng role app mong `42501` (lớp 1).
- `vitest.config.mts`: CI bắt buộc có cả hai biến; local thiếu `TEST_DATABASE_URL_MIGRATE` thì bỏ qua integration kèm thông báo như hiện nay.
- Đã cân nhắc:
  - *Cấp TRUNCATE cho role app khi DB tên `*_test`:* đơn giản, nhưng role app trong test khác production, và không viết được test "role app bị từ chối TRUNCATE". Loại.
  - *Dọn bằng `DELETE` thay `TRUNCATE`:* role app không DELETE được sổ kho/nhật ký, vẫn cần owner. Loại.

### D6. Đường lui SaaS (điểm cần chốt 6)

- Mỗi DB công ty có cặp role riêng: owner chung của cụm có thể dùng chung, nhưng role app riêng (`DB_APP_ROLE=cty_a_app`). Bước cấp quyền chỉ đụng DB nó kết nối và tên role từ biến, không có tên cứng trong SQL.
- `REVOKE CONNECT ON DATABASE … FROM PUBLIC` + `GRANT CONNECT … TO <app>` để role app công ty A không vào được DB công ty B (role trong Postgres là cấp cụm, mặc định ai cũng có `CONNECT`).
- Mọi kết nối vẫn qua `src/db/client.ts` (0.2 #33 mục 2); không thêm pool thứ hai trong app. Kết nối owner chỉ có ở `src/db/migrate.mts` và helper test.

### D7. Workflow và secret

| Workflow | Trước | Sau |
|---|---|---|
| `ci.yml`, `update-snapshots.yml` | `erp` cho mọi thứ | thêm bước tạo `erp_app`; `DATABASE_URL_MIGRATE=postgres://erp:erp@…/scaffolding_erp_test`; `DATABASE_URL`, `TEST_DATABASE_URL` = `erp_app`; `TEST_DATABASE_URL_MIGRATE` = `erp` |
| `deploy-demo.yml` | `DATABASE_URL=DEMO_SEED_DATABASE_URL` cho migrate; `DATABASE_URL=DEMO_DATABASE_URL_UNPOOLED` cho migrate nhánh demo | `DATABASE_URL_MIGRATE=DEMO_SEED_DATABASE_URL` / `DEMO_DATABASE_URL_UNPOOLED`; seed vẫn `DATABASE_URL=DEMO_SEED_DATABASE_URL` |
| `demo-reset.yml` | `inventory:check` bằng `DEMO_DATABASE_URL` | không đổi tên; giá trị secret đổi sang URL `erp_app` |
| `deploy-production.yml` | `DATABASE_URL=PROD_DATABASE_URL_UNPOOLED` | `DATABASE_URL_MIGRATE=PROD_DATABASE_URL_MIGRATE` |
| `backup.yml` | `PROD_DATABASE_URL_UNPOOLED` | `PROD_DATABASE_URL_MIGRATE` |
| `inventory-check.yml` | `PROD_DATABASE_URL` | không đổi; giá trị là URL `erp_app` |

- **GitHub environment `demo`:** giữ 8 secret, không thêm/bớt. `DEMO_SEED_DATABASE_URL`, `DEMO_DATABASE_URL_UNPOOLED` giữ giá trị (owner, đúng vai migrate). Chỉ **đổi giá trị `DEMO_DATABASE_URL`** sang URL pooled của `erp_app` trên nhánh `demo`. Giữ tên để không phải sửa secret trong lúc demo đang chạy; `docs/ops/demo.md` ghi rõ secret nào là owner.
- **Production:** đổi tên `PROD_DATABASE_URL_UNPOOLED` → `PROD_DATABASE_URL_MIGRATE` (production chưa dựng nên đổi không tốn gì, tên rõ nghĩa hơn).
- **Vercel demo:** `DATABASE_URL` = URL pooled của `erp_app` trên nhánh `demo`; xóa `DATABASE_URL_UNPOOLED`; không bao giờ đặt `DATABASE_URL_MIGRATE`.

## Risks / Trade-offs

- [Pooler Neon (PgBouncer) không nhận role tạo bằng SQL] → Neon tài liệu nói role SQL dùng bình thường; task 6.2 thử kết nối URL `-pooler` bằng `erp_app` trên nhánh `seed` **trước** khi đổi Vercel. Không được thì giữ demo trên owner và báo lại.
- [Reset nhánh `demo` mất role nếu `erp_app` chỉ tạo trên `demo`] → luôn tạo trên `seed` (nhánh cha); runbook ghi rõ.
- [Mật khẩu `erp_app` lộ trong lịch sử SQL Editor Neon] → chỉ người có tài khoản Neon thấy; đổi mật khẩu bằng `ALTER ROLE` theo runbook đổi secret.
- [Thiếu quyền ở luồng ít chạy, chỉ lộ ở demo] → integration + E2E đều chạy bằng role app trên CI; D3 cấp UPDATE/DELETE rộng trừ ba bảng nên rủi ro thấp.
- [Người vận hành chạy migrate quên tạo role] → migrate báo lỗi rõ kèm đường dẫn runbook; migration đã áp vẫn giữ (bước cấp quyền chạy sau), chạy lại sau khi tạo role là xong.
- [`REVOKE CONNECT … FROM PUBLIC` chặn công cụ khác (Neon SQL Editor, `pg_dump`)] → các công cụ đó dùng owner (chủ DB, luôn có quyền). Kiểm ở task 6.2.
- [Khôi phục từ tệp sao lưu làm mất quyền của role app] `backup.yml` chạy `pg_dump --no-owner --no-privileges` và runbook khôi phục bằng `pg_restore --no-owner --no-privileges`: sau khi khôi phục, bảng thuộc role chạy restore và `erp_app` không có quyền gì → app lỗi toàn bộ. → Runbook (task 6.1): restore **bằng owner** (`DATABASE_URL_MIGRATE` của DB đích); bảo đảm role `erp_app` có trên DB/nhánh đích (chưa có thì tạo theo D4); chạy ngay `npm run db:migrate` với `DATABASE_URL_MIGRATE` của DB đích để bước cấp quyền chạy lại; rồi mới trỏ app vào. Integration test 2.3 có ca "bảng do owner tạo, chưa có quyền → chạy bước cấp quyền → role app đọc/ghi được". Khôi phục theo thời điểm (PITR) hay nhánh `pre-deploy-*` của Neon chép cả role và quyền nên không bị ảnh hưởng.
- [Đánh đổi] Owner vẫn có quyền tắt trigger. Chấp nhận: owner chỉ nằm ở GitHub secret và trình quản lý mật khẩu, không ở server app.

## Migration Plan

**Local (người phát triển):** `git pull` → `npm run db:roles` → thêm `DATABASE_URL_MIGRATE`, `TEST_DATABASE_URL_MIGRATE`, đổi `DATABASE_URL`, `TEST_DATABASE_URL` sang `erp_app` theo `.env.example` → `npm run db:migrate` và `DATABASE_URL_MIGRATE=<test owner> npm run db:migrate`.

**Demo (đang chạy, làm theo thứ tự):**

1. Neon SQL Editor, nhánh `seed`, role `neondb_owner`: `CREATE ROLE erp_app LOGIN PASSWORD '<mạnh, ≥12 ký tự>'`. App chưa đổi gì nên demo vẫn chạy.
2. Merge PR apply. Vercel deploy code mới; `DATABASE_URL` vẫn là owner nên app vẫn chạy (code mới chỉ chặn `DATABASE_URL_MIGRATE`, không chặn `DATABASE_URL_UNPOOLED`).
3. Actions → **Deploy Demo**, bật `reset_demo_branch`: migrate + cấp quyền trên `seed`, rồi reset `demo` từ `seed` (nhận role + quyền). Dữ liệu người thử trên `demo` mất như reset hằng đêm.
4. Lấy URL pooled của `erp_app` nhánh `demo` (Neon Console → Connect, chọn role `erp_app` hoặc ghép tay host `-pooler`). Thử `psql` theo task 6.2.
5. Vercel: đổi `DATABASE_URL` sang URL đó, xóa `DATABASE_URL_UNPOOLED`, Redeploy. Kiểm `/api/health` 200 và đăng nhập `giamdoc`.
6. GitHub environment `demo`: đổi giá trị `DEMO_DATABASE_URL` sang URL `erp_app`. Chạy tay **Demo Reset** để kiểm `inventory:check` bằng role app.

**Rollback demo:** đổi `DATABASE_URL` trên Vercel về URL owner cũ và Redeploy. Role và quyền để nguyên không hại gì.

**Production (#82):** làm bước 1 trên nhánh gốc production, đặt `PROD_DATABASE_URL_MIGRATE` (owner) và `PROD_DATABASE_URL` (`erp_app`), Vercel production chỉ có `DATABASE_URL` = `erp_app`. Kiểm tay theo issue #96 bước 9.
