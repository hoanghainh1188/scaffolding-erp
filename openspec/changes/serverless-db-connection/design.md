# Design: serverless-db-connection (K8)

## Overview

Thiết kế này giải quyết việc quản lý kết nối cơ sở dữ liệu khi chạy ứng dụng trên nền tảng Serverless (Vercel) kết hợp với cơ sở dữ liệu Neon (sử dụng PgBouncer pooler).

---

## Decisions

### 1. Biến môi trường mới và giá trị mặc định

Các biến môi trường được bổ sung vào `src/lib/env.ts` như sau:

| Biến | Kiểu / Ràng buộc | Mặc định (Local/CI) | Đề xuất trên Vercel Demo/Prod | Mục đích |
|---|---|---|---|---|
| `DB_POOL_MAX` | Số nguyên $\ge 1$ | `10` | `3` – `5` | Giới hạn số kết nối tối đa mỗi instance serverless để tránh cạn kiệt pool kết nối của Neon |
| `DB_IDLE_TIMEOUT_SECONDS` | Số nguyên $\ge 0$ | `undefined` (tắt) | `15` – `20` | Đóng kết nối không hoạt động để trả kết nối về pooler trước khi function bị đóng băng/hủy |
| `DB_CONNECT_TIMEOUT_SECONDS` | Số nguyên $\ge 1$ | `3` | `10` – `15` | Tránh timeout khi Neon compute tự động thức dậy từ trạng thái suspend (cold start ~1–2s) |
| `DB_PREPARE` | Boolean (`true`/`false`/`1`/`0`) | `true` | `true` (hoặc `false` nếu lỗi) | Cho phép tắt prepared statements nếu chế độ transaction pooler gặp vấn đề |
| `DATABASE_URL_UNPOOLED` | Chuỗi Postgres URL hợp lệ | `undefined` | URL trực tiếp (không có `-pooler`) | Dành riêng cho tác vụ migration DDL và script quản trị |

**Lý do chọn mặc định:**
- Khi chạy trên local development hoặc GitHub Actions CI, các biến này không cần cấu hình; hệ thống giữ nguyên hành vi gốc (10 kết nối, connect timeout 3s, prepare bật, không idle timeout).

### 2. Xử lý `prepare` với Neon PgBouncer Pooler

- `postgres.js` mặc định kích hoạt prepared statements với tên tự sinh.
- Các phiên bản mới của PgBouncer hỗ trợ prepared statements trong transaction pooling mode nếu được cấu hình đúng.
- Tuy nhiên, trong một số cấu hình pooler khắt khe, prepared statements có thể gây lỗi `prepared statement "..." does not exist`.
- **Giải pháp:** Cung cấp biến `DB_PREPARE` cho phép bật/tắt linh hoạt. Trong `src/db/client.ts`, truyền `prepare: options.prepare ?? env.DB_PREPARE ?? true` vào cấu hình client của `postgres.js`.

### 3. URL Unpooled cho `src/db/migrate.mts`

- Migration Drizzle sử dụng advisory locks và thực thi các câu lệnh DDL định nghĩa bảng/chỉ mục. Một số lệnh DDL không tương thích với chế độ transaction pooling của PgBouncer.
- **Giải pháp:** Trong `src/db/migrate.mts`:
  ```ts
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  ```
  Nếu có `DATABASE_URL_UNPOOLED`, migration script sẽ ưu tiên kết nối trực tiếp vào Neon compute endpoint thay vì qua `-pooler`.

### 4. Sử dụng `idle_timeout` của `postgres.js` thay vì `@vercel/functions attachDatabasePool`

- `@vercel/functions` cung cấp helper `attachDatabasePool` để lắng nghe vòng đời serverless function và đóng pool khi function kết thúc.
- Tuy nhiên:
  - Dự án có quy tắc hạn chế thêm thư viện mới khi chưa thật sự cần thiết (`CLAUDE.md`).
  - Thư viện `postgres.js` đã tích hợp sẵn tùy chọn `idle_timeout` (tính bằng giây). Khi một kết nối không có truy vấn trong `idle_timeout` giây, driver tự động giải phóng kết nối socket về máy chủ.
  - Trên Vercel Fluid Compute, một instance có thể phục vụ nhiều request liên tiếp. Việc giữ kết nối trong vài giây (`idle_timeout: 15–20s`) giúp tái sử dụng kết nối hiệu quả cho các request liền kề, đồng thời tự động thu hồi khi không còn lưu lượng truy cập.
- **Kết luận:** Tận dụng `idle_timeout` của `postgres.js`, không cài đặt thêm package `@vercel/functions`.

### 5. Kiểm tra tính hợp lệ trong `src/lib/env.ts`

- Các biến số (`DB_POOL_MAX`, `DB_IDLE_TIMEOUT_SECONDS`, `DB_CONNECT_TIMEOUT_SECONDS`) được chuyển đổi an toàn qua `z.coerce.number().int()`.
- Biến boolean `DB_PREPARE` hỗ trợ các giá trị chuỗi phổ biến: `"true"`, `"false"`, `"1"`, `"0"`, `"yes"`, `"no"`.
- Mọi thông báo lỗi cấu hình đều sử dụng tiếng Việt rõ ràng, chỉ thông báo tên biến và quy tắc định dạng, tuyệt đối không in giá trị cấu hình ra console hoặc log để đảm bảo an toàn bảo mật.

---

## Architecture Diagram

```
┌────────────────────────────────────────────────────────┐
│ Vercel Serverless Function (Next.js App)              │
│                                                        │
│  getDatabase()                                         │
│    │                                                   │
│    ▼                                                   │
│  createDatabase(url, {                                 │
│    max: DB_POOL_MAX (e.g. 3),                          │
│    idle_timeout: DB_IDLE_TIMEOUT_SECONDS (e.g. 15),    │
│    connect_timeout: DB_CONNECT_TIMEOUT_SECONDS (10s),  │
│    prepare: DB_PREPARE (true/false)                    │
│  })                                                    │
└──────────────────────────┬─────────────────────────────┘
                           │ DATABASE_URL (-pooler)
                           ▼
               ┌───────────────────────┐
               │ Neon PgBouncer Pooler │
               └───────────┬───────────┘
                           │
                           ▼
               ┌───────────────────────┐
               │ Neon Postgres Compute │
               └───────────▲───────────┘
                           │
                           │ DATABASE_URL_UNPOOLED (direct)
┌──────────────────────────┴─────────────────────────────┐
│ Deployment / CI / Migration Script                     │
│   npm run db:migrate (migrate.mts)                     │
└────────────────────────────────────────────────────────┘
```
