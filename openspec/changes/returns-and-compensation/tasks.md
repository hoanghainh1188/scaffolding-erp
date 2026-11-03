# Tasks: returns-and-compensation

Các quyết định đã chốt khi review PR #134 (03/11/2026), ghi ở 0.2 #61–#65: Phế liệu lần đầu theo giá sắt vụn; ảnh Postgres 1.280 px / 6 ảnh / cảnh báo 200 MB; thêm `sharp`; Kinh doanh xem D8 không duyệt.

## 1. Tài liệu và cơ sở dữ liệu

- [x] 1.1 Ghi quyết định vào `docs/requirements.md` 0.2 #61 (phiếu thu hồi, chặn hàng lạ, ngày trả), #62 (đổi tình trạng, Phế liệu lần đầu theo giá sắt vụn), #63 (`LOSS_OUT`), #64 (phiếu đền bù, số lưu khi duyệt, quyền xem), #65 (ảnh); `docs/ops/demo.md` ghi dung lượng ảnh và mốc chuyển kho; chốt 03/11/2026 khi review PR #134. Đã ghi trong PR propose #134. Kiểm: đọc lại bảng 0.2, `npm run format:check` xanh.
- [x] 1.2 Viết `drizzle/0016_returns.sql` và schema Drizzle `src/db/schema/returns.ts` (+ export ở `index.ts`) theo design D9:
  - bảng `return_note`, `return_note_line`, `compensation_note`, `compensation_note_line`, `return_photo` (check, unique, FK `ON DELETE RESTRICT`);
  - tạo lại `inventory_ledger_movement_check` có `LOSS_OUT`, check `activity_log` có `RETURN_NOTE`, `COMPENSATION_NOTE`, `REJECT`;
  - `MOVEMENTS_OUT` trong `src/db/schema/inventory.ts` thêm `LOSS_OUT`.
  - Kiểm: `npm run db:migrate` trên DB dev chạy được, `npm run typecheck` xanh.
- [x] 1.3 Ba trigger trong cùng migration: `return_note_frozen`, `compensation_note_frozen`, `return_photo_frozen`. Kiểm: integration test `src/db/schema/returns.int.test.ts` bằng `erp_app`, mỗi ý một ca:
  - UPDATE / DELETE `return_note` và dòng bị chặn;
  - **chèn thêm dòng vào phiếu đã ghi sổ ở transaction khác bị chặn** (kiểm `created_xact`, không theo giờ); ghi sổ có `options.now` khác giờ DB vẫn chèn được dòng;
  - chèn dòng phiếu đền bù ở transaction khác bị chặn; gắn ảnh vào phiếu của transaction khác bị chặn;
  - UPDATE `compensation_note` `APPROVED` bị chặn, cả dòng con; `PENDING` sửa được;
  - DELETE ảnh đã gắn phiếu bị chặn; gắn ảnh nháp vào phiếu một lần được, đổi sang phiếu khác bị chặn;
  - `APPROVED` thiếu `amount_due` bị check chặn; giảm trừ > 0 không lý do bị chặn;
  - hai phiếu đền bù cùng `return_note_id` bị unique chặn;
  - `LOSS_OUT` số dương bị check chặn.
- [x] 1.4 Quyền DB: kiểm `src/db/grants.ts` cấp CRUD cho năm bảng mới, không thêm vào `APPEND_ONLY_TABLES`. Kiểm: `grants.test.ts` và `privileges.int.test.ts` xanh.
- [ ] 1.5 Thêm `sharp` vào `dependencies`, tạo lại `package-lock.json` bằng npm 11.19. Kiểm: `npm ci` sạch, `npm run build` xanh.
- [ ] 1.6 `CLAUDE.md`:
  - Quy ước code thêm gạch **Phiếu thu hồi và đền bù** (`src/lib/returns/`, `src/lib/compensations/`): `postReturn` khóa hợp đồng trước; rút Mới trước; `LOSS_OUT`; phiếu đền bù tự sinh; ảnh `bytea` không chọn `content` trong danh sách; M4 không giá;
  - từ điển thêm "Phiếu thu hồi ↔ `return_note`", "Hàng mất ↔ `LOSS_OUT`";
  - Lưu ý E2E như design.
  - Kiểm: `npm run format:check` xanh.

## 2. Logic thuần + unit test (viết test trước)

