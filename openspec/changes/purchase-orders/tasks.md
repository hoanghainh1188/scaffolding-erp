# Tasks: purchase-orders

## 1. Cơ sở dữ liệu

- [x] 1.1 Drizzle schema `src/db/schema/purchasing.ts` cho `purchase_order`, `purchase_order_line`, `purchase_order_cost`, `purchase_order_event` theo design D7. Gồm: CHECK `kind`, `status`, `outcome` (`(status = 'DONE') = (outcome is not null)`), `expected_date` khi đã đặt, lý do khi hủy, `unit`, `quantity > 0`, `unit_price >= 0`, `amount > 0`, độ dài `label`; `unique (order_id, item_id)`; FK `RESTRICT` tới `supplier`, `item`, `user`, `CASCADE` từ đơn; index. Xuất từ `src/db/schema/index.ts` — kiểm tra: `npm run typecheck` xanh
- [x] 1.2 Sinh `drizzle/0004_purchase_orders.sql` bằng `npm run db:generate` — kiểm tra: `npm run db:migrate` thành công trên DB rỗng và trên DB đã có `inventory-ledger`
- [x] 1.3 Integration test `src/db/schema/purchasing.int.test.ts`. Các ca bị CHECK chặn:
  - đơn `IN_PROGRESS` có `outcome = 'CLOSED'`;
  - đơn `DONE` không có `outcome`;
  - đơn `CANCELLED` không có lý do;
  - đơn đã đặt thiếu `expected_date`;
  - dòng `quantity = 0`, chi phí `amount = 0`.

  Các ca khác: hai dòng cùng `item_id` trong một đơn bị unique chặn; xóa `supplier` hoặc `item` đã có trong đơn → `23503`; xóa đơn kéo theo dòng, chi phí, sự kiện — kiểm tra: `npm run test:int` xanh
- [x] 1.4 Cập nhật helper dọn DB test (`src/test/catalog.ts`, `src/test/inventory.ts`): xóa bảng đơn thu mua trước danh mục — kiểm tra: `npm run test:int` xanh 2 lần liền

## 2. Logic thuần + unit test (viết test trước)

- [x] 2.1 `src/domain/landed-cost.ts`: `allocate` (`VALUE`, `WEIGHT`, `QUANTITY`; phần dư lớn nhất; `bigint`), `lineWeightKgMilli`, `landedUnitCost` theo design D3, `splitLotByCondition` theo design D5 (dùng `piecesToKg`, `lineAmount` có sẵn). Unit test `landed-cost.test.ts`:
  - bảng design D3 theo giá trị: 2.231.098 / 771.840 / 1.311.524 / 565.538, giá nhập 196.155 / 33.930 / 153.743 / 7.952;
  - theo trọng lượng: 1.960.568 / 813.273 / 1.198.125 / 908.034, giá nhập 194.803 / 34.033 / 152.988 / 8.226;
  - 100 ₫ cho 3 dòng → 34 / 33 / 33;
  - hai phần dư bằng nhau thì dòng đứng trước nhận;
  - dòng số lượng 0 nhận 0;
  - tổng 0 → mọi dòng 0;
  - giá trị bằng 0 → thông báo đúng spec; không có dòng → "Không có hàng để chia chi phí";
  - 999.999.999 ₫ cho 9.000.000.000 ₫ + 1 ₫ không tràn;
  - `splitLotByCondition` (design D5): 150 Tốt / 38 Chờ sửa / 12 Phế liệu, giá sắt vụn 7.500 → 30.331.993 / 7.684.105 / 1.215.000; S > T (10 khung, 800.000 ₫) → Phế liệu 800.000, Tốt 0; cả lô phế liệu → nhận toàn bộ T; không có phế liệu không cần giá; 7.333 ₫/kg × 13,5 kg → 98.996; thiếu giá khi cần → "Chưa có giá sắt vụn tham khảo, nhờ Giám đốc nhập ở Cài đặt"; mã tính theo kg lấy số kg;
  - property test 500 bộ ngẫu nhiên: tổng luôn khớp, mỗi phần lệch < 1 ₫ so với phần chính xác.

  Kiểm tra: `npm run test:unit` xanh
