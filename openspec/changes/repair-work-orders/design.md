# Design: Lệnh sửa chữa đầy đủ (`repair-work-orders`)

## Context

- Phiếu sửa đơn giản (`src/lib/repairs/`, `src/domain/repair-order.ts`, bảng `repair_order`, `repair_order_line`):
  - Chỉ có Nháp → Đã ghi sổ.
  - Chi phí sửa gõ tay theo dòng.
  - Ghi sổ qua `postRepairOrder`: khóa phiếu, rồi `lockForPosting` (vật tư → vị trí → giá), rồi `postMovements`.
  - Hàm thuần đã có: `costRepairLine` (B, phế liệu, phần hỏng, lỗ hỏng hàng, giá vào Tốt), `repairPostingLines`.
- Sổ kho (`inventory_ledger`):
  - Đã có `TRANSFER_OUT` / `TRANSFER_IN` (không đổi giá) và `REPAIR_OUT` (xuất theo giá BQ).
  - Ràng buộc loại biến động nằm trong CHECK của DB.
  - Hàm đọc theo hợp đồng (`site-ledger.ts`) lọc `TRANSFER_*` theo `document_type = 'SITE_TRANSFER'`, nên dòng chuyển của loại chứng từ khác không lọt vào.
- D15 (`src/domain/gross-profit.ts`, `src/lib/reports/costs.ts`):
  - `classifyLedger` trả `null` cho `REPAIR_*`, `TRANSFER_*`.
  - Đẳng thức đối chiếu: `ledgerCostCheck = − Σ(dòng sổ trừ OPENING, PURCHASE_IN, REVALUE) + Σ repair_cost`.
  - `repairSums` lấy ngày ghi sổ bằng `min(business_date)` của mọi dòng sổ có `document_type = 'REPAIR'`.
