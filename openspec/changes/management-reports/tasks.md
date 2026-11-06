# Tasks

## 1. Chỉ mục, quyền

- [ ] 1.1 Migration `drizzle/0022_management_reports.sql` + schema `src/db/schema/inventory.ts`: chỉ mục `inventory_ledger_business_date_idx` trên `(business_date)` (design D4). Không đổi dữ liệu, không `GRANT`. Kiểm:
  - `npm run db:migrate` sạch trên DB trống và DB dev;
  - `src/db/schema/dashboard-indexes.int.test.ts` thêm chỉ mục mới;
  - `EXPLAIN` truy vấn giá vốn của một tháng dùng chỉ mục này.
- [ ] 1.2 `src/domain/permissions.ts`: `reports.view` cho `DIRECTOR`, `ACCOUNTANT` (design D5). Kiểm:
  - `permissions.test.ts`: Kinh doanh, Thủ kho, Xưởng không có `reports.view`;
  - `navigation.test.ts`: Kế toán thấy menu Báo cáo, Kinh doanh không thấy;
  - test app-shell hiện có xanh.

## 2. Hàm thuần (test trước)

- [ ] 2.1 `src/domain/report-period.ts` (design D9): `parsePeriod`, `periodRange`, `previousPeriod`, `yearToDate`, `comparableRange`, `periodLabel`, `REPORT_FIRST_YEAR`. Test theo kịch bản spec "Kỳ báo cáo" và "So với kỳ trước ở ô Doanh thu":
  - tháng đang chạy 06/11/2026;
  - quý 3/2026, kỳ trước là quý 2;
  - năm 2026, kỳ trước là 2025;
  - kỳ trước của quý 1 là quý 4 năm trước;
  - tháng 12/2026 ở tương lai thì trả tháng này;
  - `2026-13`, `2019-12`, `week` thì trả tháng này;
  - nhãn "Tháng 10/2026", "Quý 3/2026", "Năm 2026";
  - `comparableRange`: kỳ đã hết thì cả kỳ trước ("so với tháng 9"); tháng 11/2026 ngày 06/11 thì 01/10 – 06/10; năm 2026 ngày 06/11 thì 01/01 – 06/11/2025; tháng 03/2027 ngày 31/03 thì 01/02 – 28/02; quý 4/2026 ngày 06/11 (37 ngày) thì 01/07 – 06/08/2026.
- [ ] 2.2 `src/domain/gross-profit.ts`: `classifyLedger(documentType, movement)` theo design D1, D2. Test từng cặp:
  - `DELIVERY`/`SALE_OUT` thì giá vốn bán;
  - `BUY_BACK`/`SALE_OUT` thì mua lại;
  - `RETURN`/`LOSS_OUT` thì mất;
  - `RETURN`/`RETURN_OUT`, `RETURN_IN` thì giảm giá trị;
  - `STOCKTAKE`, `ADJUSTMENT` thì kiểm kê và điều chỉnh;
  - `OPENING`, `PURCHASE_IN`, `REVALUE`, `DELIVERY_OUT/IN`, `TRANSFER_*`, `REPAIR_*` thì không vào khoản riêng (sửa chữa đọc từ phiếu sửa).
- [ ] 2.3 `monthlyProfit`, `sumMonths`, `marginText`. Test:
  - **ví dụ tính tay** của spec: doanh thu 535.550.000 ₫; 6 khoản 102.200.000 / 7.900.000 / 9.860.000 / 6.240.000 / 600.000 / 1.140.000 ₫; ra giá vốn và hao hụt 127.940.000 ₫, lợi nhuận 407.610.000 ₫, tỷ suất "76,1 %";
  - **kỳ này, kỳ trước, lũy kế khớp tổng các tháng**: quý 3 = 341.000.000 + 393.000.000 + 358.180.000 = 1.092.180.000 ₫; lũy kế = Σ tháng 1 tới tháng kỳ;
  - tỷ suất làm tròn nửa lên: 0,05 thì lên; ví dụ 79,55 % thành "79,6 %";
  - doanh thu 0 hoặc âm thì "—";
  - lợi nhuận âm giữ dấu;
  - giảm giá trị âm (giá nhập cao hơn) giữ dấu.
