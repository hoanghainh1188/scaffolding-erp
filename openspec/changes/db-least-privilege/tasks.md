# Tasks: db-least-privilege (K12)

## 1. Role app trên Postgres local và CI

- [x] 1.1 Viết `docker/postgres/roles.sql` (idempotent, tạo `erp_app` LOGIN mật khẩu `erp_app` nếu chưa có); mount vào `docker-entrypoint-initdb.d` trong `docker-compose.yml`; thêm script `npm run db:roles` cho volume cũ. Kiểm: `npm run db:roles` chạy 2 lần không lỗi, `psql -U erp_app` vào được `scaffolding_erp`.
- [x] 1.2 Cập nhật `.env.example`: `DATABASE_URL`/`TEST_DATABASE_URL` dùng `erp_app`, thêm `DATABASE_URL_MIGRATE`, `TEST_DATABASE_URL_MIGRATE` (owner `erp`), `DB_APP_ROLE` (tùy chọn, ghi chú mặc định). Kiểm: đọc lại khớp D1, D5.

## 2. Bước cấp quyền và migrate bằng owner

- [x] 2.1 Viết `src/db/grants.ts`: hằng `APPEND_ONLY_TABLES`, hàm cấp quyền theo D2 bước 1–6 trong một transaction, hàm kiểm tra bước 7 trả danh sách quyền sai. Unit test phần dựng câu lệnh (tên role được quote, không ghép chuỗi thô) và thông báo lỗi.
- [x] 2.2 Đổi `src/db/migrate.mts`: đọc `DATABASE_URL_MIGRATE` (không lùi về `DATABASE_URL`/`DATABASE_URL_UNPOOLED`), `DB_APP_ROLE` (mặc định `erp_app`); sau migrate gọi cấp quyền + kiểm tra; lỗi in tên biến/quyền, không in URL. Cập nhật `src/db/migrate.test.ts`: thiếu `DATABASE_URL_MIGRATE` → lỗi có tên biến, chỉ có `DATABASE_URL` vẫn lỗi.
- [x] 2.3 Integration test bước cấp quyền (owner trên DB test): chạy hai lần cho cùng kết quả; `GRANT UPDATE ON inventory_ledger TO erp_app` tay rồi chạy lại → bị thu hồi; tạo bảng tạm mới → được cấp `SELECT/INSERT/UPDATE/DELETE`; giống sau khi khôi phục sao lưu: owner `REVOKE ALL` khỏi `erp_app` trên mọi bảng → role app đọc `item` bị từ chối → chạy bước cấp quyền → role app đọc `item` và ghi phiếu nhập được; role app không tồn tại (`DB_APP_ROLE=khong_co`) → lỗi nêu tên role; `erp_app` không còn `CONNECT` qua `PUBLIC`.
- [x] 2.4 Test chống lệch: đọc `pg_trigger` các bảng có trigger gọi hàm `*_append_only`, so bằng `APPEND_ONLY_TABLES` (hiện là `inventory_ledger`, `activity_log`, `scrap_price`).

## 3. Cấu hình môi trường của app

- [x] 3.1 `src/lib/env.ts`: bỏ `DATABASE_URL_UNPOOLED`; ở `production` có `DATABASE_URL_MIGRATE` thì báo `ConfigError` nêu tên biến, không in giá trị; dev/test không chặn. Unit test cả ba trường hợp (production có biến → lỗi; development có biến → chạy; production không có → chạy).

## 4. Integration test chạy bằng role app

- [x] 4.1 `src/test/auth.ts`, `catalog.ts`, `inventory.ts`: `TestContext` có thêm `admin` (kết nối `TEST_DATABASE_URL_MIGRATE`); `truncateWithLedger` và các hàm `reset*` dùng `admin`; đóng cả hai kết nối khi xong. Sửa các file `*.int.test.ts` đang gọi `truncateWithLedger(db, …)` với `db` riêng cho đúng kết nối owner.
- [x] 4.2 `vitest.config.mts`: CI bắt buộc cả `TEST_DATABASE_URL` và `TEST_DATABASE_URL_MIGRATE`; local thiếu một trong hai thì bỏ qua integration kèm thông báo nêu tên biến. Kiểm: `npm test` không có biến → cảnh báo, không đỏ.
- [x] 4.3 Test trigger hiện có (`src/db/schema/inventory.int.test.ts`, `activity.int.test.ts`, `receiving.int.test.ts`) chuyển phần UPDATE/DELETE/TRUNCATE sang chạy bằng `ctx.admin` để vẫn kiểm trigger (`P0001`).
- [x] 4.4 Test mới `src/db/privileges.int.test.ts` bằng role app, mỗi lệnh mong mã `42501`: `UPDATE`/`DELETE`/`TRUNCATE` trên `inventory_ledger`, `activity_log`, `scrap_price`; `TRUNCATE purchase_order`; `ALTER TABLE inventory_ledger DISABLE TRIGGER …`; `DROP TABLE activity_log`; `CREATE TABLE public.x (id int)`; `SET session_replication_role = replica`; `select current_user` = `erp_app`; không bảng nào có chủ là `erp_app`.
- [x] 4.5 Chạy `npm run test:int` với role app: mọi luồng ghi hiện có (nhập hàng, sửa chữa, kiểm kê, điều chỉnh giá trị, danh mục, đăng nhập, nhật ký) xanh. Thiếu quyền ở đâu thì sửa D3/grants, không cấp thêm TRUNCATE/DDL.

