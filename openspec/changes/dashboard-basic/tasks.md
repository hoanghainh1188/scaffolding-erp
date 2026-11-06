## 1. Chỉ mục DB

- [x] 1.1 Migration chỉ thêm chỉ mục (design D2): `billing_period_month_idx (month)`, `delivery_note_posted_date_idx (business_date) WHERE status = 'POSTED'`, `inventory_ledger_movement_date_idx (movement, business_date)`; khai báo trong `src/db/schema/*.ts`, sinh bằng `npm run db:generate`, chạy `npm run db:migrate`
- [x] 1.2 Integration test: ba chỉ mục tồn tại (`pg_indexes`), migration không đổi số dòng của bảng nào

## 2. Hàm thuần `src/domain/dashboard.ts` + unit test (trước giao diện)

- [x] 2.1 Hằng số `RISK_LOSS_DAYS = 30` và các nhãn dấu hiệu ở một chỗ; `isRecentLoss(lossDate, today)` (≤ 30 ngày), `isPastEnd(endDate, today, onSitePieces)`; test ranh giới 30 / 31 ngày, đúng ngày kết thúc, không có ngày kết thúc, còn 0 cái
- [x] 2.2 `dailyRevenue(statement, adjustmentDays)`: chia dòng `RENT` theo ngày tính (bỏ ngày nghỉ, phần dư lớn nhất), `MINIMUM` vào ngày trả, `ADJUSTMENT` vào **ngày lập dòng** (giờ VN, kẹp vào trong kỳ, design D2), cước vào ngày giao; test: chia đều, ngày nghỉ, phần lẻ 100.000 ₫ / 3 ngày, đổi giá giữa tháng, trả giữa tháng, số lượng 0, **tổng các ngày = `beforeVat`** (kiểm trên nhiều bảng kê dựng tay)
- [x] 2.2a Test dòng điều chỉnh: kỳ mở (xem ở hai ngày khác nhau) và kỳ đã chốt ra **cùng một ngày**; lập trước đầu kỳ / sau cuối kỳ thì kẹp; dòng âm làm ngày đó **âm** (không cắt về 0) và tổng tháng vẫn = `beforeVat`
- [x] 2.3 `dailyRevenueOfClosed(lines, freight, holidays, adjustmentDays)` cho bảng chụp `billing_period_line` / `billing_period_freight` (dòng điều chỉnh nối `adjustment_id` → ngày lập); test tổng = `rent + adjustment + freight` của kỳ; test **số ngày đếm lại (Từ → Đến, bỏ ngày nghỉ) = `charged_days`** đã chụp; test lệch (ngày nghỉ hiện tại khác lúc chụp): chia theo `charged_days` ngày lịch đầu tiên, tổng đúng tiền đã chụp, có cảnh báo
- [x] 2.4 `monthTotals(days)` gom Thuê / Bán theo tháng (giữ số âm), cờ tạm tính; `topCustomers(rows, by, 5)` (bằng nhau xếp theo tên, bỏ 0); test
- [x] 2.5 `onSiteTotals(lines)` (design D8): cái chỉ cộng mã `PIECE`, kg cộng mọi mã (`KG` trực tiếp, mã khác × trọng lượng chuẩn); test một công trình có mã cái, mã mét, mã kg (100 cái, 860 kg) và công trình chỉ có mã cây (0 cái, vẫn đếm công trình)
- [x] 2.5a `regionTotals(sites)`: gom cái, kg theo khu vực từ `regionOf`, dòng "Chưa rõ", dòng Cộng; `tonsText(kg)` 1 chữ số lẻ; test
- [x] 2.6 `riskBySite(contracts)`: gom hợp đồng rủi ro theo công trình, số công trình; test hai hợp đồng một công trình
- [x] 2.7 `greeting(name, role, count)`: ba dạng câu (Giám đốc, vai trò khác, 0 việc); test

## 3. Đọc dữ liệu `src/lib/dashboard/` + integration test