- [x] 2.2 `src/domain/purchase-order.ts`:
  - kiểm dòng: đơn vị theo mã, số nguyên với `PIECE`, số lượng > 0, trùng mã;
  - kiểm chi phí: tên, số tiền;
  - `lineAmount` theo đơn vị đặt; tổng tiền hàng, tổng chi phí, tổng cộng;
  - `estimatedPieces`;
  - nhãn trạng thái (`statusLabel(status, outcome, hasReceipts)`).

  Unit test:
  - tổng D3 85.808.750 ₫; 212,5 kg × 8.201 → 1.742.713 ₫;
  - `GG-K17` 2.000 kg → "≈ 148 cái";
  - `PL-SAT` theo cái, `GG-CH` 2,5 cái, số lượng 0, trùng `GG-K17`, tên chi phí trống, chi phí 0: mỗi ca đúng thông báo của spec;
  - đơn giá 0 hợp lệ;
  - nhãn "Đang xử lý · Chờ xe về", "Đang xử lý · Đang nhận", "Hoàn thành · Đã hủy".

  Kiểm tra: `npm run test:unit` xanh
- [x] 2.3 `transition(order, command)` trong `src/domain/purchase-order.ts` cho 6 lệnh theo design D2. Unit test bảng **mọi cặp (trạng thái × lệnh)**:
  - hợp lệ: `PLACE` từ Nháp; `CANCEL` khi chưa có phiếu nhập; `CLOSE` khi đã có; `RECEIVE_FULL` → `RECEIVED`; `RECEIVE_SHORT` → `CLOSED`; `RECEIVE_SHORT_WAIT` giữ `IN_PROGRESS`;
  - không hợp lệ, đúng thông báo spec: đặt đơn không dòng, đặt thiếu ngày, đặt lại đơn đã đặt, đơn đã xong, hủy khi đã có phiếu nhập, hủy thiếu lý do, đóng khi chưa có phiếu nhập, `RECEIVE_*` khi Nháp;
  - `editableFields(order)` trả đúng các ô theo design D6.

  Kiểm tra: `npm run test:unit` xanh
- [x] 2.4 Thêm `purchasing.manage` (`DIRECTOR`, `SALES`) vào `src/domain/permissions.ts` theo design D12 — kiểm tra: `permissions.test.ts` cập nhật bảng mong đợi và xanh; coverage `src/domain` ≥ 80%

## 3. Service (integration test, mỗi lệnh ghi một transaction)

- [x] 3.1 `src/lib/purchasing/receipts.ts` (`receiptSummary` trả rỗng, design D9) và `src/lib/purchasing/orders.ts`: `create` (tùy chọn đặt luôn), `update`, `place`, `cancel`, `close`, `remove`, ghi `purchase_order_event`; `FOR SHARE` nhà cung cấp và vật tư theo thứ tự id; `FOR UPDATE` đơn; mã từ `nextDocumentCode(tx, "PO", year)`. Integration test `orders.int.test.ts`:
  - tạo đơn D3 rồi đọc lại ra đúng dòng, chi phí, tổng;
  - Lưu đơn ra `IN_PROGRESS` + 2 sự kiện;
  - mã `PO-2026-055` sau `PO-2026-054`; sang 01/01/2027 giờ Việt Nam ra `PO-2027-001`;
  - nhà cung cấp hoặc vật tư ngừng dùng bị từ chối, đúng thông báo;
  - sửa đơn giá khi chưa có phiếu nhập ghi sự kiện `UPDATED`;
  - sửa với `updatedAt` cũ → 409 "Đơn vừa được người khác sửa, tải lại trang", đơn không đổi;
  - hủy có lý do ra `DONE` + `CANCELLED`, hủy thiếu lý do bị từ chối;
  - xóa nháp xóa hẳn và đơn sau không nhận lại mã cũ; xóa đơn đã đặt bị từ chối;
  - lệnh lỗi để đơn y nguyên.

  Kiểm tra: `npm run test:int` xanh
- [x] 3.2 **Đơn không ghi sổ kho**: integration test chạy chuỗi tạo → sửa → đặt → hủy, và tạo → xóa nháp. Kiểm số dòng `inventory_ledger` và toàn bộ `inventory_cost` trước/sau bằng nhau; `npm run inventory:check` 0 lệch. Thêm test quét mã nguồn: `src/lib/purchasing/` không import `@/lib/inventory/post` — kiểm tra: `npm run test:int` xanh
- [x] 3.3 **Ghi đồng thời** `src/lib/purchasing/concurrency.int.test.ts` (`Promise.all`, 8 vòng):
  - 2 lệnh tạo cùng lúc ra 2 mã liền nhau;
  - ngừng dùng `NCC-0002` cùng lúc với đặt đơn của `NCC-0002`: chỉ một trong hai kết quả của spec;
  - ngừng dùng `GG-M16` cùng lúc với đặt đơn có `GG-M16`: tương tự;
  - hủy và sửa cùng một đơn cùng lúc: lệnh sau thấy trạng thái mới và bị từ chối đúng thông báo.

  Kiểm tra: `npm run test:int` xanh 3 lần liền
