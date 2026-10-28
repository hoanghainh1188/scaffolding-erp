# Tasks: simple-repair

## 1. Cơ sở dữ liệu

- [ ] 1.1 Drizzle schema `src/db/schema/repairs.ts` cho `repair_order`, `repair_order_line` theo design D8: CHECK `status`, `POSTED` ⇔ có `posted_by`/`posted_at`/`posting_id`, độ dài `repaired_by`/`note`, `quantity_taken > 0`, `quantity_good`/`quantity_scrap >= 0`, `good + scrap = taken`, `repair_cost >= 0`, `repair_cost = 0 OR quantity_good > 0`; unique `code`, unique (`order_id`, `item_id`); FK `RESTRICT` (dòng → phiếu `CASCADE`). Xuất từ `src/db/schema/index.ts` — kiểm tra: `npm run typecheck` xanh
- [ ] 1.2 Sinh migration kế tiếp (`0006_repair_orders.sql`, hoặc số sau nếu `main` đã có 0006) bằng `npm run db:generate`, thêm tay trigger chặn `UPDATE`/`DELETE` phiếu `POSTED` và dòng của nó ("Phiếu đã ghi sổ, không sửa hay xóa được") — kiểm tra: `npm run db:migrate` thành công trên DB rỗng và trên DB đã có `goods-receipt`
- [ ] 1.3 Integration test `src/db/schema/repairs.int.test.ts`: từng CHECK ở 1.1 chặn đúng; trùng mã trong phiếu bị unique chặn; xóa vật tư / vị trí đã có phiếu → `23503`; sửa, xóa phiếu `POSTED` bị trigger chặn; xóa nháp xóa luôn dòng. Cập nhật helper dọn DB test xóa bảng phiếu sửa trước danh mục — kiểm tra: `npm run test:int` xanh 2 lần liền

## 2. Logic thuần + unit test (viết test trước)

- [ ] 2.1 `src/domain/repair-order.ts` `checkRepairLines` theo spec "Luật số lượng của dòng hàng", "Mã hàng trên phiếu", "Chi phí sửa theo từng mã". Unit test, mỗi ca đúng thông báo và `field`: **sửa xong + phế liệu = số lấy ra** (40 = 36 + 4 hợp lệ; 40 ≠ 30 + 4 → "GG-K17: sửa xong + phế liệu (34) phải bằng số lấy ra (40)"; 5 = 0 + 5 hợp lệ; 20 = 20 + 0 hợp lệ); lấy ra 0; số lẻ 20,5; mã tính theo kg `PL-SAT`; trùng mã; phiếu rỗng; chi phí −1.000 và 1.000,5; chi phí 300.000 khi sửa xong 0; tổng chi phí phiếu 2.220.000 ₫ — kiểm tra: `npm run test:unit` xanh
- [ ] 2.2 `goodUnitCost(B, good, cost)` theo spec "Giá vốn khi vào Tốt". Unit test **giá vốn mới = giá Chờ sửa + chi phí ÷ số sửa xong, làm tròn 1 ₫**: 160.000 + 1.980.000 ÷ 36 = 215.000; 160.000 + 1.000.000 ÷ 3 = 493.333 (làm tròn xuống); 160.000 + 1 ÷ 2 = 160.001 (đúng nửa đồng làm tròn lên); chi phí 0 → 160.000; 30.000 + 240.000 ÷ 20 = 42.000; giá trị dòng là số chính xác (1.480.000; 320.001), không nhân lại từ đơn giá làm tròn; khớp với `unitCostOf` của sổ kho cho cùng giá trị — kiểm tra: `npm run test:unit` xanh
- [ ] 2.3 `repairPostingLines(lines, pools, from, to)` theo design D1. Unit test: dòng `GG-K17` 40 → 36/4, B 160.000, chi phí 1.980.000 ra đúng 3 `MovementDraft` (`REPAIR_OUT` −40 Chờ sửa tại chỗ lấy; `REPAIR_IN` +36 Tốt `amount` 7.740.000 tại chỗ nhập; `REPAIR_IN` +4 Phế liệu `amount` 640.000); dòng không phế liệu ra 2 dòng; dòng toàn phế liệu ra 2 dòng (không có dòng Tốt); lấy tại `XUONG-01` nhập về `BAI-01` đặt đúng vị trí; property test 300 bộ ngẫu nhiên: Σ giá trị vào − số lấy ra × B = Σ chi phí, và Σ số vào = Σ số ra — kiểm tra: `npm run test:unit` xanh
- [ ] 2.4 `previewAverage` (dùng `averageAfterInflow` có sẵn) cho khối "Giá vốn sau sửa". Unit test **giá BQ Tốt cập nhật đúng**: Tốt 1.120 cái giá 195.861 + 36 cái 7.740.000 → 196.457; Chéo Tốt 2.000 cái giá 38.500 + 20 cái 840.000 → 38.535; Phế liệu 42 cái giá 150.000 + 4 cái 640.000 → 150.870; Tốt chưa từng có + 5 cái 1.100.000 → 220.000; tồn 0 không pha giá cũ — kiểm tra: `npm run test:unit` xanh
- [ ] 2.5 `repairAnomalies` và `repairPostedNote` theo design D6. Unit test: Tốt 195.861, 20 cái 6.000.000 → câu hỏi "GG-K17: chi phí sửa 300.000 ₫/cái, cao hơn giá vốn Tốt 195.861 ₫. Đúng không?" và `field`; đúng bằng 195.861 × 20 → không hỏi; chưa có giá BQ Tốt → không hỏi; sửa xong 0 → không hỏi; key đã xác nhận không còn trong danh sách thiếu; note "PSC-… · đã xác nhận chi phí cao GG-K17 300.000 ₫/cái" — kiểm tra: `npm run test:unit` xanh; coverage `src/domain` ≥ 80%

