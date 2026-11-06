## 1. Chỉ mục DB

- [ ] 1.1 Migration chỉ thêm chỉ mục (design D2): `billing_period_month_idx (month)`, `delivery_note_posted_date_idx (business_date) WHERE status = 'POSTED'`, `inventory_ledger_movement_date_idx (movement, business_date)`; khai báo trong `src/db/schema/*.ts`, sinh bằng `npm run db:generate`, chạy `npm run db:migrate`
- [ ] 1.2 Integration test: ba chỉ mục tồn tại (`pg_indexes`), migration không đổi số dòng của bảng nào

## 2. Hàm thuần `src/domain/dashboard.ts` + unit test (trước giao diện)

- [ ] 2.1 Hằng số `RISK_LOSS_DAYS = 30` và các nhãn dấu hiệu ở một chỗ; `isRecentLoss(lossDate, today)` (≤ 30 ngày), `isPastEnd(endDate, today, onSitePieces)`; test ranh giới 30 / 31 ngày, đúng ngày kết thúc, không có ngày kết thúc, còn 0 cái
- [ ] 2.2 `dailyRevenue(statement)`: chia dòng `RENT` theo ngày tính (bỏ ngày nghỉ, phần dư lớn nhất), `MINIMUM` vào ngày trả, `ADJUSTMENT` vào ngày cuối kỳ / `asOf`, cước vào ngày giao; test: chia đều, ngày nghỉ, phần lẻ 100.000 ₫ / 3 ngày, đổi giá giữa tháng, trả giữa tháng, số lượng 0, **tổng các ngày = `beforeVat`** (kiểm trên nhiều bảng kê dựng tay)
- [ ] 2.3 `dailyRevenueOfClosed(lines, freight)` cho bảng chụp `billing_period_line` / `billing_period_freight`; test tổng = `rent + adjustment + freight` của kỳ
- [ ] 2.4 `monthTotals(days)` gom Thuê / Bán theo tháng, cờ tạm tính; `topCustomers(rows, by, 5)` (bằng nhau xếp theo tên, bỏ 0); test
- [ ] 2.5 `regionTotals(sites)`: gom cái, kg theo khu vực từ `regionOf`, dòng "Chưa rõ", dòng Cộng; `tonsText(kg)` 1 chữ số lẻ; test
- [ ] 2.6 `riskBySite(contracts)`: gom hợp đồng rủi ro theo công trình, số công trình; test hai hợp đồng một công trình
- [ ] 2.7 `greeting(name, role, count)`: ba dạng câu (Giám đốc, vai trò khác, 0 việc); test

## 3. Đọc dữ liệu `src/lib/dashboard/` + integration test

- [ ] 3.1 `loadBillingSources(db, contractIds)` trong `src/lib/billing/` (đọc theo lô, dựng `BillingSource` như `loadBillingSource`); test: với mỗi hợp đồng kết quả **bằng** `loadBillingSource`
- [ ] 3.2 `revenueDays(db, from, to, today)`: thuê (kỳ đã chốt đọc bảng chụp, kỳ mở `statementOf`) + bán (`deliveredAmounts` phiếu bán đã ghi sổ) + đền bù / mua lại đã duyệt theo ngày duyệt; integration test:
  - tổng ngày của tháng đang chạy bằng `beforeVat` của bảng kê D7 (`contractStatement`)
  - tháng đã chốt bằng Σ (`total_amount − vat_amount`) của `billing_period` tháng đó, kể cả khi sổ kho tính lại ra số khác
  - bán theo ngày giao; phiếu Đang nhặt / Đã hủy không tính
  - đền bù, mua lại đã duyệt không cộng vào thuê / bán; chưa duyệt không tính
