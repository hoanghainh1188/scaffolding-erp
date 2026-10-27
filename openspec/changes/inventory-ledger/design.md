# Design: inventory-ledger

## Context

- Đã có (`master-data`): `item` (đơn vị `PIECE`/`KG`, trọng lượng chuẩn), `location` (`YARD`, `WORKSHOP`, `SITE`; mỗi công trình một vị trí `SITE`), `BAI-01`, `XUONG-01`; khóa ngoại `ON DELETE RESTRICT`; service khóa bản ghi bằng `FOR UPDATE` / `FOR SHARE` (CLAUDE.md).
- Đã có: `src/domain/quantity.ts` (số lượng = số nguyên phần nghìn), `money.ts` (VND số nguyên), `condition.ts` (4 tình trạng), `document-status.ts` (`DRAFT`, `PENDING_APPROVAL`, `IN_PROGRESS`, `DONE`), `weight-conversion.ts` (`piecesToKg`), `business-date.ts` (ngày theo giờ Việt Nam), bảng quyền `src/domain/permissions.ts` (`inventory.view` đã có cho văn phòng), trang giữ chỗ `/inventory`.
- Quyết định đã chốt: 0.2 #1 (BQ gia quyền theo mã + tình trạng, không theo lô), #2 (theo số lượng, không serial), #3 (phế liệu mã cái vẫn đếm theo cái), #10 (làm tròn 1 ₫ sau mỗi lần đổi giá), #11 (xuất và thu hồi ghi theo giá BQ hiện tại, không đổi giá BQ).
- Chưa có phiếu nhập, xuất, thu hồi, sửa chữa. Change này làm hàm ghi sổ chung để các change đó gọi, và chỉ tự sinh dòng sổ qua phiếu điều chỉnh và tồn đầu kỳ.

## Goals / Non-Goals

**Goals:**
- Sổ kho chỉ ghi thêm, DB tự chặn sửa/xóa.
- Một hàm ghi sổ dùng chung, đúng giá BQ, an toàn khi ghi đồng thời, kiểm tồn không âm.
- D10, D11 tính thẳng từ sổ, khớp số tính tay.
- Phiếu điều chỉnh và tồn đầu kỳ, Giám đốc duyệt mới ghi sổ.

**Non-Goals:**
- Phiếu nhập/xuất/thu hồi/sửa (change sau), bán phế liệu (chỉ chốt cách ghi sổ), kiểm kê [Bản 2], xuất Excel, màn kho trên Mobile.

## Decisions

### D1. Bảng `inventory_ledger` và chặn sửa/xóa ở DB (câu hỏi 1)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `bigint generated always as identity` PK | Thứ tự ghi, dùng để sắp các dòng cùng ngày |
| `posting_id` | `uuid` not null | Gom các dòng của một lần ghi (một chứng từ) |
| `business_date` | `date` not null | Ngày nghiệp vụ theo giờ Việt Nam |
| `item_id` | `uuid` FK `item` RESTRICT | |
| `condition` | `text` CHECK 4 giá trị | |
| `location_id` | `uuid` FK `location` RESTRICT | |
| `movement` | `text` CHECK 13 loại (spec `inventory-ledger`) | |
| `quantity` | `numeric(14,3)` CHECK `<> 0` | Có dấu; CHECK dấu theo `movement` (`_IN`, `OPENING` > 0; `_OUT` < 0) |
| `unit_cost` | `bigint` CHECK `>= 0` | Đơn giá ghi sổ (VND, mỗi cái hoặc mỗi kg) |
| `amount` | `bigint` | Giá trị có dấu = số lượng × đơn giá, làm tròn 1 ₫; dòng làm đổi giá lưu đúng giá trị người ghi đưa vào |
| `avg_cost_after` | `bigint` CHECK `>= 0` | Giá BQ của (mã + tình trạng) sau dòng |
| `pool_quantity_after` | `numeric(14,3)` | Tổng tồn của (mã + tình trạng) ở mọi vị trí sau dòng (D3) — để đối chiếu nhanh |
| `weighed_kg` | `numeric(14,3)` null | Kg cân thực tế (bán phế liệu) |
| `document_type` | `text` not null | `OPENING`, `ADJUSTMENT`, sau này `GOODS_RECEIPT`, `DELIVERY`... |
| `document_id` | `uuid` null | |
| `document_code` | `text` not null | `ĐC-2026-004`, `PN-2026-087` |
| `description` | `text` not null | Diễn giải hiện ở D11 |
| `created_by` | `text` FK `user` RESTRICT | |
| `created_at` | `timestamptz` default `now()` | UTC |

