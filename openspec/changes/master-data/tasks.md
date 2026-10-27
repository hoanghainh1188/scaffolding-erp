# Tasks: master-data

## 1. Cơ sở dữ liệu

- [ ] 1.1 Drizzle schema `src/db/schema/catalog.ts` cho `item_group`, `item`, `kit`, `kit_component`, `customer`, `supplier`, `location`, `site` theo design D10 (uuid, `status` + `archived_at`, `created_by`/`updated_by`, CHECK đơn vị/trọng lượng/giá/mã, FK `RESTRICT`, `kit_component` CASCADE theo kit), 3 sequence; sinh `drizzle/0002_master_data.sql`, thêm tay 2 dòng `BAI-01`, `XUONG-01` và đọc lại — kiểm tra: `npm run db:migrate` trên DB rỗng thành công, có đúng 2 vị trí
- [ ] 1.2 Integration test ràng buộc DB `src/db/schema/catalog.int.test.ts`: vật tư cái thiếu trọng lượng, vật tư kg có trọng lượng hoặc giá thuê, giá âm, mã `gg-k17` thường, `kit_component` số lượng 0, xóa nhóm còn vật tư (`23503`) — kiểm tra: `npm run test:int` xanh

## 2. Logic thuần + unit test (viết test trước)

- [ ] 2.1 `src/domain/item-code.ts` (`normalizeCatalogCode`, `isValidCatalogCode`) — kiểm tra: unit test `gg-k17`→`GG-K17`, `GG K17`, `-GGK17`, `GG--K17`, 1 ký tự, 21 ký tự, `BAI-01`
- [ ] 2.2 `src/domain/weight-conversion.ts` (`piecesToKg`, `kgToPieces`) theo design D11 — kiểm tra: unit test 100 cái × 13,5 = 1.350 kg; 1.357 kg → 101 cái; 20,25 kg → 2 cái (đúng nửa); 0 → 0; trọng lượng 0 báo lỗi; sai đơn vị báo lỗi; 1 cái × 0,001 kg; số lớn 99.999 cái × 25 kg không tràn
- [ ] 2.3 `src/domain/kit.ts` (`validateKitComponents`, `kitTotals`) — kiểm tra: unit test bộ `BO-17` = 43,6 kg và 3.900 ₫/ngày; đổi `GG-CH` lên 350 ₫ → 4.000 ₫; linh kiện không cho thuê → `null`; 1 dòng số lượng 1 bị từ chối; trùng dòng; linh kiện kg; linh kiện ngừng dùng (thông báo đúng chữ trong spec)
- [ ] 2.4 `src/domain/partner-fields.ts` (`normalizePhone`, `formatPhone`, `isValidTaxCode`, `isValidIdNumber`) và `src/domain/search-text.ts` (`toSearchText`), `catalog-code-sequence.ts` (`formatSequenceCode`) — kiểm tra: unit test `0912.345.678`, `+84 912 345 678`, `091234567`; MST `0109876543`, `0109876543-001`, `01098765`; CCCD 12/10 chữ số; "Khung giàn giáo Đ" → "khung gian giao d"; `NT-0001`, `NT-10000`; coverage `src/domain` ≥ 80%
- [ ] 2.5 Thêm `catalog.read`, `items.manage`, `partners.manage`, `locations.manage` vào `src/domain/permissions.ts` theo design D9 — kiểm tra: `permissions.test.ts` cập nhật bảng mong đợi, xanh; menu không đổi

## 3. Service (integration test, mỗi lệnh một transaction)

- [ ] 3.1 `src/lib/catalog/item-groups.ts`: list, create, rename, archive/restore, delete — kiểm tra: integration test trùng tên không phân biệt dấu/hoa thường → 409; xóa nhóm còn vật tư → 409 "đã được dùng"; xóa nhóm trống được
- [ ] 3.2 `src/lib/catalog/items.ts`: list (lọc `q` không dấu, nhóm, trạng thái; đếm), create (advisory lock + kiểm mã trùng với bộ), update (từ chối đổi `code`/`unit`), archive (chặn khi ở bộ đang dùng), restore, delete (`23503` → 409) — kiểm tra: integration test đủ scenario của spec `item-catalog` (mã trùng mã bộ, không sửa mã, xóa vật tư trong bộ, ngừng dùng vật tư trong bộ đang dùng, tạo vật tư cùng mã đồng thời chỉ một thành công)
- [ ] 3.3 `src/lib/catalog/kits.ts`: list (kèm `kitTotals`), create, replace components, archive/restore, delete; danh sách bộ chứa một vật tư — kiểm tra: integration test tạo `BO-17`, vật tư ngừng dùng không vào bộ mới, đổi giá linh kiện thì giá bộ đọc ra đổi theo, xóa bộ xóa dòng linh kiện
- [ ] 3.4 `src/lib/catalog/customers.ts`, `suppliers.ts`: list (tìm theo tên/mã/điện thoại/MST; nhà thầu kèm số công trình đang dùng), create (mã từ sequence), update, archive (nhà thầu còn công trình đang dùng → 409), restore, delete — kiểm tra: integration test mã `NT-0001`→`NT-0003` sau khi xóa `NT-0002`, hai yêu cầu đồng thời ra hai mã khác nhau, hạn thanh toán mặc định 30, chuẩn hóa điện thoại, nhà cung cấp cá nhân chỉ có tên
- [ ] 3.5 `src/lib/catalog/sites.ts` và `locations.ts`: tạo công trình kèm vị trí `SITE` trong một transaction, đổi tên đồng bộ, không đổi nhà thầu, nhà thầu ngừng dùng bị từ chối, archive/restore/delete đi kèm vị trí; bãi/xưởng: tạo (từ chối `SITE`), giữ ít nhất một bãi đang dùng — kiểm tra: integration test đủ scenario của spec `sites-and-locations`, kể cả lỗi giữa chừng không để lại công trình

