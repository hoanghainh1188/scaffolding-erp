# Tasks

## 1. Migration DB

- [x] 1.1 Sửa `src/db/schema/catalog.ts`: `item.code_key` (unique), CHECK mã mới cho `item`/`kit` (design D1), `item_unit_check` 9 đơn vị, `item_weight_check` mới, bỏ `item_rental_unit_check`, `kit.code_key`, `item_group.category` + CHECK, `site.province` + index, `customer.sales_user_id` FK `user` restrict + index; bảng mới `item_alias`. Sửa `purchase_order_line_unit_check` trong `src/db/schema/purchasing.ts`. Xong khi `npm run typecheck` xanh.
- [x] 1.2 `npm run db:generate` ra `drizzle/0013_catalog_extensions.sql`, `code_key` là cột sinh tự động nên dòng cũ tự có khóa; ghi chú rollback ở đầu file (design Migration Plan). Xong khi `npm run db:migrate` chạy hai lần liền không lỗi trên DB dev có dữ liệu seed và `npm run inventory:check` vẫn xanh.
- [x] 1.3 Cấp quyền `item_alias` cho `erp_app` qua `src/db/grants.ts` (CRUD, không phải bảng chỉ ghi thêm). Xong khi `src/db/grants.test.ts` và `privileges.int.test.ts` xanh.
- [x] 1.4 Integration test schema trong `src/db/schema/catalog.int.test.ts`: chèn được `NỐI 34`, `KB+KU34`, `X5*10*3`; chặn `nối 34`, ` H1,7`, `H1,,7`, mã 31 ký tự; trùng `code_key` (`NOI34` sau `NỐI 34`) bị chặn ở `item` và `item_alias`; mã `METER` không trọng lượng bị chặn, `KG` có trọng lượng bị chặn; mã `KG`/`METER` có `daily_rental_price` lưu được; nhóm cũ sau migration có `category = 'EQUIPMENT'`; `sales_user_id` trỏ user không tồn tại bị chặn.

## 2. Luật mã, đơn vị, tỉnh (domain + unit test)

- [x] 2.1 `src/domain/item-code.ts`: `normalizeItemCode`, `parseItemCode` (luật D1, 2–30 ký tự, thông báo theo spec), `itemCodeKey` (bỏ dấu, `Đ`→`D`, bỏ khoảng trắng, chữ thường); đổi `parseCatalogCode` thành `parsePlaceCode` cho bãi/xưởng. Unit test trong `item-code.test.ts` cho mọi scenario "Mã hàng do người dùng gõ" (mã thật, sai định dạng, quá dài, khác dấu/khoảng trắng cùng khóa, `H1,7` khác `H17`).
- [x] 2.2 `src/domain/quantity.ts`: 9 đơn vị, nhãn (`cái`, `cây`, `bó`, `sọt`, `cuộn`, `hộp`, `thùng`, `m`, `kg`), `isCountUnit`, `hasStandardWeight`; `toQuantity`/`parseQuantity` bắt số nguyên theo loại đơn vị với thông báo "Số lượng bó phải là số nguyên". Unit test: 2,5 bó bị chặn, 12,345 m nhận, `PIECE`/`KG` giữ nguyên hành vi cũ (test cũ vẫn xanh).
- [x] 2.3 Quy đổi kg ↔ đơn vị (`src/domain/quantity.ts` hoặc file quy đổi hiện có): đơn vị đếm làm tròn số nguyên (0,5 lên), mét làm tròn 0,001; kg báo "Vật tư tính theo kg, không quy đổi". Unit test: 120,5 m × 3,56 = 428,98 kg; 100 kg ÷ 3,56 = 28,090 m; 1.357 kg → 101 cái; 20,25 kg → 2 cái; 0 → 0.
- [x] 2.4 `src/domain/kit.ts`: linh kiện phải là đơn vị đếm, thông báo "Bộ chỉ gồm vật tư đếm được (cái, cây, bó...)". Unit test: `KG`, `METER` bị chặn; `BAR` nhận.
- [x] 2.5 `src/domain/province.ts` mới: 34 tỉnh/thành (mã, tên, khu vực) theo design D4, `regionOf`, `provincesIn(region)`, `parseProvince` ("Tỉnh/thành không hợp lệ"), nhãn khu vực. Unit test: đủ 34 mã không trùng, 15/11/8 theo miền, Hà Nội/Đà Nẵng/TP. Hồ Chí Minh ra ba miền, Gia Lai và Lâm Đồng là Miền Trung, "Bà Rịa - Vũng Tàu" bị từ chối.
- [x] 2.6 `src/domain/qr-payload.ts` dùng luật mã mới. Unit test: `KB+KU34`, ` h1,7 `, `NỐI 34`, URL `?code=KB%2BKU34` ra `KB+KU34`; nội dung WiFi vẫn bị từ chối.

## 3. Bỏ nhánh `"PIECE"` / `"KG"` ở các phân hệ đang có