Index: `(item_id, condition, location_id)`, `(location_id)`, `(item_id, business_date, id)`, `(document_type, document_id)`.

**Chặn sửa/xóa**: trigger `BEFORE UPDATE OR DELETE ... FOR EACH ROW` và `BEFORE TRUNCATE ... FOR EACH STATEMENT` gọi hàm `inventory_ledger_append_only()` `raise exception 'Sổ kho chỉ ghi thêm, sai thì lập phiếu điều chỉnh'`. Riêng TRUNCATE cho qua khi hàm `inventory_truncate_allowed(current_database(), current_setting('inventory.allow_truncate', true))` trả `true`, tức **cả hai**: cờ `inventory.allow_truncate = 'on'` (đặt bằng `SET LOCAL`) **và** tên DB kết thúc bằng `_test` (`scaffolding_erp_test` ở local và CI). Như vậy cờ này vô dụng trên DB dev (`scaffolding_erp`) hay production. Chỉ helper test (`src/test/inventory.ts`) đặt cờ để dọn DB test; một test quét mã nguồn bảo đảm chuỗi `inventory.allow_truncate` chỉ xuất hiện trong `src/test/` và migration. Kiểm tên DB là hàm riêng để test được trực tiếp với tên khác.

- *Đã cân nhắc*: `REVOKE UPDATE, DELETE` cho vai trò DB của ứng dụng. Không chọn vì app đang kết nối bằng chủ bảng (chủ bảng luôn sửa được), còn trigger chặn mọi người trừ superuser cố ý tắt trigger.
- *Đã cân nhắc*: bảng sự kiện kiểu JSON. Không chọn: cột rõ ràng dễ CHECK, dễ index, dễ đọc thẻ kho.

### D2. Giá vốn bình quân, làm tròn, giá ghi sổ khi xuất/thu hồi (câu hỏi 2)

Logic thuần ở `src/domain/average-cost.ts`, dùng `bigint` cho mọi phép nhân chia (số lượng phần nghìn × giá có thể vượt `2^53`).

