# Đo tốc độ Báo cáo quản trị (D15)

Script `npm run bench:reports` (change `management-reports`, design D4) đo từng khối của D15 hai lần, cho **kỳ tháng này** và **kỳ năm nay**.

## Cách chạy

Script chạy `bench:dashboard` trước. Bước này dùng chung guard: **chỉ nhận DB tên `*_bench`**, không bao giờ DB dev hay DB test (xem `docs/ops/dashboard-bench.md`). Nó chạy migration rồi sinh dữ liệu: 300 hợp đồng thuê, một năm phiếu xuất và phiếu thu hồi. Sau đó script đo D15 trên cùng DB.

```bash
BENCH_DATABASE_URL=postgres://erp:<mật khẩu owner>@localhost:5432/scaffolding_erp_bench \
BENCH_APP_DATABASE_URL=postgres://erp_app:<mật khẩu app>@localhost:5432/scaffolding_erp_bench \
npm run bench:reports
```

- DB đo đã có dữ liệu (ví dụ đã chạy `bench:dashboard`): thêm `BENCH_SKIP_SEED=1`. Không đặt biến này thì script sinh lại và báo trùng.
- Muốn sinh dữ liệu mới: xóa DB, tạo lại DB trống.

## Các khối đo

| Khối | Đọc gì |
|---|---|
| Doanh thu (sổ D1) | `revenueBook` cho kỳ trước + năm, đến hôm nay |
| Giá vốn (sổ kho) | Hai truy vấn gom nhóm: sổ kho theo (tháng, loại chứng từ, loại dòng) và phiếu sửa |
| Hàng cho thuê theo ngày | Số dư đầu + biến động theo ngày (Mới, Tốt) + hao hụt của phiếu thu hồi |
| Xếp hạng (gồm sổ) | Sổ doanh thu + kg đã giao + số hợp đồng |
| Cả trang | `buildReport` (mọi khối, chạy song song) |
| Excel (cả trang) | `buildReport` + `reportWorkbook` |

## Kết quả lần đầu (06/11/2026, MacBook, Postgres 17 Docker)

Dữ liệu của `bench:dashboard`: 300 hợp đồng thuê, 431 chứng từ trong 360 ngày, **chưa kỳ nào chốt** (mọi tháng tính lại từ sổ kho, trường hợp nặng nhất).

| Khối | Tháng, lần 1 | Tháng, lần 2 | Năm, lần 1 | Năm, lần 2 |
|---|---|---|---|---|
| Doanh thu (sổ D1) | 248 ms | 184 ms | 181 ms | 193 ms |
| Giá vốn (sổ kho) | 7 ms | 8 ms | 6 ms | 4 ms |
| Hàng cho thuê theo ngày | 10 ms | 6 ms | 8 ms | 8 ms |
| Xếp hạng (gồm sổ) | 209 ms | 188 ms | 201 ms | 195 ms |
| **Cả trang** | **205 ms** | **195 ms** | **259 ms** | **212 ms** |
| Excel (cả trang) | 204 ms | 197 ms | 213 ms | 224 ms |

Mục tiêu design D4: kỳ năm < 2,5 s, kỳ tháng < 1,5 s. Cả hai đạt; trang chưa cần chia khối vào `Suspense`. Phần nặng là tính lại tiền thuê các kỳ chưa chốt (cùng chi phí với khối Doanh số của D1). Truy vấn sổ kho dùng chỉ mục `inventory_ledger_business_date_idx`.
