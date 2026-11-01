# Tasks

## 1. Environment Configuration

- [ ] 1.1 Mở rộng `envSchema` trong `src/lib/env.ts` hỗ trợ các biến: `DB_POOL_MAX`, `DB_IDLE_TIMEOUT_SECONDS`, `DB_CONNECT_TIMEOUT_SECONDS`, `DB_PREPARE`, `DATABASE_URL_UNPOOLED`.
- [ ] 1.2 Bổ sung thông báo kiểm tra hợp lệ bằng tiếng Việt trong `RULES` của `src/lib/env.ts` mà không in giá trị cấu hình ra console.
- [ ] 1.3 Viết unit test cho `src/lib/env.ts` trong `src/lib/env.test.ts` kiểm tra giá trị mặc định, giá trị hợp lệ tùy chỉnh, và các trường hợp nhập sai (số âm, không phải số, định dạng URL unpooled sai).

## 2. Database Connection Pool

- [ ] 2.1 Mở rộng interface `DatabaseOptions` và cập nhật hàm `createDatabase` trong `src/db/client.ts` để cấu hình `max`, `idle_timeout`, `connect_timeout`, `prepare` trên client của `postgres.js`.
- [ ] 2.2 Cập nhật hàm `getDatabase` trong `src/db/client.ts` để đọc và truyền các tùy chọn cấu hình từ `getEnv()`.
- [ ] 2.3 Viết integration test trong `src/db/client.int.test.ts` xác thực hàm `createDatabase` nhận đúng các tùy chọn pool và kết nối thành công.

## 3. Migration Script Unpooled URL

- [ ] 3.1 Cập nhật `src/db/migrate.mts` ưu tiên đọc `DATABASE_URL_UNPOOLED`, fallback sang `DATABASE_URL`.
- [ ] 3.2 Viết unit/integration test kiểm tra thứ tự ưu tiên chọn URL kết nối của migration script.

## 4. Verification

- [ ] 4.1 Chạy `npx openspec validate serverless-db-connection --strict`.
- [ ] 4.2 Chạy `npm run lint && npm run typecheck && npm test && npx playwright test tests/e2e/auth.spec.ts`.

## Workflow follow-up

- Dừng lại sau khi propose để Giám đốc duyệt trước khi apply.