## 3. Quyền

- [ ] 3.1 Thêm `repairs.manage` (`DIRECTOR`, `ACCOUNTANT`) vào `src/domain/permissions.ts` kèm chú thích design D4 — kiểm tra: `permissions.test.ts` cập nhật bảng mong đợi và xanh

## 4. Service (integration test, mỗi lệnh ghi một transaction)

- [ ] 4.1 Xuất `lockCostPools(tx, pairs)` từ `src/lib/inventory/post.ts` (thân là `lockPools` hiện có, cùng thứ tự sắp xếp), `postMovements` dùng lại nó. Integration test: gọi `lockCostPools` rồi `postMovements` trong cùng transaction không kẹt và giá dòng không đổi giá bằng giá đã đọc; test cũ của `inventory` vẫn xanh — kiểm tra: `npm run test:int` xanh
- [ ] 4.2 `src/lib/repairs/orders.ts`: `createRepairDraft`, `updateRepairDraft` (kèm `updatedAt`, lệch → 409 "Phiếu vừa được người khác sửa, tải lại trang"), `deleteRepairDraft`; mã từ `nextDocumentCode("PSC", năm)`; kiểm vị trí là bãi/xưởng đang dùng ("Chỉ lấy hàng sửa tại bãi hoặc xưởng"); khóa `FOR UPDATE` phiếu, `FOR SHARE` vật tư và vị trí. Integration test: hai nháp cùng lúc ra hai mã liền nhau; sửa trùng → 409; sửa, xóa phiếu `POSTED` → "Phiếu đã ghi sổ, không sửa hay xóa được"; chọn `CT-0003` → từ chối — kiểm tra: `npm run test:int` xanh
- [ ] 4.3 `postRepairOrder(actor, code, confirmedOverrides)` theo design D2, D7. Integration test **ghi sổ kho đúng (một transaction)**: `PSC-2026-024` với `GG-K17` (B 160.000; Tốt 1.120 cái 195.861; Phế liệu 42 cái 150.000) 40 → 36/4, 1.980.000 và `GG-CH` 20 → 20/0, 240.000 ra đúng 5 dòng sổ (`document_type = REPAIR`, `document_code`, ngày nghiệp vụ = ngày sửa xong); đơn giá dòng Tốt `GG-K17` 215.000, **giá BQ Tốt sau 196.457**, Phế liệu sau 150.870, giá BQ Chờ sửa không đổi; Σ giá trị dòng sổ của phiếu = 2.220.000; phiếu `POSTED` với `posted_by`, `posting_id`; `npm run inventory:check` không lệch — kiểm tra: `npm run test:int` xanh
- [ ] 4.4 Integration test lỗi và rollback: Chờ sửa tại `BAI-01` còn 30 mà lấy 40 → "Không đủ hàng: GG-K17 Chờ sửa tại BAI-01 còn 30 cái", phiếu vẫn Nháp, không dòng sổ; `GG-CH` vừa ngừng dùng → rollback cả phiếu; ngày sửa xong 29/10 khi hôm nay 28/10 → "Ngày ghi sổ không được sau hôm nay"; ghi lùi ngày → thông báo của sổ kho; giá Chờ sửa đổi từ 160.000 thành 158.000 sau khi lập nháp → giá vào Tốt 213.000; thiếu xác nhận chi phí cao → 422 kèm câu hỏi, không ghi gì; có xác nhận → ghi được và lưu `confirmed_note` — kiểm tra: `npm run test:int` xanh
- [ ] 4.5 Integration test đồng thời: ghi sổ cùng phiếu ở hai kết nối → đúng một bộ dòng sổ, lần sau 409 "Phiếu đã được ghi sổ"; phiếu sửa `GG-K17` và phiếu nhập `GG-K17` Tốt cùng lúc → không kẹt, giá BQ Tốt cuối bằng kết quả ghi lần lượt theo thứ tự hoàn tất; hai phiếu sửa cùng lấy `GG-CH` Chờ sửa vượt tồn → đúng một phiếu ghi được — kiểm tra: `npm run test:int` xanh
- [ ] 4.6 `src/lib/repairs/queries.ts`: `repairOrders(status)` (danh sách, tổng sửa xong, phế liệu, chi phí), `repairOrderByCode(code)` (phiếu đã ghi sổ kèm số từ dòng sổ của chứng từ), `awaitingRepair(locationId)` (mã, số Chờ sửa tại vị trí, giá BQ Chờ sửa, tồn và giá BQ Tốt, trọng lượng chuẩn). Integration test: thứ tự mới nhất trước, lọc `posted`, `PSC-2026-021` đọc số từ sổ, chỉ mã có Chờ sửa > 0 tại vị trí — kiểm tra: `npm run test:int` xanh