- [x] 3.4 `list` và `getByCode` theo design D8: tab và số đơn mỗi tab, tìm không dấu theo mã và nhà cung cấp, lọc loại, phân trang 20, thứ tự sắp xếp của spec, `arrivingToday` theo giờ Việt Nam, lịch sử mới nhất trước kèm tên người làm. Integration test:
  - tab Chờ xe về có 2 đơn; đơn hủy chỉ ở Tất cả;
  - "phuc lam" tìm ra đơn Phúc Lâm;
  - 2 đơn dự kiến hôm nay → `arrivingToday = 2`;
  - lúc 23:30 giờ Việt Nam vẫn tính đúng ngày;
  - mã không có → null.

  Kiểm tra: `npm run test:int` xanh
- [x] 3.5 Chặn ngừng dùng: sửa `src/lib/catalog/partners.ts` và `items.ts` (đếm đơn `IN_PROGRESS` trong transaction đang `FOR UPDATE`; đổi `23503` thành "… đã được dùng nên chỉ ngừng dùng được"). Integration test:
  - `NCC-0001` còn `PO-2026-055` → "NCC-0001 còn đơn thu mua đang xử lý: PO-2026-055. Đóng hoặc hủy đơn trước";
  - chỉ còn đơn xong/nháp → ngừng dùng được;
  - xóa nhà cung cấp có đơn → từ chối;
  - `GG-M16` trong đơn đang xử lý → thông báo đúng spec;
  - xóa vật tư chỉ nằm trong đơn nháp → từ chối;
  - test cũ của `master-data`, `inventory-ledger` vẫn xanh.

  Kiểm tra: `npm run test:int` xanh
- [x] 3.6 `npm run db:seed:dev` thêm 5 đơn mẫu theo design D13 qua service (chỉ khi chưa có đơn nào) — kiểm tra: seed 2 lần trên DB dev không nhân đôi; D3b của đơn mẫu D3 hiện tổng 85.808.750 ₫

## 4. API (mọi route bọc `withAuth`)

- [x] 4.1 Route `src/app/api/purchasing/orders/route.ts`, `orders/[code]/route.ts`, `orders/[code]/place|cancel|close/route.ts`, `form-options/route.ts` theo design D10: zod cho input, tiền và số lượng đọc bằng `parseMoney`/`parseQuantity`, lỗi kèm `field`, 404 "Không tìm thấy đơn thu mua" — kiểm tra: `route-guards.test.ts` xanh (không route nào quên `withAuth`)
- [x] 4.2 **Integration test quyền** `src/app/api/purchasing/purchasing-api.int.test.ts`:
  - mỗi route, lần lượt 5 vai trò: Giám đốc, Kinh doanh 2xx với mọi lệnh;
  - Kế toán 2xx khi đọc, 403 "Bạn không có quyền thực hiện thao tác này" khi ghi, và đơn không đổi;
  - Thủ kho, Xưởng 403 cả đọc lẫn ghi;
  - không đăng nhập 401;
  - lỗi nghiệp vụ trả 409/422 kèm `field` (VD `lines.0.quantity`).

  Kiểm tra: `npm run test:int` xanh

## 5. Giao diện

- [x] 5.1 D2 `src/app/(desktop)/purchasing/page.tsx` + `src/components/purchasing/order-table.tsx`, `order-status-badge.tsx` theo `D2-PurchaseOrders.dc.html`, thay trang giữ chỗ "Thu mua":
  - tab có số đơn, tìm, lọc loại, phân trang trên URL;
  - lời nhắc xe về hôm nay; dòng bấm mở D3b;
  - nút "Tạo đơn thu mua" theo quyền; trạng thái rỗng;
  - token thay hex.

  Component test: tab "Chờ xe về · 2"; URL `?tab=waiting`; nhãn "Hoàn thành · Đã hủy"; Kế toán không thấy nút tạo; "Chưa có đơn thu mua" — kiểm tra: `npm run test` xanh