- [x] 2.1 `src/domain/movement.ts` thêm `LOSS_OUT` (nhãn thẻ kho "Mất ở công trình", không đổi giá). Kiểm: `movement.test.ts`: `isInbound("LOSS_OUT")` sai, `changesAverage` sai, số dương báo "Dòng xuất phải có số lượng âm".
- [x] 2.2 `src/domain/return-note.ts` gồm `assertReturnLines` (chia tình trạng, số nguyên, bỏ dòng 0, phiếu rỗng, mã lạ, trả quá) và `allocateReturn` (Mới trước rồi Tốt; nhóm Tốt → Chờ sửa → Phế liệu → Mất) ra `MovementDraft[]` có `pairedWith`. Kiểm: unit test **chia tình trạng phải khớp tổng**:
  - 82 / 15 / 3 / 2 với tổng 100 → đủ; 250 + 5 với tổng 260 → "Còn 5 cái chưa phân loại";
  - 10,5 cái → lỗi số nguyên;
  - **không trả quá**: 115 + 10 / 120 → đúng câu spec;
  - mã không ở công trình → câu spec có số hợp đồng;
  - 30 Mới + 90 Tốt trả 80 / 15 / 3 / 2 → −30 Mới, −68 Tốt `RETURN_OUT`, `RETURN_IN` 80 Tốt / 15 Chờ sửa / 3 Phế liệu, `LOSS_OUT` −2 Tốt, còn 20 Tốt;
  - chỉ Mất → chỉ có `LOSS_OUT`;
  - **Phế liệu lần đầu**: nhóm chưa có giá → `unitCost` = min(13,6 kg × 7.500, 167.000) = 102.000; giá sắt vụn cao hơn giá dòng ra → giá dòng ra; nhóm đã có giá BQ → không đặt `unitCost`; chưa có giá sắt vụn / chưa có trọng lượng chuẩn → câu của 0.2 #23;
  - hàng kg (số lẻ) qua.
- [x] 2.3 `returnValueSummary(postedLines)`: giá trị giảm do đổi tình trạng, giá trị hàng mất, tính từ dòng sổ. Kiểm: unit test: ví dụ trên ra 6.870.000 ₫ và 800.000 ₫; trả đúng tình trạng ra 0 ₫.
- [x] 2.4 `src/domain/compensation.ts`: `compensationLines`, `compensationTotal`, `assertDiscount`, `amountDue`, `dueDate`, `transition()`, `COMPENSATION_MESSAGES` (design D10). Kiểm: unit test:
  - **đơn giá theo tình trạng, Phế liệu = giá mất**: 15 × 50.000, 3 × 450.000, 2 × 450.000;
  - tổng D8 3.915.000 ₫ và tóm tắt 22 / 3 / 4;
  - số 0 không thành dòng; không có hỏng / mất → không có dòng;
  - giá trống → `null`, tổng báo câu "MAM1,6 Mất chưa có giá đền…";
  - giảm 415.000 có lý do → 3.500.000; không lý do → câu spec; giảm hết → 0; giảm quá → câu spec;
  - hạn 06/11 + 15 = 21/11, + 0 = 06/11, qua tháng / năm (25/12 + 15 = 09/01);
  - kg lẻ làm tròn 1 ₫;
  - mọi cặp trạng thái × lệnh.
- [x] 2.5 `src/domain/return-photo.ts`: `PHOTO_MAX_UPLOAD_BYTES` (4 MB), `PHOTO_MAX_PER_NOTE` (6), `PHOTO_MAX_EDGE` (1.280), `PHOTO_QUALITY` (70), `PHOTO_STORAGE_WARN_BYTES` (200 MB), `photoStorageStatus(bytes)`. `src/domain/image-type.ts` `detectImageType(bytes)`: JPEG, PNG, WebP theo magic bytes, còn lại `null`. Kiểm: unit test: PDF đổi đuôi `.jpg` → `null`; PNG thật; WebP thật; `RIFF` không phải `WEBP` → `null`; file rỗng / 3 byte → `null`; `photoStorageStatus`: 200 MB − 1 byte → `ok`, 200 MB + 1 byte → `warning`.
- [x] 2.6 `src/domain/permissions.ts` thêm `returns.receive` (`DIRECTOR`, `WAREHOUSE`), `compensations.approve` (`DIRECTOR`). `src/domain/activity.ts` thêm `RETURN_NOTE` ("Phiếu thu hồi"), `COMPENSATION_NOTE` ("Phiếu đền bù"), `REJECT` ("Từ chối", nhóm Trả lại / hủy / xóa). Tóm tắt nhật ký ở `src/domain/return-summary.ts`. Kiểm: `permissions.test.ts` scenario "Đọc bảng quyền thu hồi"; `return-summary.test.ts` có đúng câu spec ("Duyệt ĐB-2026-009: 3.500.000 ₫ (giảm 415.000 ₫: …)", "Sửa ĐB-…: đơn giá … trống → 380.000 ₫").