## 5. API (bọc `withAuth`, zod)

- [ ] 5.1 Route theo design D10: `GET`/`POST /api/repairs`, `GET`/`PUT`/`DELETE /api/repairs/[code]`, `POST /api/repairs/[code]/post`, `GET /api/repairs/awaiting`; lỗi nghiệp vụ qua `src/lib/repairs/respond.ts` kèm `field`, 422 ghi sổ kèm `anomalies`. Integration test `repairs-api.int.test.ts`: 401 khi chưa đăng nhập; 403 cho Kinh doanh `POST /api/repairs` và `POST …/post`, Xưởng `GET /api/repairs`; Kinh doanh `GET` được; body sai kiểu → 422 — kiểm tra: `npm run test:int` xanh, `src/app/route-guards.test.ts` xanh

## 6. Giao diện Desktop

- [ ] 6.1 `/repairs` theo spec "Danh sách phiếu sửa chữa" (thay `PlaceholderPage`): bảng, nhãn trạng thái, lọc `?status=` trên URL, "Phiếu mới" chỉ khi có `repairs.manage`, trạng thái rỗng "Chưa có phiếu sửa chữa". Component test — kiểm tra: `npm run test:unit` xanh
- [ ] 6.2 `/repairs/new` và `/repairs/[code]` (D12) theo spec "Màn D12 phiếu sửa chữa": thông tin chung (ngày, người/tổ sửa, lấy tại, nhập về), tổng chi phí và "N cái về Tốt · M cái thành phế liệu", bảng hàng đem sửa với lỗi ngay trên dòng, cột phải "Đang chờ sửa tại <vị trí>", kg quy đổi phế liệu ("4 cái · 54 kg"). Token Bright Blue Base, không mã màu cứng. Component test bằng số D12 — kiểm tra: `npm run test:unit` xanh, `npm run lint` xanh
- [ ] 6.3 Khối "Giá vốn sau sửa" dùng hàm 2.2, 2.4: "Giá vốn Chờ sửa 160.000 ₫", "+ Chi phí sửa (1.980.000 ₫ ÷ 36) 55.000 ₫", "= Giá vốn khi vào Tốt 215.000 ₫", "Giá vốn BQ Tốt: 195.861 ₫ → 196.457 ₫", câu phế liệu không gánh chi phí, "Không có phế liệu.", ghi chú "Số chính xác tính lúc ghi sổ". Component test — kiểm tra: `npm run test:unit` xanh
- [ ] 6.4 Lưu nháp, xóa nháp (hỏi lại), "Ghi sổ kho" với hộp thoại hỏi lại chi phí cao ("Sửa lại" / "Đúng, ghi sổ"), báo 409 tải lại trang, phiếu đã ghi sổ chỉ xem (nhãn "Đã ghi sổ", người và thời điểm ghi sổ), Kinh doanh không thấy nút ghi. Component test — kiểm tra: `npm run test:unit` xanh