- Danh mục: `item_group.category` đã có `EQUIPMENT` / `MATERIAL`. Chưa có đơn vị lít. Seed chưa có mã vật tư nào.
- Vai trò `WORKSHOP` hiện chỉ có `catalog.read`, `stock.lookup`. Chưa có màn nào cho Xưởng.
- Bản vẽ D12 ghi "Vật tư phụ (giá BQ ở XUONG-01)" và "Nhập 56 Tốt, 4 Phế liệu ở XUONG-01". PR này sửa bản vẽ thành "Vật tư phụ (giá BQ)" (giá BQ tính chung mọi vị trí, 0.2 #24) và "ở BAI-01" (0.2 #130).
- Phiếu nhập (`src/lib/receiving/post.ts`, `queries.ts`) chỉ nhận vào bãi (`type = 'YARD'`).

## Goals / Non-Goals

**Goals:**

- Một chứng từ cho cả hai cách sửa. Lệnh mới đi đủ 6 bước, phiếu cũ vẫn đọc và xử lý được.
- Mọi số tiền của lệnh tính ra từ đơn giá đã chụp và sổ kho. D15 không trừ vật tư hai lần, và đẳng thức đối chiếu vẫn bằng 0 lệch.
- Điện thoại (M8, `/api/m/repairs`) không bao giờ nhận số tiền.

**Non-Goals:**

- Không đổi CHECK loại biến động của sổ kho.
- Không đổi công thức 0.2 #23.
- Không lưu tổng cộng dồn của lệnh: công, vật tư, chi phí chỉ chụp lúc ghi sổ, giống `loss_amount` hiện nay.

## Decisions

### D1. Phiếu sửa đơn giản: gộp vào cùng bảng, ngừng lập mới (điểm cần chốt 1)

**Chọn:**

- Giữ bảng `repair_order`, thêm cột `kind` (`SIMPLE` | `WORK_ORDER`, mặc định `SIMPLE` cho dữ liệu cũ). Hai loại dùng chung dãy mã `PSC`: thiết kế D12 ghi `PSC-2026-031`.
- Từ change này, nút "Lệnh mới" và `POST /api/repairs` chỉ tạo `WORK_ORDER`. API từ chối thân yêu cầu kiểu phiếu đơn giản (spec `repair-orders`).
- Phiếu `SIMPLE` Nháp còn lại vẫn mở D12 đơn giản, sửa, xóa, ghi sổ như cũ. Phiếu `SIMPLE` đã ghi sổ không đổi.
- `/repairs` liệt kê cả hai loại. `/repairs/<mã>` chọn màn theo `kind`.

**Lý do:**

- Một dãy mã, một danh sách, một chỗ cho D15 đọc (`repair_order_line.repair_cost`, `loss_amount`).
- Hàm thuần `costRepairLine` dùng chung, vì chỉ khác nguồn của chi phí sửa (gõ tay hay tính ra).
- Không phải chuyển dữ liệu.

**Đã cân nhắc:**

- **Hai bảng song song** (`repair_work_order` riêng): lặp mã, lặp danh sách, D15 phải đọc hai nguồn. Bỏ.
- **Chuyển nháp cũ thành lệnh:**
  - Nháp cũ không có xưởng, đơn giá công hay vật tư.
  - Chi phí gõ tay không tách ra được thành công và vật tư.
  - Chuyển tự động sẽ bịa số. Bỏ.
- **Vẫn cho lập phiếu đơn giản** (sửa thuê ngoài, trả tiền khoán theo hóa đơn): để mở. Câu hỏi Q1 trên PR. Nếu anh muốn giữ thì chỉ cần mở lại nút "Phiếu sửa nhanh" và bỏ một kiểm tra, không đổi bảng.

### D2. Loại dòng sổ (điểm cần chốt 2)

**Chuyển bãi → xưởng khi nhận lệnh:**

- Dùng lại `TRANSFER_OUT` / `TRANSFER_IN`, tình trạng Chờ sửa, `document_type = 'REPAIR'`, `document_id` = lệnh. Lần nhận có `posting_id` riêng, lưu ở `repair_order.receive_posting_id`.
- **Lý do:**
  - Đúng nghĩa "chuyển vị trí", không đổi giá (`changesAverage` = false).
  - Spec `inventory-ledger` đã có ví dụ "chuyển 30 cái bãi → xưởng".
  - Không phải sửa CHECK.
  - `site-ledger.ts` lọc theo `SITE_TRANSFER` nên tiền thuê và D6 không bị ảnh hưởng.
  - `classifyLedger` trả `null`, nên D15 không bị ảnh hưởng.
- **Đã cân nhắc:**
  - **Loại mới `MOVE_*`:** phải sửa CHECK và mọi chỗ liệt kê loại biến động, mà không thêm thông tin gì. Bỏ.
  - **`ADJUST_*`:** sai nghĩa. D15 sẽ xếp vào "Chênh lệch kiểm kê" (ra 0, nhưng gây nhầm). Bỏ.

**Vật tư xuất dùng:**

- `REPAIR_OUT` trên chính mã vật tư, tại xưởng, cùng `posting_id` với lần ghi sổ lệnh.
- Mỗi cặp (dòng lệnh, vật tư, tình trạng) một dòng sổ. Vì vậy giá trị vật tư của từng dòng lệnh đọc thẳng từ sổ, không phải chia lại.
- Lấy tình trạng Mới trước rồi Tốt (giống 0.2 #62 khi thu hồi).
- **Lý do:** `REPAIR_OUT` đã có nghĩa "đưa ra khỏi kho để sửa", xuất theo giá BQ, và `classifyLedger` trả `null` (xem D3).
- **Đã cân nhắc:** loại mới `CONSUME_OUT`. Nó rõ nghĩa hơn khi đọc thẻ kho, nhưng phải sửa CHECK. Thẻ kho đã hiện mô tả dòng "PSC-2026-031: vật tư sửa GG-K17", nên đủ rõ. Bỏ.

**Nơi nhập Tốt và Phế liệu khi ghi sổ (0.2 #130):**

- `REPAIR_OUT` Chờ sửa **ở xưởng** (hàng đã chuyển sang lúc nhận). `REPAIR_IN` Tốt và Phế liệu **ở chỗ lấy hàng** (`from_location_id`, bãi gốc). Lệnh lấy tại chính xưởng thì nhập ở xưởng. Vật tư trừ ở xưởng.
- **Lý do:** phiếu xuất chỉ lấy hàng từ một bãi (`deliveries`). Hàng sửa xong để ở xưởng thì không cho thuê được, muốn đưa về bãi phải lập `ĐC` vị trí (cần Giám đốc duyệt). Thực tế xưởng sửa xong thì đưa hàng về bãi, Thủ kho đếm ở bãi lúc nghiệm thu.
- `REPAIR_OUT` và `REPAIR_IN` của cùng một dòng nằm ở hai vị trí khác nhau là bình thường: phiếu sửa đơn giản đã cho "lấy tại" khác "nhập về".
- **Đã cân nhắc:**
  - Nhập Tốt ở xưởng (bản vẽ đầu): hàng kẹt ở xưởng. Bỏ.
  - Thêm bước "xưởng trả hàng về bãi" (chuyển `TRANSFER_*` Tốt xưởng → bãi): thêm một lần ghi sổ, mà kết quả giống hệt. Bỏ.

**Hủy lệnh sau khi xưởng đã nhận:**

- Ghi chuyển ngược xưởng → chỗ lấy (`TRANSFER_*`, `posting_id` riêng, lưu ở `cancel_posting_id`), ngày hủy, trong transaction hủy.
- **Lý do:**
  - Hủy nghĩa là không sửa nữa, và hàng phải về lại chỗ cũ thì tồn bãi mới đúng.
  - Để hàng nằm ở xưởng thì Thủ kho phải lập phiếu `ĐC` vị trí, mà phiếu đó cần Giám đốc duyệt. Nặng hơn mà dễ quên.
- **Đã cân nhắc:** để hàng ở xưởng, lệnh mới lấy tại xưởng. Câu hỏi Q4.

### D3. D15 không trừ vật tư hai lần (điểm cần chốt 3)

Vật tư đi qua sổ hai lần: `PURCHASE_IN` (không vào giá vốn), rồi `REPAIR_OUT` lúc sửa. Giá trị của nó chuyển vào dòng `REPAIR_IN` Tốt. Tách chi phí sửa thành hai phần:

- **Ngoài sổ:**
  - Công khoán của lệnh, hoặc chi phí gõ tay của phiếu đơn giản.
  - Phần này **làm tăng** tổng giá trị sổ, nên đẳng thức phải cộng bù.
- **Trong sổ:**
  - Vật tư.
  - Phần này chỉ chuyển giá trị từ mã vật tư sang mã được sửa. Tổng giá trị sổ không đổi, nên đẳng thức **không** được cộng bù.

**Sửa code:**

- `RepairSum` thêm `materialCost`.
- `repairSums` cộng thêm `material_amount` của dòng lệnh.
- `ledgerCostCheck`: `spent = Σ (repairCost − materialCost)`.
- `repairSpent` (dòng "Chi phí sửa đã chi trong kỳ" dưới bảng) vẫn là `Σ repairCost` = công + vật tư. Đó là số đã thật sự chi.
- `classifyLedger` giữ nguyên: `REPAIR_*` và `TRANSFER_*` trả `null`. Khoản "Sửa chữa" vẫn chỉ là `Σ loss_amount`.

**Ví dụ số (lệnh D12, tháng 11/2026, không có chứng từ khác):**

| Dòng sổ của lần ghi sổ (vị trí) | Giá trị |
|---|---|
| `REPAIR_OUT` −40 `GG-K17` Chờ sửa × 160.000 (`XUONG-01`) | −6.400.000 |
| `REPAIR_IN` +36 `GG-K17` Tốt (`BAI-01`) | +7.975.000 |
| `REPAIR_IN` +4 `GG-K17` Phế liệu (`BAI-01`) | +405.000 |
| `REPAIR_OUT` −20 `CHEO-1,7` Chờ sửa × 30.000 (`XUONG-01`) | −600.000 |
| `REPAIR_IN` +20 `CHEO-1,7` Tốt (`BAI-01`) | +845.000 |
| `REPAIR_OUT` −6 kg `VT-QH` (`XUONG-01`) | −270.000 |
| `REPAIR_OUT` −3 lít `VT-SON` (dòng `GG-K17`) | −270.000 |
| `REPAIR_OUT` −0,5 lít `VT-SON` (dòng `CHEO-1,7`) | −45.000 |
| **Cộng** | **+1.640.000** = công |

Dòng chuyển bãi → xưởng lúc nhận cộng 0. Vị trí không ảnh hưởng tổng (D15 không đọc theo vị trí).

- Đẳng thức mới: −1.640.000 + (2.225.000 − 585.000) = **0** = khoản Sửa chữa (lỗ hỏng hàng 0). Đúng.
- Đẳng thức cũ: −1.640.000 + 2.225.000 = 585.000 ≠ 0. Vật tư bị tính thêm một lần. Test phải bắt trường hợp này (spec `gross-profit`).
- Phiếu đơn giản cũ có `material_amount` = 0, nên mọi tháng cũ cho ra cùng số như trước.

**Tháng ghi sổ:**

- `repairSums` hiện lấy `min(business_date)` của mọi dòng `REPAIR`. Dòng chuyển lúc nhận mang cùng `document_type` và ngày sớm hơn, nên sẽ đẩy lệnh sang tháng nhận.
- Sửa: nối sổ với `repair_order` bằng `inventory_ledger.posting_id = repair_order.posting_id` (lần ghi sổ lệnh). Không lấy theo `document_type`.
- D12 khối giá vốn sau ghi sổ cũng đọc theo `posting_id` này.

**Đã cân nhắc:**

- **Coi vật tư là một khoản giá vốn riêng ("Vật tư sửa chữa")** rồi bỏ khỏi giá Tốt: trái với 0.2 #118 (vật tư chia cho hàng sửa xong), và lại thành trừ hai lần khi hàng Tốt rời kho. Bỏ.
- **Ghi vật tư bằng `document_type` riêng (`REPAIR_MATERIAL`)** rồi lọc khỏi đẳng thức: vẫn phải bù đúng chừng ấy tiền ở `repairSpent`, mà phải thêm một loại chứng từ. Tách cột `material_amount` gọn hơn.

**Hàng cho thuê (fleet):** `fleetItems` chỉ lấy mã có `item_group.category = 'EQUIPMENT'`. Biến động và tồn đầu của mã khác bị bỏ. Lý do: que hàn, sơn có tồn Mới ở xưởng, sẽ làm phồng "hàng cho thuê bình quân" và hạ tỷ lệ khai thác. Câu hỏi Q5.

### D4. Đơn giá công: chụp lúc giao xưởng (điểm cần chốt 4)

**Chọn:**

- Cột mới `item.repair_labor_rate bigint null` (≥ 0, trống = chưa đặt).
- Lúc **Giao xưởng**, chép vào `repair_order_line.labor_rate`. Mã chưa đặt đơn giá thì từ chối giao.
- Thu hồi lệnh (Đã giao → Nháp) xóa số đã chụp. Giao lại thì chụp lại.
- Ghi sổ: `labor_amount = sửa xong (Thủ kho đếm) × labor_rate`.

**Lý do:**

- Khoán là giá thỏa thuận lúc giao việc. Xưởng làm theo giá đó, nên danh mục đổi sau đó không được đổi tiền của việc đã giao.
- Chụp lúc ghi sổ thì Kế toán đổi giá trong lúc xưởng đang sửa sẽ làm đổi số đã hứa.

**Đã cân nhắc:**

- **Chụp lúc ghi sổ:** đơn giản hơn nhưng sai nghĩa khoán. Bỏ.
- **Chụp lúc tạo nháp:** nháp có thể nằm lâu. Giá khi giao mới là giá có hiệu lực. Bỏ.

**Ai sửa đơn giá:** `repairs.manage` (Giám đốc, Kế toán), trên form D9. Trường hiện cho người có `repairs.view`. Lý do: đây là số chi phí, Kế toán giữ. `items.manage` là của Kinh doanh. Câu hỏi Q3.

### D5. Khóa và thứ tự khóa, 409 (điểm cần chốt 5)

- **Mọi lệnh ghi** (lưu nháp, giao, thu hồi, nhận, báo xong, đếm, trả lại, hủy, ghi sổ):
  1. `SELECT … FOR UPDATE` lệnh.
  2. So `updated_at` gửi lên. Lệch thì trả 409.
  3. Kiểm `transition()`.
  4. Ghi.
  5. Gọi `logActivity`.
  6. Đặt `updated_at = now()`.
- **Nhận lệnh, hủy sau nhận:** khóa lệnh → `lockForPosting({ itemIds: mã của lệnh, locationIds: [chỗ lấy, xưởng], pairs: (mã, NEEDS_REPAIR) })` → `postMovements`.
- **Ghi sổ:**
  1. Khóa lệnh.
  2. `lockForPosting` với `itemIds` = mã sửa ∪ mã vật tư (sắp tăng dần như hiện nay), `locationIds = [xưởng, chỗ lấy]` (sắp tăng dần), `pairs` = (mã sửa, NEEDS_REPAIR | GOOD | SCRAP) ∪ (vật tư, NEW | GOOD).
  3. Đọc tồn vật tư tại xưởng dưới khóa, chia Mới trước rồi Tốt.
  4. Đọc giá sắt vụn.
  5. Tính bằng hàm thuần.
  6. `postMovements`.
  7. Cập nhật dòng lệnh (`quantity_*`, `labor_amount`, `material_amount`, `repair_cost`, `loss_amount`), `repair_material.amount`, trạng thái `POSTED`.

  Cùng thứ tự với `postRepairOrder` và `postMovements`, nên không có deadlock với phiếu nhập, phiếu xuất ghi cùng lúc.
- **Xưởng và Thủ kho sửa cùng lúc:** số chỉ lên server ở hai lệnh (Báo sửa xong của xưởng, Đếm xong của Thủ kho), và hai lệnh này ở hai trạng thái khác nhau.
  - Chỉ đụng nhau khi văn phòng trả lại lệnh lúc Thủ kho đang đếm.
  - Khi đó `updated_at` lệch và Thủ kho nhận 409. Nháp trên máy giữ nguyên.
- **Gửi lại từ điện thoại:**
  - Nhận lệnh, Báo sửa xong, Đếm xong mang `draftId` sinh trên máy (mỗi lần bấm một `draftId` mới).
  - Server lưu **mọi** `draftId` đã dùng vào bảng chỉ ghi thêm `repair_order_submission` (xem D7), trong transaction của bước đó.
  - Thứ tự: tìm `draftId` **trước** khi khóa lệnh và so `updatedAt` (như `postDelivery` tìm mã nháp trước). Gặp `draftId` đã dùng thì trả trạng thái hiện tại của lệnh, không ghi gì, kể cả khi lệnh đã qua nhiều bước sau đó.
  - **Lý do không dùng cột `*_draft_id` trên lệnh:** lệnh bị trả lại rồi xưởng báo lần hai thì cột bị ghi đè. Nếu điện thoại gửi lại yêu cầu báo **lần một** (mạng chập chờn), server không còn nhận ra, và số cũ đè lên số lần hai.
  - Ví dụ: báo (`d1`) → trả lại → báo lần hai (`d2`) → yêu cầu `d1` tới muộn → server thấy `d1` đã dùng, trả trạng thái hiện tại, số của `d2` giữ nguyên.

### D6. Quyền (điểm cần chốt 6)

| Quyền | Vai trò | Dùng cho |
|---|---|---|
| `repairs.view` | Giám đốc, Kế toán, Kinh doanh | `/repairs`, D12, xem đơn giá công trên D9 |
| `repairs.manage` | Giám đốc, Kế toán | Lập, sửa, xóa nháp, giao, thu hồi, trả lại, hủy, ghi sổ; sửa đơn giá công |
| `repairs.work` (mới) | Giám đốc, Xưởng | `/m/repairs`, nhận lệnh, báo sửa xong |
| `repairs.count` (mới) | Giám đốc, Thủ kho | `/m/repairs`, đếm nghiệm thu |

- `/api/m/repairs/**` bọc `withAuth` với `repairs.work` hoặc `repairs.count`, tùy route.
- Hàm đọc của điện thoại (`queries-mobile.ts`) chọn cột tường minh, không chọn cột tiền nào.
- Test kiểm cả JSON: không có khóa nào khớp `/price|cost|amount|rate|labor|value/i`.
- Giám đốc có cả hai quyền để làm thay khi cần, như `receiving.manage`.

### D7. Dữ liệu và API

**Bảng `repair_order`** (thêm):

- `kind`.
- `status`: CHECK mở rộng `DRAFT, ASSIGNED, IN_PROGRESS, AWAITING_CHECK, COUNTED, POSTED, CANCELLED`, và `SIMPLE` chỉ có `DRAFT`, `POSTED`.
- Với `WORK_ORDER`, `to_location_id` là xưởng. Service kiểm loại `WORKSHOP` khi lưu.
- Các cặp người / lúc: `assigned_by/at`, `received_by/at`, `reported_by/at`, `counted_by/at`, `returned_by/at` + `return_note`, `cancelled_by/at` + `cancel_reason`.
- `receive_posting_id`, `cancel_posting_id`.
- `repair_date` của lệnh = ngày báo sửa xong (cập nhật khi báo), để danh sách và D12 cũ đọc được.

**Bảng `repair_order_line`** (thêm):

- `labor_rate` (chụp lúc giao).
- `reported_good`, `reported_scrap` (số xưởng báo).
- `labor_amount`, `material_amount` (lúc ghi sổ).
- CHECK số lượng nới thành `taken > 0 and good >= 0 and scrap >= 0 and (good + scrap = taken or (good = 0 and scrap = 0))`, để lệnh chưa báo có 0 / 0. Service bắt buộc đủ số khi báo, đếm, ghi sổ.

**Bảng mới `repair_order_material`:**

- `id`, `line_id` → `repair_order_line` ON DELETE CASCADE.
- `item_id` → `item` RESTRICT.
- `quantity numeric(14,3) > 0`.
- `amount bigint null` (lúc ghi sổ, = − tổng dòng sổ vật tư của dòng).
- UNIQUE(`line_id`, `item_id`).

**Bảng mới `repair_order_submission`** (chỉ ghi thêm, thêm vào `APPEND_ONLY_TABLES`, trigger `*_append_only`):

- `id`, `order_id` → `repair_order` RESTRICT.
- `step` (`RECEIVE` | `REPORT` | `COUNT`).
- `draft_id uuid` UNIQUE.
- `created_by`, `created_at`.
- Lệnh Nháp xóa được nên chưa có dòng nào (chỉ ba bước của điện thoại ghi vào đây, đều sau Nháp).

**Trigger:**

- `repair_order_posted_locked` mở rộng: chặn sửa, xóa dòng, vật tư của lệnh `POSTED` hoặc `CANCELLED`.
- Chèn số cuối (`quantity_*`, `amount`) **trước** khi đổi trạng thái sang `POSTED`, như phiếu xuất.

**Danh mục:**

- `item.repair_labor_rate`.
- `QUANTITY_UNITS` thêm `LITER` ("lít", đơn vị đo, 3 số lẻ, cần trọng lượng chuẩn; `isRepairableUnit` = false).
- Migration thay CHECK `item_unit_check`.

**API desktop** (`withAuth`):

- `GET /api/repairs`, `POST /api/repairs` (tạo lệnh).
- `GET`, `PATCH`, `DELETE /api/repairs/[code]`.
- `POST /api/repairs/[code]/assign`, `/recall`, `/return` `{ updatedAt, note }`, `/cancel` `{ updatedAt, reason }`, `/post` `{ updatedAt, confirmations }`.
- `/post` đã có, chọn đường theo `kind`.

**API điện thoại** (không tiền):

- `GET /api/m/repairs`, `GET /api/m/repairs/[code]`.
- `POST /api/m/repairs/[code]/receive` `{ draftId, updatedAt }`.
- `POST /api/m/repairs/[code]/report` và `/count` `{ draftId, updatedAt, lines: [{ itemId, good, scrap, materials: [{ itemId, quantity }] }] }`.
- `GET /api/m/repairs/materials` (mã nhóm Vật tư đang dùng: mã, tên, đơn vị).

**Hàm thuần:**

- `src/domain/repair-work-order.ts`:
  - `transition(status, step)` cùng bảng bước.
  - `laborAmount(goodMilli, rate)`.
  - `splitMaterialIssue(need, { newMilli, goodMilli })`.
  - `checkReport(lines)`.
- Dùng lại `costRepairLine` với `repairCost = labor + material`.

### D8. Ảnh mốc và E2E (điểm cần chốt 7)

**Seed (`db:seed:dev`):**

- Nhóm "Vật tư phụ" (`MATERIAL`): `VT-QH` (kg), `VT-SON` (lít, 1,3 kg/lít), `VT-BL12` (cái, 0,1 kg). Tồn đầu kỳ tại `XUONG-01`: 18 kg, 12 lít, 340 cái, theo giá như D12.
- Đơn giá công: `GG-K17` 40.000 ₫, `GG-CH` 10.000 ₫.
- Một lệnh mẫu **Đã đếm** như D12. Seed không có `CHEO-1,7`, nên dòng thứ hai dùng `GG-CH`.
- Mã yêu cầu cố định, chạy lại không thêm.

**E2E (`repairs.spec.ts`, nhóm chạy nối tiếp, vì `repairs.spec.ts` đã đo `E2E-KHO-01` ở xưởng):**

- Global setup tạo một lần mã vật tư `E2E-VT-01` (nhóm Vật tư) và giữ ≥ 10 kg ở `XUONG-01`.
- Đặt đơn giá công cho `E2E-KHO-01`.
- Giữ ≥ 5 `E2E-KHO-01` Chờ sửa ở `BAI-01`.
- Hủy lệnh `WORK_ORDER` chưa ghi sổ do `e2e.*` lập lần trước (hủy sau nhận tự chuyển hàng về).
- Luồng:
  1. Kế toán lập lệnh 2 cái tại `BAI-01` → giao.
  2. Xưởng (storage state `WORKSHOP`) nhận trên M8.
  3. Báo sửa xong 2 Tốt + 0,5 kg vật tư.
  4. Thủ kho đếm.
  5. Kế toán ghi sổ.
- Kiểm theo **chênh lệch** tồn ở `BAI-01`, `XUONG-01` (sổ kho không xóa được): sau ghi sổ, `E2E-KHO-01` Tốt tăng ở `BAI-01`, Chờ sửa ở `XUONG-01` về như trước khi nhận.
- Thêm một test trả lại xưởng, một test 403 (Xưởng gọi `/post`, Kế toán gọi `/api/m/repairs`).
- Xưởng dùng `statePath("WORKSHOP")` (`e2e.xuong` đã có), Thủ kho dùng `statePath("WAREHOUSE")`.

**Ảnh mốc (chỉ CI):**

- D12 lệnh mẫu của seed: ô tiền gắn `data-mask`, vì B có thể đổi theo E2E khác.
- M8 lệnh mẫu: trạng thái Đang sửa, không có tiền, không cần mask.
- D9, D10 đổi vì thêm 3 mã vật tư: chụp lại.
- Gắn nhãn `update-snapshots`.

### D9. Phiếu nhập vật tư vào xưởng (0.2 #131)

- **Vấn đề:** lệnh sửa trừ vật tư ở xưởng, nhưng phiếu nhập chỉ nhận vào bãi. Không sửa thì tồn vật tư ở xưởng chỉ có qua phiếu `ĐC` (cần Giám đốc duyệt).
- **Chọn:**
  - `lockYard` (`src/lib/receiving/post.ts`) đổi thành `lockReceiptLocation`: nhận `YARD`; nhận `WORKSHOP` chỉ khi **mọi dòng của đơn** là mã nhóm `MATERIAL` (đọc `item_group.category` dưới cùng khóa `FOR SHARE` của vật tư).
  - Sai thì 422 "Chỉ đơn toàn vật tư phụ mới nhập vào xưởng, chọn một bãi".
  - Không chọn vị trí mà có nhiều chỗ hợp lệ thì vẫn bắt chọn, như nay.
  - `queries.ts` (dữ liệu M3) trả thêm cờ `materialsOnly` và danh sách xưởng khi cờ bật.
- **Lý do xét theo "mọi dòng của đơn":** một chuyến xe vào một vị trí. Đơn trộn thiết bị và vật tư thì nhập bãi, rồi vật tư sang xưởng bằng `ĐC`, ít gặp.
- **Đã cân nhắc:**
  - Cho mọi phiếu chọn xưởng: hàng thiết bị vào xưởng sẽ kẹt như lỗi của 0.2 #130. Bỏ.
  - Xét theo từng dòng (tách một chuyến thành hai vị trí): đổi luật "một chuyến một phiếu một bãi". Bỏ.
- **Seed:** vật tư mẫu giữ tồn đầu kỳ tại `XUONG-01` (nhanh, không cần đơn mẫu). Integration test của phiếu nhập phủ đường nhập vào xưởng.

## Risks / Trade-offs

- [Nới CHECK số lượng dòng (cho 0 / 0)] → service kiểm đủ số ở báo, đếm, ghi sổ. Integration test ghi sổ lệnh 0 / 0 phải bị từ chối.
- [Hàng cho thuê bình quân D15 giảm ở DB đã có mã nhóm Vật tư tồn Mới / Tốt] → ghi trong PR. Seed hiện không có mã vật tư nên số mẫu không đổi.
- [Xưởng ghi số chỉ trên máy, mất máy là mất số] → nháp IndexedDB như M3. Trước khi báo xong, D12 chỉ hiện "Xưởng đang sửa". Chấp nhận, vì tránh được 409 giữa hai máy.
- [Lệnh để lâu ở Đang sửa giữ hàng ở xưởng] → danh sách lọc theo trạng thái. M1 xưởng đếm vào N.
- [Hủy sau nhận bị từ chối khi kiểm kê xưởng đã đổi tồn] → thông báo chỉ rõ mã và tồn. Kế toán điều chỉnh rồi hủy.
- [Thêm đơn vị `LITER` đụng mọi chỗ liệt kê đơn vị (Excel, nhãn, kiểm số lẻ)] → `QUANTITY_UNITS` là nguồn duy nhất. Test chống lệch CHECK DB ↔ domain đã có.

## Migration Plan

1. Migration SQL:
   - Thêm cột (mặc định an toàn: `kind = 'SIMPLE'`).
   - Thay CHECK `status`, `quantity`, `item_unit_check`.
   - Tạo `repair_order_material`, mở rộng trigger khóa.
2. Dữ liệu cũ:
   - Phiếu đã ghi sổ: `labor_amount` null, `material_amount` = 0 (coi như không có vật tư). D15 cũ không đổi.
   - `npm run inventory:check` không lệch, vì không ghi dòng sổ nào.
3. Deploy demo:
   - Workflow Deploy Demo tự chạy migration khi đổi `drizzle/**`.
   - `db:seed:demo` thêm mã vật tư và lệnh mẫu như seed dev.
4. Rollback: chưa có lệnh `WORK_ORDER` nào thì bỏ cột được. Có rồi thì chỉ lùi code. Bảng vẫn đọc được vì cột mới có mặc định.
