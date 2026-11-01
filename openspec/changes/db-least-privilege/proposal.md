# Proposal: db-least-privilege (K12)

## Why

Rà soát bảo mật 01/11/2026: app kết nối DB bằng **role chủ bảng** (role chạy migration). Role này tự tắt được trigger "chỉ ghi thêm" (`ALTER TABLE … DISABLE TRIGGER`) rồi sửa/xóa sổ kho `inventory_ledger` và nhật ký `activity_log`. Lộ `DATABASE_URL` hoặc có lỗi chèn SQL là mất cả số liệu kho lẫn dấu vết. Phải xong trước production (#82).

## What Changes

- Tách 2 role DB cho mỗi cơ sở dữ liệu:
  - **Role owner** (migrate): chủ bảng, chỉ dùng khi chạy migration, sao lưu và việc vận hành.
  - **Role app** (`erp_app`, đổi tên được bằng `DB_APP_ROLE`): role đăng nhập của ứng dụng, chỉ có quyền đọc/ghi dữ liệu. Không DDL, không TRUNCATE, không UPDATE/DELETE trên bảng chỉ ghi thêm (`inventory_ledger`, `activity_log`, `scrap_price`).
- **BREAKING (vận hành):** biến mới `DATABASE_URL_MIGRATE` (URL role owner, kết nối trực tiếp). `npm run db:migrate` chỉ đọc biến này; thiếu thì dừng với lỗi rõ. `DATABASE_URL` từ nay là URL role app. Bỏ `DATABASE_URL_UNPOOLED` khỏi app.
- Ở production, app **từ chối khởi động** nếu thấy `DATABASE_URL_MIGRATE` trên server app (URL owner không được nằm ở server app).
- Bước cấp quyền chạy lại được, tự chạy ở cuối mỗi lần `db:migrate`; bảng mới tự được cấp quyền. Sau khi cấp, migrate tự kiểm tra role app không quá quyền; quá quyền thì báo lỗi.
- Postgres local (Docker) và CI tạo sẵn role `erp_app`. Neon (demo, production) tạo role app bằng SQL một lần, có hướng dẫn.
- Integration test chạy code bằng role app; dọn bảng bằng kết nối owner riêng (`TEST_DATABASE_URL_MIGRATE`).
- Cập nhật workflow (`ci.yml`, `update-snapshots.yml`, `deploy-demo.yml`, `demo-reset.yml`, `deploy-production.yml`, `backup.yml`, `inventory-check.yml`), `.env.example`, `docs/ops/demo.md`, `docs/ops/production.md`, `README.md`, `CLAUDE.md`.

## Capabilities

### New Capabilities

- `database-access`: role kết nối DB, quyền tối thiểu của role app, cấu hình URL migrate/app, kiểm tra quyền sau migration.

### Modified Capabilities

(không có — các spec `inventory-ledger`, `activity-log` giữ nguyên yêu cầu "chỉ ghi thêm"; change này thêm lớp chặn ở mức quyền DB.)

## Màn hình và giai đoạn

- Không đổi màn hình nào (không có D/M liên quan). Giai đoạn: **[MVP]**, bắt buộc trước production.

## Ảnh hưởng tới Sổ kho và giá vốn

- **Không đổi số liệu đã có.** Không sửa dòng sổ kho, không đổi cách tính giá vốn. Chỉ đổi quyền của role kết nối.
- Trigger chỉ ghi thêm giữ nguyên (lớp chặn thứ hai, chặn cả role owner khi lỡ tay).

## Ngoài phạm vi

- Row-level security, mã hóa cột, tách schema.
- Role chỉ đọc riêng cho báo cáo/BI (làm khi có nhu cầu).
- Tự xoay vòng mật khẩu DB (vẫn làm tay theo runbook đổi secret).
- Tự tạo role trên Neon bằng workflow (tạo bằng SQL một lần, làm tay).
- Production thật (#82): change này chỉ chuẩn bị workflow và runbook; tạo role trên Neon production làm khi dựng production.

## Impact

- Code: `src/db/migrate.mts`, bước cấp quyền mới cạnh `src/db/`, `src/lib/env.ts`, `src/test/` (helper dọn bảng), `tests/e2e/global-setup.ts` (chỉ kiểm tra, không đổi quyền cần dùng), `docker/postgres/`, `package.json` (script `db:roles`).
- Migration: **không thêm file SQL** trong `drizzle/` (quyền cấp bằng bước chạy lại được, xem design D2).
- Hạ tầng: Vercel demo đổi `DATABASE_URL` sang role app, xóa `DATABASE_URL_UNPOOLED`; GitHub environment `demo` giữ 8 secret, đổi giá trị `DEMO_DATABASE_URL`; production đổi tên secret `PROD_DATABASE_URL_UNPOOLED` → `PROD_DATABASE_URL_MIGRATE`.
- Tài liệu: quyết định ghi vào `docs/requirements.md` 0.2 #36 (01/11/2026).
- Issue: Refs #96; phối hợp #81 (deploy production), #82.