## 7. Dữ liệu mẫu và E2E

- [ ] 7.1 `npm run db:seed:dev` theo design D13: bộ đếm `PSC` 2026 lên 021; nháp `PSC-2026-022` như D12 nếu đủ Chờ sửa. Cập nhật mô tả seed trong CLAUDE.md — kiểm tra: integration test seed: chạy 2 lần không nhân đôi; `npm run inventory:check` không lệch
- [ ] 7.2 `tests/e2e/global-setup.ts`: xóa nháp phiếu sửa có ghi chú `E2E thử`; E2E dùng `E2E-KHO-01/02`. Cập nhật CLAUDE.md mục "Lưu ý" — kiểm tra: `npm run test:e2e` 2 lần liền xanh
- [ ] 7.3 E2E `tests/e2e/repairs.spec.ts` (Kế toán, `statePath("ACCOUNTANT")`): mở `/repairs` → "Phiếu mới" → thêm `E2E-KHO-01` từ danh sách chờ sửa → nhập lấy ra / sửa xong / phế liệu / chi phí → thấy khối giá vốn → "Ghi sổ kho" → nhãn "Đã ghi sổ" → D10 tồn Chờ sửa giảm, Tốt và Phế liệu tăng đúng chênh lệch; nhập chi phí mỗi cái vượt giá Tốt → hộp thoại hỏi lại → "Sửa lại" rồi ghi được; Kinh doanh mở phiếu không có nút ghi sổ. Thêm kiểm `axe` cho `/repairs` và D12 — kiểm tra: `npm run test:e2e` xanh
- [ ] 7.4 Ảnh mốc `@visual` mới: `/repairs` và D12 (nháp có 2 mã như bản vẽ) ở 1366 px; che ngày và mã phiếu — kiểm tra: chạy workflow **Update Playwright snapshots** trên nhánh `simple-repair`, CI xanh

## 8. Kiểm tra tổng

- [ ] 8.1 `npm run lint && npm run typecheck && npm test && npm run test:e2e` và `npx openspec validate simple-repair --strict` đều xanh; coverage `src/domain`, `src/lib` ≥ 80%
- [ ] 8.2 Kiểm tra tay trên Edge 1366 px: lập phiếu như D12, so khối "Giá vốn sau sửa" và D11 thẻ kho `GG-K17` (Tốt, Chờ sửa, Phế liệu) với số tính tay — làm sau nếu chưa kịp, theo dõi ở #33

## Workflow follow-up

- Người dùng ghi "Duyệt" trên PR propose rồi mới chạy `/opsx:apply simple-repair`.
- Sau khi merge PR apply: `/opsx:archive simple-repair`, PR archive ghi `Closes #12`.
