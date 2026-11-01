# Proposal: serverless-db-connection (K8)

Cấu hình pool kết nối cơ sở dữ liệu cho môi trường Serverless (Vercel) và Postgres Pooler (Neon PgBouncer) mà không làm thay đổi hành vi nghiệp vụ hiện tại.

Refs: #75

## Motivation

Hiện tại `src/db/client.ts` khởi tạo `postgres` (postgres.js) với cấu hình cố định:
- Mặc định 10 kết nối mỗi pool.
- Không có `idle_timeout` (kết nối rảnh không tự đóng).
- `connect_timeout` cố định 3 giây.
- Luôn bật prepared statement (`prepare: true`).
- Migration script (`src/db/migrate.mts`) chỉ đọc `DATABASE_URL`.

Khi triển khai lên Vercel Serverless + Neon:
- Nhiều instance Fluid Compute có thể mở đồng thời, vượt quá hạn mức kết nối của Neon và giữ compute Neon luôn thức (lãng phí tài nguyên).
- Khi Neon compute tự động ngủ sau một thời gian không hoạt động (auto-suspend), request đầu tiên đánh thức Neon có thể mất 1–2 giây, dễ chạm ngưỡng `connect_timeout: 3s`.
- Migration DDL cần kết nối trực tiếp (`DATABASE_URL_UNPOOLED`), không nên đi qua PgBouncer transaction pooler.

## Proposed Changes

1. **Cấu hình môi trường (`src/lib/env.ts`)**:
   - Thêm các biến cấu hình tùy chọn:
     - `DB_POOL_MAX`: số kết nối tối đa trong pool (số nguyên dương, mặc định 10).
     - `DB_IDLE_TIMEOUT_SECONDS`: thời gian đóng kết nối rảnh (số nguyên không âm, mặc định `undefined` - không tự đóng ở local/CI).
     - `DB_CONNECT_TIMEOUT_SECONDS`: thời gian chờ kết nối (số nguyên dương, mặc định 3 giây).
     - `DB_PREPARE`: cho phép bật/tắt prepared statements (boolean, mặc định `true`).
     - `DATABASE_URL_UNPOOLED`: URL kết nối trực tiếp tới cơ sở dữ liệu cho migration (tùy chọn, dạng `postgres://...`).
   - Kiểm tra hợp lệ bằng Zod với thông báo lỗi tiếng Việt, không để lộ giá trị nhạy cảm.

2. **Khởi tạo Database Client (`src/db/client.ts`)**:
   - `DatabaseOptions` mở rộng cho phép truyền `max`, `idleTimeoutSeconds`, `connectTimeoutSeconds`, `prepare`.
   - `createDatabase(url, options)` áp dụng các tùy chọn này vào `postgres(url, ...)`.
   - `getDatabase()` đọc cấu hình từ `getEnv()` để thiết lập pool phù hợp cho môi trường hiện tại.

3. **Migration Script (`src/db/migrate.mts`)**:
   - Ưu tiên sử dụng `process.env.DATABASE_URL_UNPOOLED`, fallback sang `process.env.DATABASE_URL`.
   - Giúp việc chạy migration trên CI/CD và deployment pipelines kết nối trực tiếp tới database mà không bị cản trở bởi transaction pooler.

## Impact & Compatibility

- **Không đổi hành vi nghiệp vụ**: Toàn bộ query Drizzle ORM và các repository/service giữ nguyên.
- **Tương thích ngược**: Khi không thiết lập các biến môi trường mới, ứng dụng giữ nguyên 100% cấu hình và hành vi hiện tại trên local development và CI.
- **Không thêm dependency**: Tận dụng triệt để các tùy chọn có sẵn của `postgres.js` (`idle_timeout`, `max`, `connect_timeout`, `prepare`), không cần cài đặt thêm `@vercel/functions`.