- [x] 3.1 Dò mọi chỗ so `"PIECE"` / `"KG"` (`grep -rn "'PIECE'\|\"PIECE\"\|\"KG\"" src`), đổi sang `isCountUnit` / `hasStandardWeight` ở phân hệ đơn mua (`src/lib/purchasing/`, `src/components/purchasing/`): dòng đơn nhận đơn vị của mã hoặc `KG` khi mã có trọng lượng. Xong khi test purchasing hiện có xanh và integration test mới tạo đơn với mã `METER` (đơn vị dòng m và kg) và mã `BUNDLE` xanh.
- [x] 3.2 Như 3.1 cho phiếu nhập (`src/domain/goods-receipt.ts`, `src/lib/receiving/`, `src/components/receiving/`): nhập theo mét có số lẻ; dòng kg của mã bó cần đếm bó + cân kg. Xong khi test receiving cũ xanh và integration test nhập một chuyến `ONG-49` (m) và `TY-REN` (bó) ghi đúng `PURCHASE_IN`.
- [x] 3.3 Như 3.1 cho sửa chữa, kiểm kê, thẻ kho, điều chỉnh, điều chỉnh giá trị, landed cost (`src/domain/landed-cost.ts`, `src/lib/repairs/`, `src/lib/inventory/`, `src/components/{repairs,stocktake,inventory,scan}/`). Xong khi toàn bộ `npm test` xanh và có thêm unit test landed cost chia theo kg cho mã `METER`.
- [x] 3.4 Test tĩnh `src/domain/unit-branches.test.ts`: không file nào trong `src/` (ngoài `src/domain/quantity.ts`, schema, seed, test) còn so trực tiếp `=== "PIECE"` / `=== "KG"`. Xong khi test đỏ nếu thêm lại một phép so như vậy.

## 4. Service danh mục và API

- [x] 4.1 `src/lib/catalog/items.ts`: tạo vật tư dùng `parseItemCode`, lưu `code_key`, kiểm chéo không gian mã (`item`, `kit`, `item_alias`) trong transaction, đơn vị/trọng lượng theo D2, giá thuê mọi đơn vị; `search_text` gồm `code_key`. Integration test trong `items.int.test.ts`: tạo `H1,7`, `H1,7KĐ`, `KB+KU34`, `NỐI 34`; `NOI34` bị từ chối "Mã gần giống mã NỐI 34 đã có"; **mã tính theo kg/mét lưu đúng đơn vị và giá thuê, đọc lại trả `unit = METER`, `unitLabel = "m"`, `standardWeightKg = 3.56`**; `ONG-49` không trọng lượng bị từ chối.
- [x] 4.2 Mã cũ: `aliases` khi tạo/sửa vật tư (≤ 5, kiểm trùng chéo, dựng lại `search_text`, `logActivity` ghi thêm/bỏ). Integration test: **tìm được hàng bằng mã cũ** (`GET /api/catalog/items?q=k1,7` trả `GG-K17`); mã cũ trùng mã chính vật tư khác bị từ chối; tạo vật tư trùng mã cũ bị từ chối; quá 5 mã cũ bị từ chối; Kế toán sửa mã cũ nhận 403; xóa vật tư chưa dùng xóa luôn mã cũ.
- [x] 4.3 `GET /api/stock/lookup`: tra theo mã chính, rồi `code_key`, rồi mã cũ (design D1). Integration test: `noi 34` → `NỐI 34`; `k1,7` → `GG-K17`; mã chính `K1,7` (nếu có) thắng mã cũ; mã lạ trả 404 "Không tìm thấy mã …".
- [x] 4.4 `src/lib/catalog/item-groups.ts` + `/api/catalog/item-groups`: `category` khi tạo/sửa, ghi nhật ký; `GET /api/catalog/items?category=MATERIAL`. Integration test: **thêm nhóm "Que hàn" (Vật tư) và vật tư `QH-2,5` (hộp), lọc `category=MATERIAL` chỉ trả nguyên vật liệu**, lọc `EQUIPMENT` không có `QH-2,5`; đổi phân loại nhóm làm vật tư trong nhóm đổi theo.
- [x] 4.5 `src/lib/catalog/kits.ts`: luật mã mới, `code_key`, chặn linh kiện không đếm được. Integration test: bộ chứa `ONG-49` bị từ chối; bộ có `BAR` lưu được; mã bộ trùng `code_key` của vật tư bị từ chối.
- [x] 4.6 `src/lib/catalog/places.ts` + `/api/catalog/sites`: `province` bắt buộc khi tạo/sửa, ghi nhật ký; lọc `region`, `province`, `region=UNKNOWN`; trả `provinceName`, `region`; bãi/xưởng dùng `parsePlaceCode`. Integration test: **lọc công trình theo khu vực** (6 Nam / 2 Bắc / 1 chưa có tỉnh → `region=SOUTH` trả 6, `region=NORTH` trả 2, `region=UNKNOWN` trả 1, `region=SOUTH&province=HCM` trả 4); thiếu tỉnh bị từ chối; tỉnh lạ bị từ chối; sửa công trình cũ chưa có tỉnh bắt buộc chọn.
- [x] 4.7 `src/lib/catalog/partners.ts` + `/api/catalog/customers`: `salesUserId` (chỉ `SALES`/`DIRECTOR` đang hoạt động, khóa user `FOR SHARE`, ghi nhật ký tên người), lọc `sales=<id>|none`, trả `salesUser { id, name, active }`; route mới `GET /api/catalog/sales-staff` (`catalog.read`). Integration test: gán `khang` thành công; gán Thủ kho bị từ chối; user bị khóa vẫn hiện `active: false`; lọc 5/3/2 như spec; Thủ kho PATCH nhận 403; Kinh doanh khác vẫn đọc được nhà thầu của `khang`. Xong khi `src/app/route-guards.test.ts` xanh với route mới.
- [x] 4.8 Test tĩnh nhật ký `src/lib/activity/coverage.test.ts` và `diffFields` cho `aliases`, `category`, `province`, `salesUserId` xanh.