## 5. Workflow CI và E2E

- [x] 5.1 `ci.yml`, `update-snapshots.yml`: bước `npm run db:roles` trước migrate; `DATABASE_URL_MIGRATE` (owner `erp`) chỉ ở bước migrate, `TEST_DATABASE_URL_MIGRATE` (owner), `DATABASE_URL`, `TEST_DATABASE_URL` (`erp_app`) cho mọi job có Postgres (kể cả job chạy trong container dùng host `postgres`).
- [x] 5.2 `tests/e2e/global-setup.ts` và Playwright webServer chạy bằng `DATABASE_URL` = `erp_app`; chạy `npm run test:e2e` local xanh (global setup xóa đơn/tài khoản E2E được bằng role app).
- [x] 5.3 `deploy-demo.yml`: migrate dùng `DATABASE_URL_MIGRATE` từ `DEMO_SEED_DATABASE_URL` và `DEMO_DATABASE_URL_UNPOOLED`; seed giữ `DATABASE_URL=DEMO_SEED_DATABASE_URL`. `deploy-production.yml`, `backup.yml`: đổi sang secret `PROD_DATABASE_URL_MIGRATE` (migrate dùng biến `DATABASE_URL_MIGRATE`). `demo-reset.yml`, `inventory-check.yml`: giữ tên secret, sửa chú thích là URL role app. Kiểm: `actionlint` (nếu có) hoặc đọc lại, CI của PR xanh.

## 6. Tài liệu và chuyển đổi demo

- [x] 6.1 Cập nhật `docs/ops/demo.md` (tạo `erp_app` bằng SQL trên nhánh `seed`, mục "Chuyển demo sang role app" theo Migration Plan, bảng secret ghi rõ secret nào là owner), `docs/ops/production.md` (biến, secret `PROD_DATABASE_URL_MIGRATE`, đổi mật khẩu `erp_app` bằng `ALTER ROLE`; mục khôi phục từ tệp sao lưu: `pg_restore` bằng owner, bảo đảm có `erp_app` trên DB đích, chạy ngay `npm run db:migrate` với `DATABASE_URL_MIGRATE` của DB đích rồi mới trỏ app vào), `README.md` (cài đặt local, `db:roles`), `CLAUDE.md` (bảng lệnh + quy ước: app chạy bằng role app, migrate bằng `DATABASE_URL_MIGRATE`, bảng chỉ ghi thêm mới phải vào `APPEND_ONLY_TABLES`). Quyết định đã ghi ở `docs/requirements.md` 0.2 #36 (trong PR propose); sửa nếu apply làm khác.
- [ ] 6.2 Kiểm tay trên Neon nhánh `seed` sau khi tạo `erp_app` và chạy Deploy Demo: `psql` bằng URL pooled `erp_app` → `UPDATE inventory_ledger …`, `DELETE FROM activity_log …`, `ALTER TABLE inventory_ledger DISABLE TRIGGER …`, `SET session_replication_role = replica` đều bị từ chối; `select count(*) from item` chạy được; SQL Editor (owner) vẫn vào được. Ghi kết quả vào PR.
- [ ] 6.3 Chuyển demo theo Migration Plan bước 4–6; kiểm `/api/health` 200, đăng nhập `giamdoc`, tạo một phiếu nhập trên demo, Demo Reset xanh với `DEMO_DATABASE_URL` mới. Chưa làm được trước merge thì ghi "làm sau, theo dõi ở #33" và thêm mục vào issue #33.

## 7. Kiểm tra cuối

- [ ] 7.1 `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate db-least-privilege --strict` đều xanh.

## Workflow follow-up

- Kiểm tay trên staging/production theo issue #96 bước 9 khi dựng production (#82).
- Sau merge: `/opsx:archive db-least-privilege` → PR `Closes #96`.