## 3. Service (integration test, mỗi lệnh một transaction)

- [x] 3.1 `src/lib/deliveries/records.ts`: `onSiteByItem` cộng nhánh `RETURN_NOTE` (`UNION ALL`), thêm `onSiteByItemCondition`; D6 tính "Đã trả" từ dòng ra ở công trình của phiếu thu hồi. Kiểm: `queries.int.test.ts` thêm:
  - **sau thu hồi**: 320 xuất, trả 100, mất 2 → đã trả 102, đang ở 218, còn phải giao 82;
  - mất hết `MAM1,6` → đang ở 0, tiền 1 ngày 0 ₫;
  - hai hợp đồng cùng công trình không cộng lẫn;
  - test cũ "Trả rồi lấy lại" chạy bằng phiếu thu hồi thật.
- [x] 3.2 `src/lib/returns/post.ts` `postReturn` theo design D7: mã nháp trước, khóa hợp đồng, kiểm hợp đồng / bãi, đọc đang ở công trình, `allocateReturn`, `postMovements`, chèn phiếu + dòng, gắn ảnh, `nextDocumentCode('PTH')`. Kiểm: `post.int.test.ts`:
  - ghi đúng vị trí (`RETURN_OUT` `CT-0003`, `RETURN_IN` `BAI-01`, `LOSS_OUT` `CT-0003`);
  - **ghi theo giá BQ hiện tại, giá BQ không đổi**, kể cả khi đổi tình trạng;
  - **`reconcile` / `npm run inventory:check` khớp** sau phiếu đổi tình trạng và có hàng mất;
  - **Phế liệu lần đầu theo giá sắt vụn** (102.000 ₫ / cái, giá BQ Phế liệu đặt bằng số đó); Phế liệu đã có giá BQ 95.000 ₫ → 95.000 ₫; chưa có giá sắt vụn → câu spec, không dòng sổ nào;
  - hợp đồng bán / Đã duyệt / Thanh lý → từ chối; nhận về xưởng → câu spec;
  - **không trả quá** (kể cả sau một phiếu xuất mới trong lúc đếm);
  - ngày trả = hôm nay giờ VN (giả 21:50 rồi gửi 07:10 hôm sau → ngày sau, lưu `saved_on_device_at`).
- [x] 3.3 Chống ghi trùng và đồng thời trong `post.int.test.ts`:
  - **gửi lại cùng mã nháp** → cùng `PTH`, không thêm dòng sổ / phiếu đền bù / nhật ký;
  - mã nháp của người khác → 409;
  - **hai phiếu cùng lúc** mỗi phiếu 70 / 120 (`Promise.all`, hai kết nối) → đúng một phiếu ghi sổ, phiếu kia nhận câu trả quá với 50 cái;
  - thu hồi và phiếu xuất cùng hợp đồng cùng lúc không lệch "đang ở công trình".
- [x] 3.4 Phiếu đền bù tự sinh trong `postReturn` (`src/lib/compensations/create.ts`): `contractTermsAt(ngày trả)`, `compensationLines`, `nextDocumentCode('ĐB')`. Kiểm: integration test:
  - có hỏng / mất → một `ĐB` `PENDING` đúng dòng và giá;
  - **chỉ Tốt → không có phiếu đền bù, bảng đếm `ĐB` không tăng**;
  - **giá theo bản hợp đồng tại ngày trả**: phụ lục 01/11 đổi 450.000 → 480.000, trả 05/11 → 480.000, trả 31/10 → 450.000;
  - hợp đồng không có giá `MAM1,6` → dòng `unit_price` trống.