- [ ] 2.4 Không tính hai lần (design D1), test hàm thuần trên dòng sổ dựng tay:
  - **trả về Chờ sửa → sửa → vào Tốt → mất**: 1.500.000 / 0 (chi phí đã chi 500.000) / 3.000.000, tổng 4.500.000 ₫;
  - **trả về Phế liệu → bán phế liệu**: giảm giá trị 1.360.000 ₫, giá vốn bán 240.000 ₫, tổng 1.600.000 ₫;
  - phiếu sửa hỏng hết `GG-M16` thì sửa chữa 600.000 ₫;
  - phiếu sửa có phần hỏng nhưng còn hàng sửa xong thì sửa chữa 0 ₫;
  - **đẳng thức** "giá vốn và hao hụt = −Σ amount (trừ OPENING, PURCHASE_IN, REVALUE) + Σ chi phí sửa" đúng trên cả hai chuỗi.
- [ ] 2.5 `src/domain/fleet-metrics.ts`: `dailyFleet(opening, deltas, from, to)` trả tổng theo tháng và theo mã, `lossPer100Tons`, `utilization`, `groupOthers(rows, limit)`. Test:
  - **hàng ra vào giữa kỳ**: `PK-KU` 8.000 → 12.000 từ 16/09 thì bình quân 10.000 cái = 50,0 tấn; ở công trình 6.000 → 8.000 từ 11/09 thì 73,3 %;
  - tổng theo tấn gộp `PK-KU` và `ONG-TH` (mét) ra 70,8 %, bảng theo mã không có `ONG-TH`;
  - hao hụt `PK-KU` mất 10, phế 4, phải sửa 16 thì 0,30 tấn trên 100 tấn;
  - năm lũy kế 40,2 ÷ 412,7 ra "9,74";
  - Chờ sửa, Phế liệu không vào bình quân;
  - mã chưa có trọng lượng chuẩn: 0 tấn, đếm số mã;
  - bình quân 0 thì "—";
  - kỳ đang chạy chỉ đếm đến hôm nay;
  - gộp 16 mã thành 10 dòng + "6 mã khác";
  - làm tròn cái 7.333,3 thành 7.333.
- [ ] 2.6 Coverage `src/domain` ≥ 80 %.

## 3. Đọc dữ liệu (`src/lib/reports/`)

- [ ] 3.1 `revenueBook`: thêm `kind` (`COMPENSATION` / `BUY_BACK`) vào `SeparateEntry` (design D7). Kiểm: test D1 hiện có (`revenue.int.test.ts`, `summary.int.test.ts`, `top.int.test.ts`) không sửa và xanh.
- [ ] 3.2 `revenue.ts`: doanh thu theo tháng từ `revenueBook` (một lần gọi cho `[S, E]`, bỏ khoản sau `E`), tách thuê, bán, đền bù, mua lại, đánh dấu tạm tính. Integration test:
  - **tháng nào cũng khớp D1**: so với `monthTotals` của D1 trên cùng dữ liệu, có kỳ đã chốt và kỳ mở;
  - **đền bù, mua lại đúng tháng duyệt**: hàng mất 31/10, đền bù duyệt 03/11 thì vào tháng 11;
  - phiếu Chờ duyệt, Từ chối không tính;
  - xem năm 2025 khi hôm nay là 2026 thì không lẫn khoản 2026.
- [ ] 3.3 `costs.ts`: một truy vấn gom `sum(amount)` theo `(tháng, document_type, movement)` trong `[S, E]`, một truy vấn gom `repair_cost`, `loss_amount` của phiếu sửa theo tháng của dòng sổ (nối `posting_id`). Integration test trên DB test, ghi qua đúng service của app:
  - `PTH-2026-071` cho giảm giá trị 6.870.000 ₫, mất 800.000 ₫;
  - mua lại `SALE_OUT` 7.900.000 ₫;
  - bán theo kg 6.500.000 ₫;
  - kiểm kê giảm 2.788.056 ₫;
  - `ĐC-2026-004` 352.820 ₫;
  - `ĐCG` +1.200.000 ₫ không vào;
  - phiếu nhập, tồn đầu kỳ, xuất thuê, chuyển công trình không vào;
  - **đẳng thức khớp sổ kho** của spec (sổ trừ tồn đầu, nhập, `ĐCG` + chi phí sửa) trên toàn bộ dữ liệu test;
  - **chuỗi trả về Chờ sửa → sửa → mất** và **trả về Phế liệu → bán** cho đúng tổng như 2.4.