- [x] 5.2 D3 form `src/app/(desktop)/purchasing/orders/new/page.tsx`, `[code]/edit/page.tsx` + `order-form.tsx`, `order-lines.tsx`, `order-costs.tsx`, `allocation-choice.tsx`, `order-total.tsx` theo `D3-PurchaseOrder.dc.html`:
  - xem trước bằng `landed-cost`, nút đổi cái/kg, "≈ N cái";
  - gợi ý tên chi phí; lỗi dưới ô;
  - khóa ô theo `editableFields`; gửi kèm `updatedAt` khi sửa, nhận 409 thì hiện thông báo và nút tải lại;
  - "Lưu đơn" / "Lưu nháp" / "Lưu thay đổi".

  Component test:
  - nhập số D3 ra "+2.231.098", "196.155 ₫", "85.808.750 ₫";
  - đổi "Theo trọng lượng" ra "+1.960.568", "194.803 ₫";
  - `GG-K17` 2.000 kg ra "≈ 148 cái";
  - `PL-SAT` không có nút "cái";
  - lỗi "Số lượng phải lớn hơn 0" hiện dưới ô;
  - 409 hiện "Đơn vừa được người khác sửa, tải lại trang".

  Kiểm tra: `npm run test` xanh
- [x] 5.3 D3b `src/app/(desktop)/purchasing/orders/[code]/page.tsx` + `order-detail.tsx`, `order-history.tsx`, `receiving-placeholder.tsx`, `cancel-dialog.tsx`, `close-dialog.tsx` theo `D3b-PurchaseOrderDetail.dc.html` (phần đơn):
  - thông tin chung, bảng Đặt và thực nhận (cột "Đã nhận" là "–"), chi phí dự kiến, lịch sử;
  - khối "Chưa có chuyến nhập…", Phải trả người bán 0 ₫;
  - nút theo quyền và trạng thái; hỏi lại khi hủy/đóng/xóa; 404.

  Component test:
  - đơn đã đặt có "Sửa", "Hủy đơn", không có "Đóng đơn, không chờ nữa";
  - hộp hủy đòi lý do;
  - Kế toán không thấy nút ghi;
  - lịch sử mới nhất trên cùng.

  Kiểm tra: `npm run test` xanh
- [x] 5.4 Sidebar mục "Thu mua" mở D2; trang dùng giờ gọi `await connection()` — kiểm tra: `npm run lint && npm run typecheck && npm test` xanh; `npm run build` không lỗi prerender

## 6. E2E, ảnh mốc, tài liệu

- [x] 6.1 Dữ liệu E2E theo design D13: nhà cung cấp cố định `E2E NCC`; `global-setup.ts` xóa đơn của nhà cung cấp này trước mỗi lần chạy — kiểm tra: chạy `npm run test:e2e` hai lần liền đều xanh
- [x] 6.2 E2E `tests/e2e/purchasing.spec.ts`:
  - Kinh doanh tạo đơn 2 dòng (một dòng theo kg) + 2 khoản chi phí; thấy giá nhập xem trước;
  - "Lưu đơn" mở D3b "Chờ xe về"; D2 tab "Chờ xe về" có đơn;
  - sửa đơn giá; lịch sử có "sửa đơn";
  - hủy với lý do → "Hoàn thành · Đã hủy";
  - "Lưu nháp" rồi xóa nháp;
  - Kế toán mở D3b không thấy nút ghi;
  - D2, D3 ở 1366px không cuộn ngang.

  Kiểm tra: `npm run test:e2e` xanh ở local
- [ ] 6.3 Thêm `/purchasing`, `/purchasing/orders/new`, `/purchasing/orders/<mã mẫu>` vào `responsive.spec.ts` và `a11y.spec.ts`; thêm D2, D3, D3b vào `visual.spec.ts` (D2 lọc theo nhà cung cấp mẫu; che lời nhắc xe về, ngày lập và lịch sử bằng `[data-mask]`) — kiểm tra: CI xanh sau workflow Update Playwright snapshots
- [x] 6.4 Cập nhật `CLAUDE.md`:
  - Đơn thu mua không ghi sổ kho.
  - Chia chi phí dùng `src/domain/landed-cost.ts` (phần dư lớn nhất, tổng khớp từng đồng).
  - Trạng thái đơn dùng `transition()`.
  - "Đã có phiếu nhập" đọc qua `receiptSummary`.

  Kiểm tra: `npx openspec validate purchase-orders --strict` xanh
- [ ] 6.5 Kiểm tra tay trên Edge 1366px:
  - so D2, D3, D3b với bản vẽ;
  - nhập đơn D3 và so cột chi phí phân bổ với bảng design D3 (khác bản vẽ 1 ₫ ở Chéo và Phế liệu là đúng);
  - Kế toán chỉ xem.

  Kiểm tra: ghi kết quả vào PR; chưa làm được thì ghi "làm sau, theo dõi ở #33" và thêm mục vào #33
