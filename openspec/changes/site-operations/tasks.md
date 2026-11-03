# Tasks: site-operations

Quyết định đã chốt khi vẽ (PR #137, 0.2 #66–#68): chuyển công trình hai cách xác nhận; mua lại giá điền sẵn bằng giá mất, Giám đốc duyệt; đổi hàng = đợt xuất + phiếu thu hồi nối với nhau. Chi tiết chốt khi review PR #138 (04/11/2026), đã ghi 0.2 #69–#72 trong PR propose: chuyển vượt còn phải giao chỉ cảnh báo, M9 chỉ giảm số, cho chuyển giữa hai hợp đồng cùng công trình; cùng nhà thầu không áp tối thiểu 45 ngày ở hợp đồng đi; mua lại áp tối thiểu, không có Nháp, giá khác hợp đồng gắn cờ; đổi hàng số nhận về chỉ dự kiến, thứ tự tự do, "Bỏ chờ thu hồi".

## 1. Cơ sở dữ liệu

- [x] 1.1 Viết `drizzle/0017_site_operations.sql` và schema Drizzle `src/db/schema/site-operations.ts` (+ export ở `index.ts`) theo design D9:
  - bảng `site_transfer` (có `same_customer`, `posted_xact xid8`), `site_transfer_line`, `buy_back_note`, `buy_back_note_line`, `delivery_exchange`, `delivery_exchange_line` (check, unique, FK `ON DELETE RESTRICT`);
  - check `activity_log` thêm loại chứng từ `SITE_TRANSFER`, `BUY_BACK` và thao tác `SEND`.
  - Kiểm: `npm run db:migrate` trên DB dev chạy được, `npm run typecheck` xanh.
- [x] 1.2 Ba trigger trong cùng migration: `site_transfer_frozen`, `buy_back_note_frozen`, `delivery_exchange_frozen`. Kiểm: integration test `src/db/schema/site-operations.int.test.ts` bằng `erp_app`, mỗi ý một ca:
  - UPDATE / DELETE phiếu chuyển `POSTED`, `CANCELLED` và dòng con bị chặn; `DRAFT` sửa được;
  - **cập nhật `moved_quantity` ở transaction khác** transaction ghi sổ (so `posted_xact` với `pg_current_xact_id()`, không so giờ) bị chặn; trong chính transaction ghi sổ, kể cả với `options.now` khác giờ DB, cập nhật được; cập nhật cột khác của dòng trong transaction ghi sổ vẫn bị chặn;
  - `moved_quantity` > `planned_quantity` bị check chặn; `from_contract_id = to_contract_id` bị check chặn;
  - UPDATE phiếu mua lại `APPROVED` / `REJECTED` và dòng con bị chặn; `APPROVED` thiếu `amount_due` bị check chặn;
  - `delivery_exchange` `DONE` không có `return_note_id` bị check chặn; hai lần đổi cùng `delivery_note_id` hoặc cùng `return_note_id` bị unique chặn; `DONE` không đổi được.
- [x] 1.3 Quyền DB: `src/db/grants.ts` cấp CRUD cho sáu bảng mới, không vào `APPEND_ONLY_TABLES`. Kiểm: `grants.test.ts` và `privileges.int.test.ts` xanh.
- [x] 1.4 `CLAUDE.md`: Quy ước code thêm gạch **Chuyển công trình, mua lại, đổi hàng** (`src/lib/site-transfers/`, `src/lib/buy-backs/`, `src/lib/exchanges/`): khóa hai hợp đồng theo id tăng dần; `TRANSFER_OUT/IN` thuộc hợp đồng theo dấu dòng; mua lại duyệt mới ghi `SALE_OUT` ở công trình; đổi hàng không có chứng từ riêng; M9 không giá. Từ điển thêm "Phiếu chuyển công trình ↔ `site_transfer`", "Phiếu mua lại ↔ `buy_back_note`", "Đổi hàng ↔ `delivery_exchange`". Lưu ý E2E theo mục 7. Kiểm: `npm run format:check` xanh.

## 2. Logic thuần + unit test (viết test trước)

- [x] 2.1 Tách phần "rút Mới trước rồi Tốt" của `allocateReturn` thành hàm chung (`src/domain/condition-split.ts`), `allocateReturn` gọi lại. Kiểm: test cũ của `return-note.test.ts` vẫn xanh; test mới: 20 Mới + 100 Tốt rút 50 → 20 Mới, 30 Tốt; rút 0 → rỗng; rút quá → lỗi.
- [x] 2.2 `src/domain/site-transfer.ts`: `transition()` (bảng trạng thái D1), `assertTransferLines` (D3), `allocateTransfer` ra cặp `TRANSFER_OUT` / `TRANSFER_IN` có `pairedWith`, `assertMovedQuantities` (thực chở ≤ ghi, không tất cả 0). Kiểm: unit test từng câu spec `site-transfers`:
  - chuyển quá đang ở công trình (130 / 120) đúng câu; mã không có trên hợp đồng nhận; khác nhà thầu chưa tích; vượt còn phải giao chưa xác nhận;
  - 20 Mới + 100 Tốt chuyển 50 → −20 Mới, −30 Tốt ra, +20 Mới, +30 Tốt vào;
  - thực chở 55 / 50 bị chặn, 36 / 40 được, tất cả 0 bị chặn;
  - chuyển trạng thái không hợp lệ (sửa `SENT`, rút về `POSTED`) đúng câu.
- [x] 2.3 `src/domain/buy-back.ts`: `assertBuyBackLines` (số > 0, số nguyên, ≤ đang ở công trình, mã có ở công trình, đơn giá ≥ 0, thiếu giá mất), `buyBackTotal`, `isOffContractPrice`, `buyBackDueDate`, `transition()`. Kiểm: unit test tính tiền với trường hợp biên:
  - 20 × 35.000 + 50 × 12.000 = 1.300.000 ₫; đơn giá 0 → dòng 0 ₫, vẫn hợp lệ, đánh dấu khác giá;
  - mua 130 / 120 đúng câu; số lẻ với mã theo cái;
  - hạn trả 05/11/2026 + 30 = 05/12/2026; qua cuối tháng, qua năm (20/12/2026 + 30 = 19/01/2027);
  - đổi giá hợp đồng sau khi lập không đổi `unit_price` đã lưu.
- [x] 2.4 Hàm thuần "tiền thuê 1 ngày" và "ảnh hưởng" cho D6b / D6c / D6d (`src/domain/rental.ts` hoặc file mới): số × giá ngày; chuyển 50 × 1.200 + 40 × 300 → giảm 72.000 ₫; mua lại 20 × 100 + 50 × 20 → 3.000 ₫; đổi 100 × 300 → 100 × 280 → −2.000 ₫; còn phải giao 600 → 550; số 0 → 0 ₫. Kiểm: unit test các số đó.
- [x] 2.5 Tóm tắt nhật ký trong `src/domain/site-operations-summary.ts` (như `delivery-summary.ts`, `return-summary.ts`); `src/domain/activity.ts` thêm `SITE_TRANSFER`, `BUY_BACK`, thao tác `SEND` (nhãn "Gửi điện thoại", nhóm `APPROVAL`, không vào ô Duyệt / ghi sổ). Kiểm: unit test câu tóm tắt đúng spec (ghi sổ chở ít hơn 4 cái; mua lại 1.300.000 ₫; đổi hàng); `activity-filter.test.ts` lọc được hai loại mới.
- [x] 2.6 Quyền `buybacks.approve` (Giám đốc) trong `src/domain/permissions.ts`. Kiểm: `permissions.test.ts` (chỉ `DIRECTOR`).

## 3. Phiếu chuyển công trình (service + API)

- [x] 3.1 `lockContractsInOrder(tx, ids)` trong `src/lib/contracts/records.ts`. Kiểm: integration test hai id bất kỳ luôn khóa theo thứ tự tăng dần.
- [x] 3.2 `siteMovements` thêm nhánh phiếu chuyển (dấu dòng theo hợp đồng đi / nhận) và phiếu mua lại (design D8). Kiểm: integration test:
  - sau chuyển 50 `H1,7` An Phú → Dương Nội: đang ở công trình An Phú −50, Dương Nội +50, còn phải giao Dương Nội 600 → 550;
  - **hai hợp đồng cùng một công trình**: tồn vị trí không đổi, hai hợp đồng tách đúng;
  - phiếu Nháp, Chờ xác nhận không tính; test cũ `deliveries`, `returns` vẫn xanh.
- [x] 3.3 `src/lib/site-transfers/service.ts`: lập, sửa (`updatedAt` → 409; khóa hợp đồng đi + hợp đồng nhận cũ + mới theo id tăng dần rồi mới khóa phiếu, design D4), gửi điện thoại, rút về, hủy (lý do); mã `CCT` qua `nextDocumentCode`; mỗi lệnh `logActivity` một dòng. Kiểm: integration test từng chuyển trạng thái, 409, câu từ chối, **mỗi thao tác đúng một dòng nhật ký**, lệnh bị từ chối không ghi.
- [x] 3.4 `src/lib/site-transfers/post.ts` `postSiteTransfer` (design D4): mã nháp trước, khóa hai hợp đồng theo id, khóa phiếu, kiểm lại, `postMovements`, hợp đồng nhận `APPROVED` → `ACTIVE`, một dòng nhật ký. Văn phòng lập + xác nhận ngay trong một transaction. Kiểm: integration test:
  - **ghi đúng hai vị trí**: `TRANSFER_OUT` ở An Phú, `TRANSFER_IN` ở Dương Nội, cùng tình trạng, rút Mới trước; **tổng tồn và giá BQ không đổi**; `inventory:check` 0 lệch;
  - **chuyển nhiều hơn số đang ở công trình A bị chặn**, không dòng sổ, phiếu giữ trạng thái; hàng đã trả về trước khi ghi sổ bị chặn;
  - ngày chuyển = ngày ghi sổ (`options.now` 21:40 05/11 gửi lúc 06:50 06/11 → 06/11);
  - hợp đồng nhận Đã duyệt sang Đang thực hiện, không thêm dòng nhật ký hợp đồng;
  - gửi lại cùng mã nháp → một bộ dòng sổ, một dòng nhật ký; văn phòng và M9 cùng xác nhận → một lần ghi sổ;
  - khác nhà thầu / vượt còn phải giao có xác nhận → nhật ký gắn cờ "Có xác nhận bất thường";
  - lưu `same_customer` đúng (cùng Minh Phát → true; Minh Phát → Phú Đạt → false);
  - phiếu bị đổi hợp đồng nhận giữa lúc đọc và lúc khóa → 409, không ghi gì (đọc lại cặp hợp đồng sau khi khóa phiếu).
- [x] 3.5 Test đồng thời `src/lib/site-transfers/concurrency.int.test.ts`: **hai lệnh chuyển ngược chiều cùng lúc** (A → B và B → A, hai kết nối) đều xong, không lỗi deadlock (`40P01`), số đang ở công trình mỗi bên bằng trước; thêm ca chuyển A → B song song với `postReturn` của A trả hết hàng: đúng một lệnh thành công; thêm ca **sửa hợp đồng nhận (B → C) song song với "Xác nhận chuyển"**: không lần nào có dòng sổ ở C khi lệnh ghi sổ chỉ khóa A, B (hoặc ghi sang B rồi lệnh sửa bị từ chối, hoặc ghi sổ trả 409). Kiểm: chạy 20 lần liên tiếp xanh.
- [x] 3.6 Không hủy hợp đồng nhận còn phiếu chuyển chưa xong hoặc đã nhận hàng chuyển đến (sửa kiểm hủy ở `src/lib/contracts/`). Kiểm: integration test đúng câu spec `deliveries`.
- [x] 3.7 Route `/api/site-transfers` (D10) và `/api/m/site-transfers` bọc `withAuth`; quyền theo D7 (cả hai hợp đồng); M9 không trả giá. Kiểm: integration test 403 cho `thuyvy` (Chỉ bán), `vantung` lập, `quocbao` xác nhận M9; test API M9 không có trường giá; `route-guards.test.ts` xanh.

## 4. Phiếu mua lại (service + API)

- [x] 4.1 `src/lib/buy-backs/service.ts`: lập (Chờ duyệt, giá điền sẵn từ `contractTermsAt` hôm nay, lưu `contract_price`), sửa (`updatedAt` → 409). Kiểm: integration test giá điền sẵn, sửa giá được đánh dấu, thiếu giá mất bị chặn, mua quá bị chặn, một dòng nhật ký mỗi lệnh, giá khác hợp đồng gắn cờ.
- [x] 4.2 `src/lib/buy-backs/approve.ts`: duyệt (khóa hợp đồng → phiếu, kiểm lại đang ở công trình, `overdueDebt` → lý do, `SALE_OUT` ở công trình rút Mới trước, lưu `amount_due`, `approved_date`, `due_date`), từ chối (lý do). Kiểm: integration test:
  - **mua lại thôi tính thuê đúng ngày**: duyệt ngày 05/11/2026 → dòng sổ ngày 05/11, đang ở công trình giảm 20 `TR16` từ đó; tiền thuê 1 ngày giảm 3.000 ₫;
  - **ra tiền bán đúng**: `amount_due` 1.300.000 ₫, hạn trả 05/12/2026; giá BQ không đổi, `inventory:check` 0 lệch;
  - hàng đã trả về trước khi duyệt bị chặn, phiếu vẫn Chờ duyệt; từ chối không ghi sổ;
  - hai lệnh duyệt cùng lúc → một lần ghi sổ; một dòng nhật ký Duyệt / Từ chối.
- [x] 4.3 Route `/api/buy-backs` (D10) bọc `withAuth`, quyền theo D7. Kiểm: 403 cho `quocbao` duyệt, `thuyvy` lập; `route-guards.test.ts` xanh.

## 5. Đổi hàng (service + API, nối M4)

- [x] 5.1 `src/lib/exchanges/service.ts`: lập đổi hàng gọi hàm tạo đợt của `deliveries` và tạo `delivery_exchange` trong một transaction; bỏ chờ thu hồi (lý do); hủy phiếu xuất của lần đổi `WAITING` thì hủy lần đổi. Kiểm: integration test mã giao ra chưa có trên hợp đồng, nhận về quá, không có mã nhận về, nhật ký đúng một dòng Tạo "Đổi hàng · …", bỏ chờ thu hồi một dòng Sửa.
- [x] 5.2 `postReturn` nhận `exchangeId`: sau khóa hợp đồng, khóa `delivery_exchange` `FOR UPDATE`, kiểm cùng hợp đồng và `WAITING`, nối và `DONE`. Kiểm: integration test nối đúng; lần đổi của hợp đồng khác bị chặn; hai phiếu nối cùng lần đổi → một phiếu; không gửi `exchangeId` → như cũ; ngày đổi: xuất 06/11 và thu hồi 06/11 cho đúng dòng sổ hai ngày.
- [x] 5.3 Route `/api/exchanges` và trường `exchangeId` của `POST /api/m/returns`; `GET /api/m/returns/contracts/<id>` trả lần đổi chờ (mã, số dự kiến, không giá). Kiểm: integration test 403 cho `vantung` lập đổi hàng; API M4 không có giá.

## 6. Giao diện

- [x] 6.1 D6: ba cột "Chuyển đến", "Chuyển đi", "Mua lại" (chỉ khi khác 0), dòng thời gian phiếu chuyển / mua lại / nhãn "Đổi hàng" có liên kết, nút "Chuyển công trình", "Khách mua lại", "Đổi hàng" theo quyền. Kiểm: component test các ca spec `deliveries` (hai hợp đồng sau chuyển, không có cột khi 0, Kế toán không thấy nút).
- [x] 6.2 D6b `/sales/contracts/[id]/site-transfer/new` và `/sales/site-transfers/[code]` theo `D6b-SiteTransfer.dc.html` (token, không hex): chọn hợp đồng nhận, bảng hàng có "Rút từ", hai cách xác nhận, khối ảnh hưởng tiền thuê, ô xác nhận khác nhà thầu / vượt; câu tối thiểu 45 ngày theo 0.2 #70 ("Cùng nhà thầu: hàng chuyển không tính tối thiểu 45 ngày ở <đi>, thuê nối tiếp sang <nhận>." / "Khác nhà thầu: mỗi hợp đồng tính tối thiểu 45 ngày riêng.") thay câu cũ của bản vẽ. Kiểm: component test cột rút từ, danh sách hợp đồng nhận, thông báo lỗi; trang chi tiết chỉ xem với Kế toán.
- [ ] 6.3 M9 `/m/site-transfers/[code]` theo `M9-SiteTransfer.dc.html`: stepper thực chở (không vượt), câu "Chở ít hơn N cái", biển số, nháp loại `TRANSFER` trong `src/lib/drafts/`, mã nháp; M1 khối "Chuyển công trình"; M7 dòng "Chuyển" và bộ lọc `?type=transfer`. Kiểm: component test các ca spec `site-transfers`, `mobile-home`, `mobile-history`; không có giá trên M9.
- [ ] 6.4 D6c `/sales/contracts/[id]/buy-back/new` và `/sales/buy-backs/[code]` theo `D6c-BuyBack.dc.html`: giá điền sẵn, nhãn "khác giá hợp đồng", khối "Khi duyệt", thanh duyệt cho Giám đốc (lý do khi nợ quá hạn, từ chối có lý do), dòng "Tính thuê tới khi duyệt" ngay dưới nút Duyệt. Kiểm: component test các ca spec `buy-backs`.
- [ ] 6.5 D6d `/sales/contracts/[id]/exchange/new` theo `D6d-Exchange.dc.html`: giao ra từ bãi, nhận về, chuyến xe (ngày dự kiến bằng `DateInput`, biển số, cước mặc định từ hợp đồng), tiền thuê sau khi đổi, hai chứng từ sẽ tạo; M4 hiện lần đổi chờ và ô "Phiếu này là hàng đổi". Kiểm: component test xem trước −2.000 ₫ và ô tích sẵn trên M4.
- [ ] 6.6 D18 lọc Phiếu chuyển công trình, Phiếu mua lại, thao tác "Gửi điện thoại". Kiểm: component test bộ lọc.

## 7. Seed, E2E, ảnh mốc

- [ ] 7.1 `npm run db:seed:dev` thêm hợp đồng nhận Dương Nội (Đã duyệt, cùng Minh Phát), một `CCT` Chờ xác nhận như M9, một `MLA` Chờ duyệt như D6c, một đổi hàng Chờ thu hồi như D6d; `CLAUDE.md` bảng lệnh ghi thêm. Kiểm: chạy seed hai lần không lỗi, không trùng.
- [ ] 7.2 E2E `e2e/site-operations.spec.ts` (dùng hợp đồng thuê E2E của `deliveries.spec.ts` và một hợp đồng thuê E2E thứ hai do global setup tạo một lần, ghi `E2E-KHO-01/02`, kiểm theo chênh lệch): chuyển công trình văn phòng xác nhận và qua M9 (D6 hai hợp đồng đổi đúng); Kinh doanh lập mua lại, Giám đốc duyệt (đang ở công trình giảm); đổi hàng: lập, M5 xuất, M4 nối. Global setup hủy phiếu chuyển Nháp / Chờ xác nhận và từ chối phiếu mua lại Chờ duyệt do `e2e.*` lập lần trước. Kiểm: `npm run test:e2e` xanh.
- [ ] 7.3 Ảnh mốc `@visual` cho D6b, D6c, D6d, M9 và D6 có cột chuyển (dữ liệu seed, ngày cố định). Kiểm: gắn nhãn `update-snapshots` vào PR, CI chạy lại xanh.

## 8. Kiểm tra toàn bộ

- [ ] 8.1 `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate site-operations --strict` đều xanh; coverage `src/domain`, `src/lib` ≥ 80 %; `npm run inventory:check` 0 lệch trên DB dev sau seed.
- [ ] 8.2 Kiểm tra tay (issue #132 bước 9): chuyển 50 khung từ An Phú sang Dương Nội (D6 cả hai hợp đồng đổi đúng, giá BQ không đổi); khách mua lại 20 ty ren (thôi tính thuê từ ngày duyệt, tiền bán đúng); đổi 100 chéo dài lấy chéo ngắn (hai phiếu trỏ tới nhau). Chưa làm được thì ghi "làm sau, theo dõi ở #33" và thêm mục vào issue #33.

## Workflow follow-up

- Merge PR apply, rồi trong phiên mới chạy `/opsx:archive site-operations`, mở PR archive ghi `Closes #132`.