- [ ] 3.5 `src/lib/compensations/service.ts`: sửa giá / giảm trừ, duyệt, từ chối (design D7): khóa `FOR UPDATE`, `updatedAt` → 409, `transition()`, `overdueDebt`, lưu `amount_due`, `approved_date`, `due_date`. Kiểm: `service.int.test.ts`:
  - duyệt lưu đúng 3.500.000 / 06/11 / 21/11;
  - còn dòng chưa có giá → câu spec;
  - nhập giá rồi duyệt;
  - nợ quá hạn (giả `overdueDebt`) không lý do → câu spec, có lý do → được;
  - từ chối không lý do → câu spec, có lý do → `REJECTED`, không `amount_due`;
  - sửa phiếu đã duyệt → 409;
  - hai tab sửa → 409;
  - **duyệt hai lần cùng lúc** (`Promise.all`) → một lần thành công, một dòng nhật ký.
- [ ] 3.6 Ảnh: `src/lib/returns/photos.ts`:
  - nhận ảnh: giới hạn 4 MB khi đọc, `detectImageType`, ≤ 6 ảnh / mã nháp, `sharp` (`limitInputPixels`, `rotate`, resize 1.280, WebP chất lượng 70 không metadata), trùng `(draft, clientPhotoId)` trả mã cũ, dọn ảnh nháp > 7 ngày;
  - đọc ảnh theo quyền;
  - `postReturn` kiểm `photoIds`: thiếu ảnh → lỗi `PHOTOS_EXPIRED` kèm danh sách, rollback.
  - Kiểm: `photos.int.test.ts` với file mẫu tạo bằng `sharp` trong test:
    - **file giả dạng ảnh bị từ chối**;
    - **ảnh quá lớn bị từ chối**;
    - **EXIF bị xóa** (đọc lại bằng `sharp().metadata()`: không `exif`, không GPS);
    - ảnh hỏng → câu spec;
    - ảnh 3.000 × 4.000 lưu thành WebP 960 × 1.280;
  - ảnh thứ 7 → câu spec;
    - gửi lại cùng ảnh không tạo trùng;
    - **người không có quyền không xem được** (Kinh doanh chỉ bán, Xưởng → không tìm thấy);
    - ảnh nháp của người khác → không tìm thấy;
    - dọn ảnh 8 ngày tuổi, giữ ảnh 6 ngày;
    - **lưu phiếu với ảnh đã bị dọn** → `PHOTOS_EXPIRED` chỉ với mã đã mất, không có dòng sổ, không có phiếu; gửi lại ảnh rồi lưu → ghi sổ đủ 4 ảnh.
- [ ] 3.7 Truy vấn: `src/lib/returns/queries.ts` (M4 danh sách hợp đồng / mở hợp đồng không giá, chi tiết desktop, M1 hôm nay, M7 theo ngày) và `src/lib/compensations/queries.ts` (danh sách lọc trạng thái, D8, khối D5). Kiểm: integration test:
  - truy vấn M4 / M7 **không có khóa giá, tiền** (so khóa object);
  - danh sách M4 bỏ hợp đồng đã trả hết;
  - tìm "An Phú";
  - chi tiết có giá trị giảm và giá trị mất;
  - danh sách lọc `PENDING`;
  - danh sách không chọn cột `content`.
- [ ] 3.8 Nhật ký: thêm `src/lib/returns/`, `src/lib/compensations/` vào `src/lib/activity/coverage.test.ts`. Kiểm: integration test **mỗi thao tác ghi đúng một dòng nhật ký**:
  - Ghi sổ `PTH`, Tạo `ĐB`, Sửa, Duyệt, Từ chối;
  - lưu không đổi không ghi; lệnh bị từ chối không ghi;
  - duyệt có giảm trừ / nợ quá hạn gắn cờ "Có xác nhận bất thường";
  - `coverage.test.ts` xanh.

## 4. API

- [ ] 4.1 Route điện thoại theo design D12: `GET /api/m/returns/contracts`, `GET /api/m/returns/contracts/[id]`, `POST /api/m/returns/photos`, `POST /api/m/returns`, `GET /api/m/returns/[code]`. Quyền `returns.receive`, lỗi dịch qua `respond.ts` (413 cho ảnh quá lớn). Kiểm: route test:
  - **trả lời M4 không có trường giá, tiền** (so khóa JSON);
  - `quocbao` `POST /api/m/returns` → 403, không có dòng sổ;
  - `WORKSHOP` → 403;
  - gửi lại cùng `draftId` → 200 cùng `PTH`;
  - ảnh hết hạn → 422 `{ code: "PHOTOS_EXPIRED", expiredPhotoIds }`.