- Dòng làm đổi giá (`OPENING`, `PURCHASE_IN`, `REPAIR_IN`): `avg_mới = roundHalfUp((q_trước × avg_trước + amount × 1000) / (q_trước + q_vào))` với `q` tính bằng phần nghìn. `q_trước = 0` → `avg_mới = roundHalfUp(amount × 1000 / q_vào)`.
- `unit_cost` hiện ở D11 của dòng này = `roundHalfUp(amount × 1000 / q_vào)` (196.155 ₫ của `PN-2026-087`).
- Mọi dòng khác: `unit_cost = avg hiện tại`, `amount = roundHalfUp(quantity × unit_cost / 1000)`, giá BQ không đổi (vào hay ra theo đúng giá BQ thì công thức trên cũng ra đúng giá cũ).
- Giá trị tồn mang sang luôn là **số lượng × giá BQ đã làm tròn**; phần lẻ do làm tròn (dưới 0,5 ₫ × số lượng) không cộng dồn. Đây là hệ quả trực tiếp của 0.2 #10. *Đã cân nhắc* giữ tổng giá trị chính xác rồi chia ra giá BQ để hiển thị: chính xác hơn vài trăm đồng nhưng giá BQ trên màn hình không còn nhân ra được giá trị, khó đối chiếu tay bằng Excel.
- `REPAIR_IN`: change `simple-repair` truyền `amount = số lượng × giá BQ Chờ sửa + chi phí sửa` (0.2 #23). Change này chỉ cần nhận `amount`.
- Tình trạng chưa từng có dòng sổ nhận dòng không đổi giá: lấy `unit_cost` của dòng `_OUT` đi cặp trong cùng lần ghi; không có thì bắt buộc người ghi đưa đơn giá (spec).

### D3. Giá BQ tính trên toàn bộ hàng của công ty (người dùng chốt khi review PR #30)

Giá BQ của (mã + tình trạng) tính trên **tổng tồn ở mọi vị trí**: bãi, xưởng và công trình ("pool" = toàn bộ hàng của công ty). `inventory_cost.pool_quantity` và `inventory_ledger.pool_quantity_after` mang nghĩa này. Ghi vào `docs/requirements.md` 0.2 #24 (chốt 27/10/2026), sửa câu #11 cho khớp.

- **Chuyển chỗ trong công ty** (xuất cho công trình, thu hồi cùng tình trạng, chuyển bãi ↔ xưởng, điều chỉnh vị trí): 2 dòng cùng giá BQ, không đổi giá BQ, không đổi tổng tồn, không đổi tổng giá trị.
- **Hàng vào từ ngoài** (tồn đầu, nhập mua, nhập sau sửa): làm đổi giá BQ.
- **Hàng ra khỏi công ty** (bán, mất, điều chỉnh giảm) và chuyển tình trạng: ghi theo giá BQ hiện tại; giá BQ không đổi, tổng giá trị giảm đúng số lượng × giá BQ.
- Bất biến: với mỗi (mã + tình trạng), **tổng giá trị trong sổ = tổng tồn × giá BQ** (chênh tối đa phần lẻ làm tròn, D2).
- *Đã cân nhắc* (bản propose đầu): chỉ tính trên bãi + xưởng để khớp đúng số mẫu 195.171 ₫ của bản vẽ D11. Không chọn: số trên bản vẽ chỉ là dữ liệu mẫu; hàng ở công trình vẫn là tài sản công ty, và tách pool làm giá trị hàng ở công trình phụ thuộc lúc thu hồi.
- Số mẫu trong `docs/design/screens/D11-StockCard.dc.html` (195.171, 195.861) **khác** số mới ở D11 bên dưới (195.055, 195.282). Spec thắng; seed dev và ảnh mốc theo bộ số mới.

### D4. Chống ghi đồng thời (câu hỏi 3)

Bảng `inventory_cost` (PK `item_id, condition`): `avg_cost bigint`, `pool_quantity numeric(14,3)`, `last_business_date date`, `last_ledger_id bigint`, `updated_at`. Hàm ghi sổ `postMovements(tx, posting)` trong `src/lib/inventory/post.ts`:

1. Kiểm thuần (domain): dấu theo loại, số nguyên với hàng cái, `amount` có/không theo loại.
2. Đọc các `item`, `location` liên quan `FOR SHARE` (từ chối nếu ngừng dùng); dòng lệnh ngừng dùng giữ `FOR UPDATE` nên hai việc này chạy lần lượt.
3. `INSERT ... ON CONFLICT DO NOTHING` các dòng `inventory_cost` còn thiếu, rồi `SELECT ... FOR UPDATE` **theo thứ tự (`item_id`, `condition`)** để không kẹt khi hai phiếu cùng chạm hai mã theo thứ tự ngược nhau.
4. Kiểm ngày nghiệp vụ (không lùi so với `last_business_date`, không sau hôm nay).
5. Tính từng dòng theo thứ tự trong phiếu, cập nhật trạng thái trong bộ nhớ.
6. Kiểm tồn mỗi (mã, tình trạng, vị trí) bị trừ: `SUM(quantity)` từ sổ + phần thay đổi của phiếu ≥ 0. Chạy sau bước 3 nên thấy mọi phiếu đã ghi xong trước đó.
7. `INSERT` các dòng sổ, `UPDATE inventory_cost`. Tất cả trong transaction của người gọi.

- *Đã cân nhắc*: `SERIALIZABLE` cho mọi lệnh ghi. Không chọn: phải bắt lỗi `40001` và chạy lại ở mọi chỗ gọi; khóa dòng rõ ràng dễ test hơn.
- *Đã cân nhắc*: `pg_advisory_xact_lock(hash(item, condition))`. Không chọn: va chạm hash, khó thấy trong `pg_locks`; cần `inventory_cost` để đọc giá BQ nhanh nên khóa luôn dòng đó.

### D5. Tồn theo vị trí (câu hỏi 4)

Tồn = `SUM(quantity)` theo (mã, tình trạng, `location_id`); giá BQ thì gộp mọi vị trí (D3). "Tại bãi" = mọi vị trí `YARD`, "Tại xưởng" = `WORKSHOP`, "Tại công trình" = `SITE` (mỗi công trình một vị trí đi kèm từ `master-data`). Xuất cho công trình = 2 dòng (`DELIVERY_OUT` ở bãi, `DELIVERY_IN` ở vị trí công trình); thu hồi = 2 dòng ngược lại, có thể khác tình trạng. Chuyển bãi ↔ xưởng là `TRANSFER_*`.

### D6. Đọc tồn nhanh (câu hỏi 5)

D10 và D11 **tính thẳng từ sổ** bằng `SUM ... GROUP BY` trên index `(item_id, condition, location_id)`; giá BQ đọc từ `inventory_cost`. Không có bảng tồn cộng dồn theo vị trí. Quy mô 1 bãi, vài chục công trình: ước ~50.000 dòng/năm, truy vấn dưới 100 ms.

- `inventory_cost` là số lưu riêng duy nhất, luôn được cập nhật cùng transaction với dòng sổ và có đối chiếu: `src/lib/inventory/reconcile.ts` so `pool_quantity` với tổng dòng sổ tại bãi/xưởng và `avg_cost` với `avg_cost_after` của dòng cuối; `npm run inventory:check` (script trong `scripts/`) in lệch và thoát mã 1. Integration test chạy đối chiếu sau mỗi kịch bản.
- *Đã cân nhắc*: bảng `stock_balance` (mã, tình trạng, vị trí, số lượng) cập nhật cùng transaction. Không chọn bây giờ: thêm một số cộng dồn phải đối chiếu (CLAUDE.md), chưa cần ở quy mô này. Khi sổ quá 1 triệu dòng hoặc D10 chậm hơn 1 giây thì thêm, kèm đối chiếu.

### D7. Tồn đầu kỳ (câu hỏi 6)

Phiếu `TĐK-<năm>-<số>` dùng chung bảng và luồng với phiếu điều chỉnh (`kind = 'OPENING'`). Kế toán nhập từng dòng (mã, tình trạng, vị trí, số lượng, đơn giá vốn) và ngày tồn đầu; Giám đốc duyệt thì ghi `OPENING`. Một (mã + tình trạng) đã có dòng khác `OPENING` không nhận tồn đầu nữa, nên không có cách "chen" giá vào giữa lịch sử. Hàng đang ở công trình lúc bắt đầu dùng phần mềm nhập dòng tồn đầu tại vị trí công trình đó (chỉ ghi số lượng; ngày bắt đầu tính thuê thuộc `contracts`).

- *Đã cân nhắc*: lệnh CLI nhập từ CSV. Không chọn ở MVP: Kế toán cần tự làm và Giám đốc duyệt như mọi số đầu vào; nhập Excel để sau.

### D8. Phiếu điều chỉnh: ai lập, ai duyệt, lý do (câu hỏi 7)

- **Quyền** (thêm vào `src/domain/permissions.ts`): `inventory.adjust` = `DIRECTOR`, `ACCOUNTANT` (người giữ sổ sách); `inventory.approve` = `DIRECTOR` (giống hợp đồng và đền bù, 0.2 #6). Xem kho dùng `inventory.view` đã có (văn phòng). Thủ kho chưa lập điều chỉnh ở MVP (kiểm kê trên mobile là [Bản 2]).
- **Lý do bắt buộc**, tối đa 500 ký tự, kèm mã chứng từ bị sửa (tùy chọn). Trả lại bắt buộc lý do.
- **Trạng thái** dùng `STORED_DOCUMENT_STATUSES`: `DRAFT` → `PENDING_APPROVAL` → `DONE`. Không dùng `IN_PROGRESS`. Trả lại = về `DRAFT` + `returned_reason`.
- **Duyệt**: đọc phiếu `FOR UPDATE`, kiểm vẫn `PENDING_APPROVAL` (duyệt hai lần → "Phiếu đã được ghi sổ"), dựng các dòng ghi sổ từ dòng phiếu, gọi `postMovements`, lưu `posting_id`, chuyển `DONE` — một transaction. Ngày nghiệp vụ = ngày duyệt (tồn đầu: ngày tồn đầu). Giám đốc tự lập rồi tự duyệt được (công ty nhỏ, một Giám đốc).
- **Dựng dòng sổ**: số lượng → 1 dòng `ADJUST_IN`/`ADJUST_OUT`; tình trạng → `ADJUST_OUT` tình trạng cũ + `ADJUST_IN` tình trạng mới cùng vị trí; vị trí → `ADJUST_OUT` + `ADJUST_IN` cùng tình trạng. Thuần, ở `src/domain/stock-adjustment.ts`, có unit test.

Bảng:
- `stock_adjustment`: `id uuid`, `code text unique`, `kind` (`ADJUSTMENT`/`OPENING`), `status`, `reason`, `related_document_code`, `opening_date date` (chỉ `OPENING`), `returned_reason`, `posting_id uuid`, `created_by/at`, `submitted_by/at`, `approved_by/at`, `returned_by/at`, `updated_at`. CHECK `status in ('DRAFT','PENDING_APPROVAL','DONE')`, CHECK `opening_date` có khi và chỉ khi `kind = 'OPENING'`.
- `stock_adjustment_line`: `id`, `adjustment_id` FK CASCADE, `line_no`, `line_type` (`QUANTITY`, `CONDITION`, `LOCATION`, `OPENING`), `item_id` FK RESTRICT, `condition`, `to_condition`, `location_id` FK RESTRICT, `to_location_id`, `quantity numeric(14,3)`, `unit_cost bigint`. CHECK theo `line_type` (VD `CONDITION` cần `to_condition <> condition`, `quantity > 0`).
- `document_counter` (`prefix`, `year`, `last_number`, PK `prefix, year`): cấp mã `ĐC-2026-004`, `TĐK-2026-001` bằng `INSERT ... ON CONFLICT DO UPDATE SET last_number = last_number + 1 RETURNING` trong cùng transaction. Các change sau dùng lại cho `PN`, `PX`, `PTH`. Xóa nháp để lại số trống — chấp nhận.

### D9. Hàng kg và phế liệu (câu hỏi 8)

- Mã `KG` (`PL-SAT`): số lượng theo kg (3 chữ số lẻ), giá BQ ₫/kg.
- Mã `PIECE`: số lượng nguyên ở mọi tình trạng, kể cả `SCRAP` (0.2 #3, chốt 27/10). Kg của phế liệu chỉ để hiển thị qua `piecesToKg`. D10 thẻ "Phế liệu tại bãi" cộng kg của mã kg với kg quy đổi; dòng phụ "và 141 cái chờ cân" của bản vẽ D10 đổi thành "gồm 1.108,4 kg quy đổi từ 141 cái", chú thích cuối bảng "Phế liệu dạng cái được tính giá trị sau khi cân thành kg" bỏ (giá trị tính theo giá BQ mỗi cái). Spec thắng thiết kế (`docs/design/screens/README.md`).
- **Bán phế liệu theo kg** (chốt cách ghi sổ, màn ở change sau): bớt theo cái (`SALE_OUT`, giá BQ mỗi cái) và lưu kg cân vào `weighed_kg`; giá bán theo kg nằm ở chứng từ bán. *Đã cân nhắc* "cân rồi chuyển sang mã `PL-SAT`": không chọn vì trái 0.2 #3 và mất dấu mã gốc.

### D10. Ngày nghiệp vụ

Không ghi lùi so với dòng gần nhất cùng (mã + tình trạng), không ghi sau hôm nay. Nhờ vậy thứ tự `(business_date, id)` trên D11 trùng thứ tự tính giá. Giấy tờ về muộn ghi theo ngày nhập phần mềm; ngày giao/trả thật nằm trên phiếu và là ngày tính thuê (D12).

### D11. Ví dụ tính tay cho thẻ kho (`GG-K17`, tình trạng Tốt)

Giả định: ngày 01/10/2026 `GG-K17` Tốt có **1.220 cái tại `BAI-01`** và **2.000 cái đang ở công trình** (`CT-0001` Nhà phố Lê Văn Lương 1.200, `CT-0002` Cầu vượt Mai Dịch 800), giá BQ 195.000 ₫ → pool 3.220 cái. Chờ sửa `GG-K17` có giá BQ 160.000 ₫. Công trình `CT-0007` Nhà xưởng KCN Quang Minh chưa có hàng.

| Ngày | Chứng từ | Dòng sổ (vị trí) | Đơn giá ghi sổ | Tồn Tốt tại bãi | Pool Tốt (mọi vị trí) | Giá BQ Tốt sau |
|---|---|---|---|---|---|---|
| 01/10 | Tồn đầu kỳ | – | – | 1.220 | 3.220 | 195.000 |
| 03/10 | `PX-2026-118` | `DELIVERY_OUT` −300 (bãi); `DELIVERY_IN` +300 (`CT-0002`) | 195.000 | 920 | 3.220 | 195.000 |
| 08/10 | `PN-2026-087` | `PURCHASE_IN` +160 (bãi), giá trị 31.384.800 | 196.155 | 1.080 | 3.380 | **195.055** |
| 12/10 | `PSC-2026-021` | `REPAIR_OUT` −40 Chờ sửa (xưởng, 160.000); `REPAIR_IN` +40 Tốt (bãi), giá trị 40 × 160.000 + 40 × 54.500 = 8.580.000 | 214.500 | 1.120 | 3.420 | **195.282** |
| 15/10 | `PTH-2026-064` | `RETURN_OUT` −210 (`CT-0001`); `RETURN_IN` +210 (bãi) | 195.282 | 1.330 | 3.420 | 195.282 |
| 16/10 | `ĐC-2026-004` | `ADJUST_OUT` −10 Tốt (bãi, 195.282); `ADJUST_IN` +10 Chờ sửa (bãi, 160.000) | 195.282 | 1.320 | 3.410 | 195.282 |
| 20/10 | `PX-2026-131` | `DELIVERY_OUT` −120 (bãi); `DELIVERY_IN` +120 (`CT-0007`) | 195.282 | 1.200 | 3.410 | 195.282 |
| 22/10 | `PTH-2026-069` | `RETURN_OUT` −40 (`CT-0007`); `RETURN_IN` +40 (bãi) | 195.282 | 1.240 | 3.410 | 195.282 |

Tính:
- 08/10: (3.220 × 195.000 + 31.384.800) ÷ (3.220 + 160) = (627.900.000 + 31.384.800) ÷ 3.380 = 659.284.800 ÷ 3.380 = 195.054,67 → **195.055 ₫**. Đơn giá ghi sổ 31.384.800 ÷ 160 = 196.155 ₫.
- 12/10: (3.380 × 195.055 + 8.580.000) ÷ 3.420 = (659.285.900 + 8.580.000) ÷ 3.420 = 667.865.900 ÷ 3.420 = 195.282,43 → **195.282 ₫**. Giá BQ Chờ sửa vẫn 160.000 ₫.
- 03/10, 15/10, 20/10, 22/10 là chuyển chỗ: pool và giá BQ không đổi; tổng giá trị Tốt sau 12/10 là 3.420 × 195.282 = 667.864.440 ₫ cho tới 15/10.
- 16/10: hàng chuyển tình trạng: giá trị Tốt giảm 10 × 195.282 = 1.952.820 ₫ (còn 3.410 × 195.282 = 665.911.620 ₫), Chờ sửa tăng 10 × 160.000 = 1.600.000 ₫; giá BQ cả hai không đổi.
- Thẻ kho Tốt, Tại bãi, tháng 10: Tồn đầu **1.220**; Nhập 160 + 40 + 210 + 40 = **450**; Xuất 300 + 10 + 120 = **430**; Tồn cuối **1.240**; giá BQ hiện tại **195.282 ₫**.
- Nếu (sai) chỉ tính trên bãi + xưởng thì ra 195.171 / 195.861 như bản vẽ — dùng làm ca test phản chứng: kết quả phải **khác** hai số này.

Bộ số này là dữ liệu mẫu của `npm run db:seed:dev` (ghi bằng `postMovements` với các loại biến động của change sau), là test integration "thẻ kho khớp tính tay" và là số trên ảnh mốc D11.

### D12. Ràng buộc cho change sau: ngày tính tiền thuê không lấy từ ngày ghi sổ

`business_date` của sổ kho là ngày ghi sổ và không lùi (D10) để đúng thứ tự giá vốn. Nhưng thủ kho có thể lưu nháp khi mất sóng (0.2 #7) và gửi muộn, nên ngày ghi sổ có thể trễ hơn ngày giao/trả thật; nếu tính thuê theo ngày ghi sổ thì thiếu tiền. Vì vậy:

- `deliveries` và `returns-and-compensation`: phiếu xuất và phiếu thu hồi **lưu ngày giao / ngày trả thực tế** của riêng phiếu (cột trên phiếu, không trên sổ kho).
- `rental-billing`: tính số ngày thuê theo **ngày thực tế của phiếu**, không theo `business_date` của sổ kho.
- Ngày thực tế **không được sau** ngày ghi sổ, và chỉ được **lùi tối đa 3 ngày** so với ngày ghi sổ; lùi thì **bắt buộc ghi lý do** (lưu cùng phiếu). Con số 3 ngày là đề xuất, change `deliveries` chốt lại.
- Change này không thêm cột ngày thực tế vào sổ kho; `document_id` trên dòng sổ đủ để `rental-billing` nối về phiếu.

### D13. Service, API, giao diện

- `src/lib/inventory/`: `post.ts` (`postMovements`), `stock.ts` (bảng D10, thẻ số, từng công trình), `card.ts` (thẻ kho D11: tồn đầu kỳ = tổng trước `from`, dòng trong kỳ, cộng dồn bằng window function), `adjustments.ts` (list, get, create, update, delete, submit, approve, return), `reconcile.ts`. Sửa `src/lib/catalog/items.ts` (`archiveItem` kiểm tổng tồn), `places.ts` (`archiveSite`, `archiveLocation` kiểm tồn tại vị trí) trong cùng transaction đang khóa bản ghi `FOR UPDATE`.
- API (bọc `withAuth`, zod, thông báo tiếng Việt):
  - `GET /api/inventory/stock?q&group` → `{ rows, cards }` (`inventory.view`)
  - `GET /api/inventory/items/[code]/sites` → số lượng từng công trình (`inventory.view`)
  - `GET /api/inventory/items/[code]/card?condition&place&site&from&to` (`inventory.view`)
  - `GET|POST /api/inventory/adjustments` (`inventory.view` | `inventory.adjust`)
  - `GET|PATCH|DELETE /api/inventory/adjustments/[id]` (`inventory.view` | `inventory.adjust`)
  - `POST /api/inventory/adjustments/[id]/submit` (`inventory.adjust`), `/approve`, `/return` (`inventory.approve`)
- Trang (Server Component, `requirePermission("inventory.view")`): `/inventory` (D10, thay trang giữ chỗ), `/inventory/items/[code]` (D11), `/inventory/adjustments` (danh sách), `/inventory/adjustments/[id]` (chi tiết, sửa nháp). Form lập phiếu mở trong Sheet như form danh mục.
- **Phiếu điều chỉnh chưa có bản vẽ** trên canvas: làm theo bố cục D10 (bảng + Sheet), dùng component sẵn có; ghi vào PR để duyệt khi review giao diện.
- D10 ở 1366px: 9 cột số + cột tên. Cột tên được xuống dòng, cột số `tabular-nums`, kiểm bằng E2E như D9 (bảng hẹp nhất còn dư ≥ 24px).

### D14. Test

- Unit (`src/domain/average-cost.test.ts`, `stock-adjustment.test.ts`, `movement.test.ts`): chuỗi D11 (195.055, 195.282) và ca phản chứng (không ra 195.171 / 195.861), chuỗi chuyển chỗ giữ giá BQ và tổng giá trị, làm tròn đúng nửa/dưới nửa, tồn 0, giữ giá cuối, hàng kg, số lớn, dòng sai dấu, số lẻ hàng cái, dựng dòng sổ từ 3 kiểu điều chỉnh.
- Integration (`src/lib/inventory/*.int.test.ts`): UPDATE/DELETE/TRUNCATE bị từ chối, `inventory_truncate_allowed` chỉ đúng với DB `_test` + cờ; chuỗi D11 qua `postMovements` + thẻ kho khớp bảng D11; D10 khớp `SUM` sổ; ghi đồng thời (2 nhập cùng mã ra đúng giá BQ của thứ tự hoàn tất; 2 xuất vượt tồn chỉ 1 thành công; 2 phiếu chạm 2 mã ngược thứ tự không kẹt) × 8 vòng; điều chỉnh tình trạng ra đúng 2 dòng; duyệt hai lần; tồn đổi trước lúc duyệt; ngừng dùng vật tư/công trình/xưởng còn tồn bị chặn; đối chiếu sau mỗi kịch bản; quyền 403 từng vai trò cho mọi route ghi.
- Component: D10 (dòng, thẻ số, phế liệu), D11 (tóm tắt, ẩn cột giá khi "Tất cả"), form điều chỉnh.
- E2E: Kế toán lập tồn đầu → Giám đốc duyệt → D10 hiện số → mở D11; Kế toán lập điều chỉnh tình trạng → Giám đốc trả lại → sửa → duyệt; D10 1366px không cuộn ngang; responsive, a11y, ảnh mốc D10, D11.
- **Dữ liệu E2E**: sổ kho ở DB dev không xóa được, nên E2E dùng mã cố định `E2E-KHO-01`… tạo một lần, không xóa, và kiểm theo **chênh lệch** trước/sau. `tests/e2e/global-setup.ts` bỏ qua mã `E2E-%` đã có dòng sổ khi dọn danh mục.

## Risks / Trade-offs

- **Số mẫu D11 khác bản vẽ** (D3): ảnh mốc và kiểm tra tay theo bộ số D11 mới; bản vẽ không sửa (chỉ là mẫu).
- **Mất phần lẻ làm tròn**: mỗi lần đổi giá có thể lệch tới 0,5 ₫ × số lượng (VD 120 ₫ ngày 12/10). Chấp nhận theo 0.2 #10.
- **Không ghi lùi ngày**: giấy tờ về muộn phải ghi theo ngày nhập máy. Nếu sau này cần lùi ngày thì phải tính lại giá BQ các dòng sau — không làm.
- **Superuser tắt trigger** vẫn sửa được sổ: chỉ chặn được người dùng ứng dụng; backup + `inventory:check` phát hiện lệch.
- **E2E ghi thêm dòng vào DB dev mỗi lần chạy**: ít dòng, chấp nhận đến khi có DB riêng cho E2E (issue K2 #24).
- **Tính thẳng từ sổ** có thể chậm khi sổ rất lớn: có ngưỡng và hướng xử lý ở D6.

## Migration Plan

- Migration `drizzle/0003_inventory_ledger.sql`: các bảng, CHECK, index, hàm và trigger (viết tay phần trigger), không có dữ liệu.
- Chưa có số tồn cũ nên không chuyển dữ liệu. Khi đưa vào dùng thật: Kế toán lập phiếu tồn đầu kỳ, Giám đốc duyệt.
- Rollback: chỉ khi chưa dùng thật — bỏ migration (DROP các bảng mới); dữ liệu danh mục không đổi.

## Open Questions

- Đã chốt khi review PR #30: giá BQ gộp mọi vị trí (D3, 0.2 #24); thủ kho **không** lập phiếu điều chỉnh trên mobile ở MVP (chờ `stocktake`).
- Còn mở cho change `deliveries`: số ngày tối đa được lùi ngày giao/trả thực tế (đề xuất 3, D12).
