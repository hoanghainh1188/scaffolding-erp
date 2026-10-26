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
npm run db:migrate       # chạy migration trong drizzle/ vào DATABASE_URL
npm run dev              # http://localhost:3000
```

### Cơ sở dữ liệu

- `npm run db:up` tạo 2 DB trong cùng container:
  - `scaffolding_erp` — dùng khi chạy app (`DATABASE_URL`).
  - `scaffolding_erp_test` — chỉ cho integration test (`TEST_DATABASE_URL`).
- Cổng mặc định `5432`. Máy đã có Postgres chiếm cổng này thì đặt `POSTGRES_PORT=5433` trong `.env` và sửa cổng trong 2 URL.
- `npm run db:down` tắt container, **giữ** dữ liệu. Muốn xoá sạch: `docker compose down -v`.
- Thêm bảng: sửa `src/db/schema/`, chạy `npm run db:generate`, xem lại file SQL mới trong `drizzle/`, rồi `npm run db:migrate`. Không dùng `drizzle-kit push`.
- `npm run db:studio` mở Drizzle Studio để xem dữ liệu.

### Test

- `npm test` — unit, component và integration. Integration cần `TEST_DATABASE_URL`; thiếu thì được bỏ qua kèm thông báo (trên CI thì bắt buộc).
- `npm run test:int` — chỉ integration test. Chạy migration vào DB test trước nếu test cần bảng: `DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate`.
- `npm run test:e2e` — Playwright trên Microsoft Edge. Máy không có Edge: `PW_CHANNEL=chromium npm run test:e2e`.

## Quy trình phát triển

Dùng [OpenSpec](https://github.com/Fission-AI/OpenSpec) với Claude Code:

```bash
npm install -g @fission-ai/openspec@latest
```

Trong Claude Code: `/opsx:explore` → `/opsx:propose` → duyệt → `/opsx:apply` → `/opsx:archive`.

Change đầu tiên: `/opsx:propose setup-project`.