- [ ] 4.2 Route văn phòng: `GET /api/returns/[code]`, `GET /api/returns/photos/[id]` (`Cache-Control: private, no-store`, `nosniff`, 404 khi không quyền), `DELETE …` → 405, `GET /api/compensations`, `GET|PUT /api/compensations/[id]`, `POST …/approve`, `…/reject`. Kiểm: route test:
  - Kế toán `approve` → 403, `GET` D8 → 200;
  - Thủ kho `GET /api/compensations` → 403;
  - `thuyvy` (Chỉ bán) xem phiếu thu hồi → 403, xem ảnh → 404;
  - chưa đăng nhập xem ảnh → 401;
  - header ảnh đúng;
  - `route-guards.test.ts` xanh.
- [ ] 4.3 Cảnh báo dung lượng ảnh: `GET /api/health` thêm `data.photoStorage` (`sum(byte_size)` so `PHOTO_STORAGE_WARN_BYTES`, không trả số), trang Cài đặt hiện số MB và câu cảnh báo cho Giám đốc. Kiểm: route test health 210 MB → `"warning"`, 35 MB → `"ok"`, phản hồi không có số MB; component test câu cảnh báo của spec `system-health`; test cũ của health vẫn xanh.

## 5. Giao diện Desktop

- [ ] 5.1 D8 `/sales/compensations/[code]` theo `docs/design/screens/D8-Compensation.dc.html` (token thay hex, số theo 0.2 #40, menu "Cho thuê & Bán"):
  - thanh chờ duyệt;
  - nguồn, bảng hàng hỏng / mất, ô nhập giá cho dòng chưa có giá;
  - ảnh (mở lớn);
  - giảm trừ + lý do, nút "Duyệt <tiền>" đổi theo giảm trừ;
  - hộp thoại từ chối có câu nhắc (design D3), cảnh báo nợ quá hạn + ô lý do duyệt;
  - tóm tắt, hạn trả; phiếu đã duyệt / từ chối chỉ xem;
  - `requireContractAccess(view)`.
  - Kiểm: component test theo spec "Màn D8 Phiếu đền bù" và "Quyền với phiếu đền bù" (Kế toán không có nút), hộp thoại từ chối có câu "Từ chối thì không thu 3.915.000 ₫ đền bù của PTH-2026-071…".
- [ ] 5.2 Danh sách `/sales/compensations` (lọc trạng thái trên URL, mặc định Chờ duyệt) + mục menu dưới "Cho thuê & Bán"; khối "Đền bù" trên D5. Kiểm: component test lọc `?status=PENDING` và dòng D5 "ĐB-2026-009 · PTH-2026-071 · 3.915.000 ₫ · Chờ duyệt".
- [ ] 5.3 Chi tiết phiếu thu hồi `/sales/returns/[code]`: dòng chia tình trạng, ảnh, giá trị giảm, giá trị mất, liên kết `ĐB`, câu "Không có hàng hỏng hay mất…". Kiểm: component test hai ca của spec "Chi tiết phiếu thu hồi trên Desktop".
- [ ] 5.4 D6: cột "Đã trả" thật (chỉ hàng về bãi), cột "Mất" riêng, dòng thu hồi trong dòng thời gian (bấm mở `/sales/returns/[code]`), khối "Cần kiểm tra" có phiếu thu hồi gửi muộn. Kiểm: component test scenario "Phiếu thu hồi trong dòng thời gian" và "Thu hồi gửi muộn"; test D6 cũ vẫn xanh.

## 6. Giao diện Mobile

- [ ] 6.1 Nháp: `DRAFT_KINDS` thêm `RETURN`, payload có ảnh `Blob` theo design D13; `returnSender` gửi từng ảnh còn thiếu rồi gửi phiếu; 4xx → "Bị từ chối" giữ số. Kiểm: `drafts.test.ts` thêm ca thu hồi:
  - tự lưu;
  - "Chờ gửi" khi mất mạng;
  - gửi được 2 / 4 ảnh rồi mất mạng → lần sau chỉ gửi 2 ảnh;
  - 400 trả quá → "Bị từ chối";
  - **422 `PHOTOS_EXPIRED`** → xóa `uploadedId` của ảnh hết hạn, gửi lại ảnh từ `Blob`, lưu phiếu lần nữa; nháp không qua "Bị từ chối"; 422 lần hai → giữ "Chờ gửi";
  - 401 giữ "Chờ gửi";
  - hai tab không gửi song song.
- [ ] 6.2 M4 `/m/returns/new` theo `docs/design/screens/M4-ReturnNote.dc.html`:
  - bước chọn công trình (tìm, bãi mặc định);
  - thẻ từng mã có "Đang ở công trình: N", tổng trả về, stepper Tốt / Chờ sửa / Phế liệu / Mất, câu "Đã chia đủ" / "Còn N cái chưa phân loại";
  - "Thêm mã hàng" chỉ mã đang ở công trình; biển số, ghi chú;
  - "Ảnh hiện trạng" (camera, thu nhỏ 1.280 px bằng canvas, chú thích, tối đa 6);
  - "Lưu nháp", "Lưu phiếu thu hồi" (chặn bấm hai lần), sau khi lưu cho lập tiếp hợp đồng khác giữ biển số;
  - không có số tiền.
  - Kiểm: component test theo spec `returns` (chưa chia hết khóa nút, ảnh thứ 7, không có chữ "₫") và `return-photos` "Chụp ảnh trên M4".
- [ ] 6.3 `/m/returns/[code]` chỉ xem (có ảnh, không giá); M1 khối "Thu hồi"; M7 phiếu thu hồi + bộ lọc "Thu hồi" (`?type=return`). Kiểm: component test theo spec `mobile-home` "Thu hồi trên Việc hôm nay" và `mobile-history` (Kế toán không thấy khối, lọc Thu hồi).

## 7. Seed, E2E và kiểm tra cuối

- [ ] 7.1 Seed dev: một phiếu thu hồi của hợp đồng An Phú – Block B (qua `postReturn`) có Chờ sửa, Phế liệu, Mất, 2 ảnh mẫu tạo bằng `sharp`, và phiếu đền bù Chờ duyệt như D8; chạy lại không tạo thêm; cập nhật dòng `db:seed:dev` trong `CLAUDE.md`. Kiểm: `npm run db:seed:dev` hai lần, `npm run inventory:check` khớp, `sample.int.test.ts` của returns xanh.
- [ ] 7.2 E2E `tests/e2e/returns.spec.ts` (Edge), dùng hợp đồng E2E của `deliveries` (`E2EXUAT`):
  - global setup bảo đảm có hàng `E2E-KHO-01` ở công trình (xuất thêm khi thiếu);
  - Thủ kho (`statePath("WAREHOUSE")`) thu hồi trên M4: Tốt + Chờ sửa + Mất, một ảnh mẫu;
  - D6 "Đã trả" và "Đang ở công trình" đổi theo chênh lệch;
  - Giám đốc duyệt `ĐB` với giảm trừ có lý do;
  - Kế toán không thấy nút duyệt.
  - Tìm theo chữ dùng `.filter({ visible: true })`. Ảnh mốc `@visual` cho M4 và D8 (dữ liệu seed).
  - Kiểm: `npm run test:e2e` xanh.
- [ ] 7.3 Kiểm tra máy: `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate returns-and-compensation --strict` đều xanh; coverage ≥ 80 % cho `src/domain`, `src/lib`; gắn nhãn `update-snapshots` vào PR apply và chờ CI xanh.
- [ ] 7.4 Kiểm tra tay trên điện thoại thật (bước 9 issue #11):
  - thu hồi có chụp ảnh, chia Tốt / Chờ sửa / Phế liệu / Mất;
  - D6 cột "Đã trả" và "Đang ở công trình" đổi đúng;
  - Giám đốc duyệt phiếu đền bù có giảm trừ trên desktop;
  - mở ảnh bằng tài khoản không có quyền bị chặn;
  - ảnh tải về không còn GPS;
  - trang Cài đặt hiện dung lượng ảnh.
  - Chưa làm được trước archive thì ghi "làm sau, theo dõi ở #33" và thêm mục vào issue #33.

## Workflow follow-up

- Change `rental-billing` đọc ngày trả (`return_note.business_date`) và dòng `RETURN_OUT` / `LOSS_OUT` ở vị trí công trình để thôi tính thuê từ ngày trả.
- Change `receivables` đọc phiếu đền bù `APPROVED` (`amount_due`, `approved_date`, `due_date`) và thay thân `overdueDebt`; cấn trừ cọc ở đợt thanh lý cuối (0.2 #40).
- Change `site-operations` (#132) thêm nhánh phiếu chuyển công trình vào `onSiteByItem` và xử lý hàng của công trình khác.
- Khi ảnh vượt khoảng 5 GB: change riêng chuyển ảnh sang kho đối tượng riêng tư, giữ API `/api/returns/photos/[id]`.
