# Đo tốc độ Tổng quan (D1)

Script `npm run bench:dashboard` (change `dashboard-basic`, design D2) sinh 300 hợp đồng thuê và một năm phiếu xuất, phiếu thu hồi qua đúng service của app, rồi đo từng khối của D1 hai lần.

## Không bao giờ chạy trên DB dev

Sổ kho chỉ ghi thêm, không xóa được. Script **từ chối chạy** (thoát mã 1) khi:

- thiếu `BENCH_DATABASE_URL` (owner) hoặc `BENCH_APP_DATABASE_URL` (`erp_app`);
- tên DB trong hai URL khác nhau, hoặc **không kết thúc bằng `_bench`**;
- tên DB trùng DB của `DATABASE_URL`, `DATABASE_URL_MIGRATE`, `TEST_DATABASE_URL` hoặc `TEST_DATABASE_URL_MIGRATE`.

Script không đọc `DATABASE_URL`.

## Các bước

1. Tạo DB đo **mới, trống** (Postgres trong Docker của repo):

   ```bash
   docker compose exec postgres createdb -U erp scaffolding_erp_bench
   ```

2. Chạy (cùng user, mật khẩu như `.env`, chỉ đổi tên DB):

   ```bash
   BENCH_DATABASE_URL=postgres://erp:<mật khẩu owner>@localhost:5432/scaffolding_erp_bench \
   BENCH_APP_DATABASE_URL=postgres://erp_app:<mật khẩu app>@localhost:5432/scaffolding_erp_bench \
   npm run bench:dashboard
   ```

   Script tự tạo role `erp_app`, chạy migration, sinh dữ liệu rồi đo. `BENCH_CONTRACTS=500` đổi số hợp đồng; `BENCH_SKIP_SEED=1` chỉ đo lại trên dữ liệu đã sinh (sinh lại thì phải xóa và tạo DB mới).

3. Xóa khi xong:

   ```bash
   docker compose exec postgres dropdb -U erp scaffolding_erp_bench
   ```

## Kết quả lần đầu (06/11/2026, MacBook, Postgres 17 Docker)

300 hợp đồng thuê, 431 chứng từ trong 360 ngày, **chưa kỳ nào chốt** (mọi tháng tính lại từ sổ kho: trường hợp nặng nhất).

| Khối | Lần 1 | Lần 2 |
|---|---|---|
| Chờ duyệt | 26 ms | 8 ms |
| Công nợ quá hạn | 10 ms | 4 ms |
| Hàng ở ngoài | 4 ms | 4 ms |
| Tồn kho | 2 ms | 1 ms |
| Công trình rủi ro | 21 ms | 14 ms |
| Doanh số (sổ + tóm tắt) | 184 ms | 172 ms |
| Top 5 (gồm sổ) | 188 ms | 179 ms |

Mục tiêu design D2: phần đầu trang < 1 s, khối doanh số < 2,5 s. Trang dùng chung một lần đọc sổ cho Doanh số và Top 5 (`cache` theo request).