- [ ] 3.4 `fleet.ts`: truy vấn số dư đầu và biến động theo ngày (`inner join location`, chỉ Mới, Tốt), truy vấn hao hụt của phiếu thu hồi. Integration test:
  - **ranh giới ngày Việt Nam**: thu hồi ghi sổ 23:30 ngày 30/09 giờ Việt Nam thì vào tháng 9; xuất 00:30 ngày 01/10 thì không đổi tháng 9;
  - **dòng `REVALUE` (`location_id` trống) không đổi bình quân, hao hụt, khai thác** so với khi không có;
  - phế liệu từ phiếu sửa không vào hao hụt;
  - số dư đầu đúng khi kỳ bắt đầu giữa năm.
- [ ] 3.5 `ranking.ts`: xếp hạng đầy đủ bằng `revenueByCustomer`, `kgByCustomer`, `topCustomers(rows, Infinity)`, thêm thuê, bán, số hợp đồng. Integration test:
  - **5 dòng đầu giống `topRows` của D1** cùng năm, cả hai chế độ;
  - đủ mọi nhà thầu có số khác 0;
  - theo kg không trừ hàng trả (2,0 tấn);
  - bằng nhau xếp theo tên.
- [ ] 3.6 `report.ts` `buildReport(db, period, today)`: gọi song song 3.2–3.5, ra một object cho trang và Excel. Integration test:
  - **chỉ đọc**: số dòng `inventory_ledger`, `activity_log` và các bảng chứng từ không đổi sau khi gọi;
  - kỳ tháng 01/2020 ra toàn 0 và "—".

## 4. API và Excel

- [ ] 4.1 `export.ts` + `GET /api/reports/export` bọc `withAuth("reports.view")` (design D10). Integration test:
  - Kinh doanh, Thủ kho, Xưởng nhận 403 và không gọi hàm tính;
  - `period=week` nhận 400 "Kỳ báo cáo không hợp lệ";
  - file `bao-cao-2026-10.xlsx` có đúng 5 sheet và cột theo spec;
  - **tiền là ô số nguyên**, tấn và % là ô số;
  - ô lợi nhuận kỳ này bằng `buildReport`;
  - sheet "Xếp hạng nhà thầu" đủ dòng;
  - không ghi nhật ký.
  - `src/app/route-guards.test.ts` xanh.

## 5. Giao diện D15

- [ ] 5.1 Trang `src/app/(desktop)/reports/page.tsx` thay trang giữ chỗ: `requirePermission("reports.view")`, `await connection()`, đọc `period`/`value` qua `parsePeriod`, dòng dưới tiêu đề. Thanh chọn Tháng / Quý / Năm và ô kỳ (client, đổi URL), nút "Xuất Excel". Kiểm:
  - Kinh doanh nhận 403;
  - Thủ kho bị chuyển tới `/m`;
  - test trang giữ chỗ cũ được cập nhật.