## 5. Giao diện

- [x] 5.1 Nhờ chat thiết kế cập nhật `docs/design/screens/D9-Items.dc.html` và `D16-Partners.dc.html` theo design D8 (bộ lọc phân loại, mã cũ, đơn vị mới; cột tỉnh/khu vực, bộ lọc khu vực, người phụ trách). Nếu chưa kịp thì làm theo mô tả D8 và ghi lại trong PR. (Apply: file thiết kế chưa vẽ lại; giao diện làm theo D8, đã ghi trong PR.)
- [x] 5.2 D9 (`src/app/(desktop)/catalog/items/page.tsx`, `src/components/catalog/`): nút phân đoạn phân loại + ô nhóm lọc theo phân loại, dòng phụ "Mã cũ", ĐVT và giá kèm đơn vị, tìm có `encodeURIComponent`. Form vật tư: chọn 9 đơn vị (Đếm / Đo), nhãn trọng lượng theo đơn vị, ô mã cũ dạng thẻ. Form nhóm: phân loại. Component test: chọn "m" đổi nhãn thành "kg / m"; giá `ONG-49` hiện "150 ₫/m" và "4.500 ₫/m"; phân loại "Vật tư" đặt `?category=MATERIAL`. Chữ giao diện thêm vào `src/locales/` theo quy ước #117.
- [x] 5.3 D16 tab Công trình (`src/app/(desktop)/catalog/partners/`): cột Tỉnh/thành, Khu vực ("Chưa chọn" khi trống), bộ lọc khu vực + tỉnh trên URL, ô chọn tỉnh tìm không dấu trong form. Component test: chọn Miền Nam đặt `?region=SOUTH`; form không có tỉnh báo "Chọn tỉnh/thành của công trình".
- [x] 5.4 D16 tab Nhà thầu: người phụ trách ở dòng danh sách và chi tiết ("Khang (đã khóa)"), ô chọn trong form, bộ lọc `?sales=`. Component test: lọc "Chưa có người phụ trách" đặt `?sales=none`.
- [x] 5.5 M2 và các chỗ dựng URL có mã (`/inventory/items/[code]`, link từ D9, thẻ quét): dùng `encodeURIComponent` / giải mã đúng; thẻ quét hiện nhãn đơn vị mới. Component test thẻ `ONG-49` hiện "ONG-49 · m · 3,56 kg/m".
- [x] 5.6 Seed dev (`src/lib/catalog/seed.ts` và seed liên quan): mã thật, đơn vị mới, nhóm "Que hàn" Vật tư, mã cũ `K1,7`, tỉnh cho công trình mẫu, người phụ trách `kinhdoanh` cho vài nhà thầu (design Migration Plan bước 5). Xong khi `npm run db:seed:dev` chạy lại không lỗi trên DB đã seed.
- [ ] 5.7 E2E `tests/e2e/catalog.spec.ts` (mã có hậu tố ngẫu nhiên để chạy lại được): tạo vật tư `NỐI 34-<hậu tố>` đơn vị mét có giá thuê, thêm mã cũ, tìm bằng mã cũ ra đúng dòng; mở thẻ kho của mã có `+`; lọc Vật tư ở D9; tạo công trình có tỉnh và lọc Miền Nam ở D16; gán và lọc người phụ trách. Ảnh mốc D9, D16 (`visual.spec.ts`) cập nhật bằng nhãn `update-snapshots`.

## 6. Kiểm tra tổng

- [ ] 6.1 `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate catalog-extensions --strict` đều xanh; `npm run inventory:check` xanh trên DB dev.
- [ ] 6.2 Kiểm tra tay trên Edge 1366px: D9 với `ONG-49`, `KB+KU34`, `NỐI 34` (đủ cột giá, không cuộn ngang); D16 lọc khu vực và người phụ trách; M2 gõ `noi 34` và `k1,7`. So với file thiết kế D9, D16.

## Workflow follow-up

- Gắn nhãn `update-snapshots` vào PR apply khi giao diện đổi; chờ CI xanh.
- Nếu chủ chốt bảng khu vực (D4) hoặc đơn vị "Cây" (D2) khi review, ghi vào `docs/requirements.md` 0.2 trong cùng PR.
- Archive bằng `/opsx:archive catalog-extensions` sau khi merge; kiểm tra tay chưa làm thì ghi vào #33.