- [x] 3.1 `loadBillingSources(db, contractIds)` trong `src/lib/billing/` (đọc theo lô, dựng `BillingSource` như `loadBillingSource`); test: với mỗi hợp đồng kết quả **bằng** `loadBillingSource`
- [x] 3.2 `revenueDays(db, from, to, today)`: thuê (kỳ đã chốt đọc bảng chụp, kỳ mở `statementOf`) + bán (`deliveredAmounts` phiếu bán đã ghi sổ) + đền bù / mua lại đã duyệt theo ngày duyệt; integration test:
  - tổng ngày của tháng đang chạy bằng `beforeVat` của bảng kê D7 (`contractStatement`)
  - tháng đã qua chưa chốt tính **đến hết tháng** (không đến hôm nay), bằng D7 của kỳ đó, có cờ tạm tính
  - dòng điều chỉnh lập trong kỳ mở rồi chốt kỳ: số theo ngày trước và sau khi chốt bằng nhau từng ngày
  - tháng đã chốt bằng Σ (`total_amount − vat_amount`) của `billing_period` tháng đó, kể cả khi sổ kho tính lại ra số khác
  - bán theo ngày giao; phiếu Đang nhặt / Đã hủy không tính
  - đền bù, mua lại đã duyệt không cộng vào thuê / bán; chưa duyệt không tính