- [ ] 5.2 4 ô số và bảng lợi nhuận gộp 3 cột theo `docs/design/screens/D15-Reports.dc.html` (đổi hex sang token). Gồm:
  - nhãn dòng theo design D1, D2 (0.2 #111–#113);
  - dấu "tạm tính";
  - % ở ô doanh thu theo design D11;
  - dưới bảng: "Chi phí sửa đã chi trong kỳ", không khấu hao, chưa gồm chi phí ngoài sổ kho, hàng mất và đền bù khác ngày (0.2 #116).
  - Component test: số của ví dụ tính tay; "+ 19,0 % so với tháng 9"; tháng đang chạy "+ 4,2 % so với 01/10 – 06/10" trong khi cột Kỳ trước vẫn đủ tháng 10; năm đang chạy "+ 9,4 % so với 01/01 – 06/11/2025"; phần đem so 0 ₫ thì không có %; ô số khớp dòng bảng; nhãn "Sửa chữa (lỗ hỏng hàng)", "Giảm giá trị khi trả về đổi tình trạng", "Chênh lệch kiểm kê và điều chỉnh"; ghi chú "Chưa gồm chi phí ngoài sổ kho (xe, nhân công…)" và "Hàng mất tính theo ngày trả, đền bù theo ngày duyệt".
- [ ] 5.3 Biểu đồ doanh thu và lợi nhuận theo tháng, SVG vẽ tay theo token như D1, không thêm thư viện. Component test:
  - 10 cột T1–T10;
  - tháng tạm tính có "*";
  - lợi nhuận âm vẽ dưới trục 0;
  - có nhãn cho trình đọc màn hình.
- [ ] 5.4 Bảng hao hụt, bảng khai thác (10 dòng + "N mã khác", dòng Cộng, ghi chú năm lũy kế, số mã chưa có trọng lượng). Bảng xếp hạng đầy đủ có nút "Doanh thu" / "Theo kg". Component test:
  - gộp mã khác;
  - đổi chế độ xếp hạng đổi thứ tự;
  - cột tấn 1 chữ số lẻ.

## 6. Đo, E2E, tài liệu

- [ ] 6.1 `npm run bench:reports` (`scripts/bench-reports.mts`, dùng lại guard `*_bench` và helper của `bench:dashboard`) đo từng khối kỳ tháng và kỳ năm, hai lần. Ghi `docs/ops/reports-bench.md`. **Mục tiêu**: kỳ năm < 2,5 s, kỳ tháng < 1,5 s. Vượt thì tách khối nặng vào `Suspense` (design Risks) rồi đo lại.
- [ ] 6.2 E2E `tests/e2e/reports.spec.ts` (design D6):
  - Giám đốc mở `/reports`: 4 ô, bảng 10 khoản mục, đổi Quý thì URL đổi, đổi "Theo kg";
  - "Xuất Excel" tải `bao-cao-<value>.xlsx`;
  - Kế toán (`statePath("ACCOUNTANT")`) mở được và thấy menu Báo cáo;
  - Kinh doanh nhận 403 ở trang và API.
  - Ảnh mốc `@visual` `/reports?period=month&value=2020-01`.
- [ ] 6.3 `CLAUDE.md`:
  - quy ước `src/lib/reports/`: chỉ đọc; doanh thu qua `revenueBook`; giá vốn từ sổ theo `classifyLedger`; luật không trừ hai lần (chi phí sửa vào giá Tốt, khoản Sửa chữa = lỗ hỏng hàng); đẳng thức đối chiếu; bình quân theo ngày `inner join location`; quyền `reports.view`;
  - lệnh `bench:reports`;
  - lưu ý E2E (ảnh mốc kỳ 01/2020, không kiểm số tiền trên DB dev).
- [ ] 6.4 Chạy `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate management-reports --strict`, tất cả xanh. Coverage `src/domain`, `src/lib` ≥ 80 %. Gắn nhãn `update-snapshots` vào PR apply.
- [ ] 6.5 Kiểm tra tay, làm trên demo với `giamdoc` và `ketoan`, Edge 1366px:
  - chọn một tháng đã chốt hết kỳ, so doanh thu với D1 và bảng kê D7;
  - so giá vốn hàng bán, hàng mất với thẻ kho D11 của 2–3 mã;
  - so một tháng với sổ tay hoặc Excel của kế toán (nếu có);
  - mở file Excel bằng Excel và LibreOffice;
  - so D15 với bản vẽ.
  - Nếu chưa làm trước archive thì ghi "làm sau, theo dõi ở #33" và thêm mục vào issue #33.

## Workflow follow-up

- Archive (`/opsx:archive`) sau khi apply merge: gộp `gross-profit`, `fleet-metrics`, `management-reports` và sửa `auth`, `app-shell` vào `openspec/specs/`. PR ghi `Closes #19`.