## 4. API (mọi route bọc `withAuth`)

- [ ] 4.1 Helper chung `src/lib/catalog/respond.ts` + route `src/app/api/catalog/items`, `items/[id]`, `kits`, `kits/[id]`, `item-groups`, `item-groups/[id]` — đọc `catalog.read`, ghi `items.manage`; zod với thông báo tiếng Việt — kiểm tra: `route-guards.test.ts` xanh (mọi route có `withAuth`)
- [ ] 4.2 Route `customers`, `customers/[id]`, `suppliers`, `suppliers/[id]`, `sites`, `sites/[id]` (ghi `partners.manage`), `locations`, `locations/[id]` (ghi `locations.manage`) — kiểm tra: như trên
- [ ] 4.3 **Integration test quyền** `src/app/api/catalog/catalog-api.int.test.ts`: với mỗi route ghi, lần lượt 5 vai trò → đúng vai trò được phép trả 2xx, còn lại 403 "Bạn không có quyền thực hiện thao tác này" và DB không đổi; cả 5 vai trò `GET` được; không đăng nhập → 401 — kiểm tra: `npm run test:int` xanh

## 5. Giao diện

- [ ] 5.1 `/catalog` chuyển `/catalog/items`; khung D9 với tab Vật tư / Bộ / Nhóm hàng (kèm số), liên kết sang D16; mọi trang `requirePermission("catalog.view")` — kiểm tra: `route-guards.test.ts` xanh; Kế toán mở được, không thấy nút ghi
- [ ] 5.2 D9 bảng vật tư: cột theo thiết kế, tìm và lọc nhóm/trạng thái trên URL, đếm đầu trang, giá tháng = ngày × 30, "Không cho thuê" cho hàng kg — kiểm tra: component test với 8 vật tư mẫu của thiết kế (đếm, lọc, hiển thị giá, trọng lượng "–")
- [ ] 5.3 D9 form vật tư (Sheet): mã chỉ nhập khi tạo, đơn vị chỉ chọn khi tạo, trọng lượng `QuantityInput` kg, giá ngày + giá tháng hiện ngay, giá đền bù; ngừng dùng / dùng lại / xóa có xác nhận — kiểm tra: component test validate phía client khớp thông báo server; E2E Kinh doanh tạo `GG-K17` rồi thấy trên bảng
- [ ] 5.4 D9 khung "Thuộc bộ" khi chọn vật tư (`?item=`), tab Bộ và trình sửa bộ (chọn vật tư + `Stepper`, tổng trọng lượng/giá hiện ngay), tab Nhóm hàng — kiểm tra: component test khung "Thuộc bộ" hiện đúng 43,6 kg, 3.900 ₫/ngày; E2E tạo bộ 3 dòng
- [ ] 5.5 D16 `/catalog/partners`: 4 tab kèm số, danh sách + chi tiết, tìm trên URL, form nhà thầu / nhà cung cấp (Sheet), "Thêm công trình" từ nhà thầu, tab Kho bãi xưởng (nút ghi chỉ Giám đốc) — kiểm tra: component test chi tiết nhà thầu (hạn "30 ngày", điện thoại `0912 345 678`, danh sách công trình); E2E Kế toán sửa hạn thanh toán, Kinh doanh thêm công trình

## 6. Dữ liệu mẫu, E2E, tài liệu, kiểm tra cuối

- [ ] 6.1 Mở rộng `npm run db:seed:dev` (và seed E2E nếu cần) với danh mục mẫu theo thiết kế: 4 nhóm, 8 vật tư, bộ `BO-17`, 2 nhà thầu, 2 nhà cung cấp, 2 công trình; chạy lại không tạo trùng — kiểm tra: chạy 2 lần liên tiếp số dòng không đổi
- [ ] 6.2 E2E `tests/e2e/catalog.spec.ts` (luồng chính 5.3–5.5), thêm `/catalog/items`, `/catalog/partners` vào `responsive.spec.ts` (6 cỡ, không cuộn ngang) và `a11y.spec.ts`; thêm D9, D16 vào `visual.spec.ts` — kiểm tra: `npm run test:e2e` xanh ở local; CI xanh sau workflow Update Playwright snapshots
- [ ] 6.3 Cập nhật `CLAUDE.md` nếu có quy ước mới (mã danh mục, `catalog.*` quyền) — kiểm tra: đọc lại khớp design
- [ ] 6.4 Chạy `npm run lint`, `typecheck`, `format:check`, `test`, `test:coverage`, `build`, `openspec validate master-data --strict` — kiểm tra: tất cả xanh
- [ ] 6.5 Kiểm tra tay trên Edge 1366px: D9, D16 so với file thiết kế; Kế toán và Kinh doanh thấy đúng nút — kiểm tra: ghi kết quả vào PR

## Workflow follow-up

- Sau khi merge: `/opsx:archive master-data`, đóng issue #5.
- Ghi chú cho `inventory-ledger`: chặn ngừng dùng vật tư còn tồn kho; FK từ sổ kho tới `item`, `location` dùng `ON DELETE RESTRICT`.
- Ghi chú cho `goods-receipt`: in nhãn QR, nội dung = mã hàng (design D8).