- [ ] 3.3 `pendingApprovals(db, viewer)`: 5 loại theo design D1, sắp theo lúc gửi; số tiền như màn gốc; integration test từng vai trò (Giám đốc, Kế toán, Kinh doanh "Cả hai" / "Chỉ thuê" / "Chỉ bán"); **số đếm = số dòng** dùng cho câu chào
- [ ] 3.4 `overdueSummary(db, today)` gọi `customerBalances` (`filter: "overdue"`); test khớp ô Quá hạn của D14 và ranh giới hạn trả theo ngày Việt Nam
- [ ] 3.5 `onSiteSummary(db)`: cái, kg theo công trình và khu vực; test tổng cái = cột "Tại công trình" của `getStockOverview` và = Σ `onSiteByItem` của mọi hợp đồng (D6)
- [ ] 3.6 `stockByCondition(db)`: gom bãi + xưởng theo tình trạng và công trình; test khớp từng mã với `getStockOverview`
- [ ] 3.7 `riskySites(db, viewer, today)`: ba dấu hiệu (nợ quá hạn theo khoản của hợp đồng, `LOSS_OUT` trong 30 ngày, quá ngày kết thúc của bản đang áp dụng mà còn hàng); test từng dấu hiệu, ranh giới, hợp đồng không ngày kết thúc, hai hợp đồng một công trình, Kinh doanh ngoài `canContract` bị bỏ, không có số tiền cho Kinh doanh
- [ ] 3.8 `topCustomersOfYear(db, year, today)` theo doanh thu và theo kg (nghĩa chốt ở Q2); test doanh thu năm = Σ doanh số tháng của nhà thầu
- [ ] 3.9 `siteLookup(db, viewer, q, today)`: tìm công trình theo mã / tên / nhà thầu không dấu, từng hợp đồng; tiền thuê tháng này bằng D7, đang nợ theo khoản của hợp đồng, cọc như D14; test Kinh doanh không có `money`, ngoài phạm vi không có kết quả
- [ ] 3.10 `dashboardFor(viewer, today)`: gọi các hàm trên theo bảng vai trò × khối (design D1), **không gọi hàm tiền** khi thiếu `receivables.view`; integration test payload của Kinh doanh không có trường tiền, của Kế toán có
- [ ] 3.11 Mở trang không ghi gì: test đếm `inventory_ledger`, `activity_log` trước / sau khi gọi `dashboardFor`

## 4. API

- [ ] 4.1 `GET /api/dashboard/site-lookup?q=` bọc `withAuth` (`dashboard.view` + `canContract(RENTAL, view)`), `q` < 2 ký tự trả rỗng, > 100 ký tự trả 400; test route: 401 chưa đăng nhập, 403 Thủ kho, Kinh doanh không có `money`; `route-guards.test.ts` xanh

## 5. Giao diện D1

- [ ] 5.1 Trang `src/app/(desktop)/dashboard/page.tsx`: `requirePermission("dashboard.view")`, `await connection()`, câu chào + "số liệu lúc HH:MM" + nút "Làm mới"; mỗi khối trong `<Suspense>` riêng; lưới dồn khi thiếu khối
- [ ] 5.2 Hàng 4 ô số (Công nợ quá hạn màu chính, Doanh số tháng, Hàng ở ngoài, Công trình rủi ro) theo bản vẽ, token Bright Blue Base
- [ ] 5.3 Khối Doanh số: biểu đồ cột chồng SVG Thuê / Bán, chuyển Theo tháng / Theo ngày, dấu * tạm tính, hôm nay thuê / bán, Đền bù + mua lại riêng, chú thích chưa VAT; component test
- [ ] 5.4 Khối Tra nhanh: ô tìm debounce 250 ms, danh sách chọn bằng bàn phím, thẻ công trình + dòng từng hợp đồng, không hiện dòng tiền khi không có `money`; component test
- [ ] 5.5 Khối Chờ duyệt, Công trình rủi ro (gom theo công trình), Hàng ở ngoài theo khu vực, Tồn kho theo tình trạng, Top 5 (Doanh thu / Theo kg); chiều cao cố định, cuộn trong khối; component test
- [ ] 5.6 Gắn `data-mask` theo design D6

## 6. E2E và ảnh mốc

- [ ] 6.1 `e2e/dashboard.spec.ts`: Giám đốc thấy đủ khối, câu chào đếm khớp số dòng Chờ duyệt; Kế toán thấy khối tiền; Kinh doanh không thấy khối tiền và HTML không có số tiền của các khối đó; Thủ kho bị chuyển `/m`
- [ ] 6.2 E2E tra nhanh: gõ mã công trình của hợp đồng E2E (`E2EXUAT`), thấy hợp đồng và số đang giữ; Kinh doanh không thấy tiền
- [ ] 6.3 E2E khớp màn gốc trong cùng lần chạy: ô Quá hạn D1 = ô Quá hạn D14; số cái Hàng ở ngoài = tổng cột "Tại công trình" D10; bấm "Làm mới" thì giờ "số liệu lúc" đổi (không ghi gì vào DB dev)
- [ ] 6.4 Ảnh mốc `@visual` D1 cho Giám đốc và Kinh doanh (mask theo design D6); gắn nhãn `update-snapshots` vào PR

## 7. Đo và kiểm tra

- [ ] 7.1 `scripts/bench-dashboard.mts`: sinh 300 hợp đồng thuê, 12 tháng sổ kho trên DB dev riêng, đo thời gian từng khối; ghi kết quả vào PR (mục tiêu design D2)
- [ ] 7.2 `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate dashboard-basic --strict` xanh; coverage `src/domain`, `src/lib` ≥ 80 %
- [ ] 7.3 Kiểm tay trên DB dev: so D1 với D7 (một hợp đồng, tháng này), D14 (ô Quá hạn), D10 (cột Tại công trình), D6 (một hợp đồng); nếu chưa làm khi archive thì ghi vào #33