- [x] 3.3 `pendingApprovals(db, viewer)`: 5 loại theo design D1, sắp theo lúc gửi; số tiền như màn gốc; integration test từng vai trò (Giám đốc, Kế toán, Kinh doanh "Cả hai" / "Chỉ thuê" / "Chỉ bán"); **số đếm = số dòng** dùng cho câu chào
- [x] 3.4 `overdueSummary(db, today)` gọi `customerBalances` (`filter: "overdue"`); test khớp ô Quá hạn của D14 và ranh giới hạn trả theo ngày Việt Nam
- [x] 3.5 `onSiteSummary(db)`: cái, kg theo công trình và khu vực qua `onSiteTotals`; test với dữ liệu có mã cái, mã mét, mã kg: tổng cái = cột "Tại công trình" của `getStockOverview` **lọc mã đơn vị cái** và = Σ `onSiteByItem` của mọi hợp đồng trên các mã đó (D6); mã mét không vào số cái nhưng vào tấn; Kinh doanh "Chỉ bán" nhận cùng số
- [x] 3.6 `stockByCondition(db)`: gom bãi + xưởng theo tình trạng và công trình; test khớp từng mã với `getStockOverview`
- [x] 3.7 `riskySites(db, viewer, today)`: ba dấu hiệu (nợ quá hạn theo khoản của hợp đồng, `LOSS_OUT` trong 30 ngày, quá ngày kết thúc của bản đang áp dụng mà còn hàng); test từng dấu hiệu, ranh giới, hợp đồng không ngày kết thúc, hai hợp đồng một công trình, Kinh doanh ngoài `canContract` bị bỏ, không có số tiền cho Kinh doanh
- [x] 3.8 `topCustomersOfYear(db, year, today)` theo doanh thu và theo kg (0.2 #95: kg đã giao trong năm, không trừ hàng trả); test doanh thu năm = Σ doanh số tháng của nhà thầu; test hàng trả không làm giảm kg
- [x] 3.9 `siteLookup(db, viewer, q, today)`: tìm công trình theo mã / tên / nhà thầu không dấu, từng hợp đồng; hàng đang giữ qua `onSiteTotals`; tiền thuê tháng này bằng D7, đang nợ theo khoản của hợp đồng, cọc như D14; test Kinh doanh không có `money`, ngoài phạm vi không có kết quả, cái / tấn theo design D8
- [x] 3.10 `dashboardFor(viewer, today)`: gọi các hàm trên theo bảng vai trò × khối (design D1), **không gọi hàm tiền** khi thiếu `receivables.view`; integration test payload của Kinh doanh không có trường tiền, của Kế toán có
- [x] 3.11 Mở trang không ghi gì: test đếm `inventory_ledger`, `activity_log` trước / sau khi gọi `dashboardFor`

## 4. API

- [ ] 4.1 `GET /api/dashboard/site-lookup?q=` bọc `withAuth` (`dashboard.view` + `canContract(RENTAL, view)`), `q` < 2 ký tự trả rỗng, > 100 ký tự trả 400; test route: 401 chưa đăng nhập, 403 Thủ kho, Kinh doanh không có `money`; `route-guards.test.ts` xanh

## 5. Giao diện D1

- [ ] 5.1 Trang `src/app/(desktop)/dashboard/page.tsx`: `requirePermission("dashboard.view")`, `await connection()`, câu chào + "số liệu lúc HH:MM" + nút "Làm mới"; mỗi khối trong `<Suspense>` riêng; lưới dồn khi thiếu khối
- [ ] 5.2 Hàng 4 ô số (Công nợ quá hạn màu chính, Doanh số tháng, Hàng ở ngoài, Công trình rủi ro) theo bản vẽ, token Bright Blue Base
- [ ] 5.3 Khối Doanh số: biểu đồ cột chồng SVG Thuê / Bán, chuyển Theo tháng / Theo ngày, dấu * tạm tính, hôm nay thuê / bán, Đền bù + mua lại riêng, chú thích chưa VAT; giá trị âm vẽ dưới trục 0; component test (gồm một ngày âm)
- [ ] 5.4 Khối Tra nhanh: ô tìm debounce 250 ms, danh sách chọn bằng bàn phím, thẻ công trình + dòng từng hợp đồng, không hiện dòng tiền khi không có `money`; component test
- [ ] 5.5 Khối Chờ duyệt, Công trình rủi ro (gom theo công trình), Hàng ở ngoài theo khu vực, Tồn kho theo tình trạng, Top 5 (Doanh thu / Theo kg); chiều cao cố định, cuộn trong khối; component test
- [ ] 5.6 Gắn `data-mask` theo design D6

## 6. E2E và ảnh mốc

- [ ] 6.1 `e2e/dashboard.spec.ts`: Giám đốc thấy đủ khối, câu chào đếm khớp số dòng Chờ duyệt; Kế toán thấy khối tiền; Kinh doanh không thấy khối tiền và HTML không có số tiền của các khối đó; Thủ kho bị chuyển `/m`
- [ ] 6.2 E2E tra nhanh: gõ mã công trình của hợp đồng E2E (`E2EXUAT`), thấy hợp đồng và số đang giữ; Kinh doanh không thấy tiền
- [ ] 6.3 E2E khớp màn gốc trong cùng lần chạy: ô Quá hạn D1 = ô Quá hạn D14; số cái Hàng ở ngoài = tổng cột "Tại công trình" D10; bấm "Làm mới" thì giờ "số liệu lúc" đổi (không ghi gì vào DB dev)
- [ ] 6.4 Ảnh mốc `@visual` D1 cho Giám đốc và Kinh doanh phạm vi "Cả hai" (tài khoản E2E vai trò Kinh doanh; mask theo design D6); gắn nhãn `update-snapshots` vào PR

## 7. Đo và kiểm tra

- [ ] 7.1 `scripts/bench-dashboard.mts` (design D2): chỉ đọc `BENCH_DATABASE_URL` / `BENCH_APP_DATABASE_URL`; **từ chối chạy** (thoát mã 1) khi thiếu biến, tên DB không kết thúc bằng `_bench`, hoặc trùng DB của `DATABASE_URL` / `TEST_DATABASE_URL`; unit test phần kiểm tên DB
- [ ] 7.1a Tạo DB đo: `docker compose exec db createdb -U <owner> scaffolding_erp_bench`, đặt hai biến trỏ tới DB đó; script tự migrate + tạo role, sinh 300 hợp đồng thuê và 12 tháng sổ kho, đo thời gian từng khối; ghi kết quả vào PR; xóa bằng `dropdb scaffolding_erp_bench`. Ghi các bước vào `docs/ops/` (mục đo Tổng quan)
- [ ] 7.2 `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate dashboard-basic --strict` xanh; coverage `src/domain`, `src/lib` ≥ 80 %
- [ ] 7.3 Kiểm tay trên DB dev: so D1 với D7 (một hợp đồng, tháng này), D14 (ô Quá hạn), D10 (cột Tại công trình), D6 (một hợp đồng); nếu chưa làm khi archive thì ghi vào #33
