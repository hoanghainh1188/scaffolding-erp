# Design: simple-repair

## Context

- Sổ kho (`inventory-ledger`) đã có loại `REPAIR_OUT` / `REPAIR_IN`; `REPAIR_IN` là loại **đổi giá BQ** (cùng `OPENING`, `PURCHASE_IN`). Mọi dòng ghi qua `postMovements(tx, actor, posting)` trong transaction của chứng từ. Dòng đổi giá phải đưa **tổng giá trị**; dòng khác ghi theo giá BQ hiện tại.
- `postMovements` khóa theo thứ tự: vật tư `FOR SHARE` → vị trí `FOR SHARE` → `inventory_cost` `FOR UPDATE` theo (mã, tình trạng) sắp xếp cố định, rồi mới tính giá. Giá BQ Chờ sửa chỉ biết chắc sau khi khóa.
- Giá BQ gộp mọi vị trí (0.2 #24). Hàng Chờ sửa hiện vào **bãi** (phiếu nhập, sau này thu hồi); xưởng chỉ có hàng qua tồn đầu kỳ hoặc điều chỉnh. Dòng mẫu `PSC-2026-021` trong `src/lib/inventory/sample.ts` ra tại `XUONG-01`, vào Tốt tại `BAI-01`.
- Giá sắt vụn tham khảo (₫/kg) có ở bảng chỉ ghi thêm `scrap_price`, đọc bằng `currentScrapPrice(tx)` (`goods-receipt`). Mã tính theo cái **luôn có** trọng lượng chuẩn > 0 (CHECK `item_weight_check`).
- MVP chưa có phiếu chuyển bãi ↔ xưởng. Trang `/repairs` đang là trang chờ, quyền `repairs.view` (Giám đốc, Kế toán, Kinh doanh) đã có. Trang Desktop chặn vai trò Thủ kho, Xưởng (`app-shell`).
- Mẫu đã có để dùng lại: bộ đếm mã `nextDocumentCode` (`src/lib/inventory/counter.ts`), sửa có `updatedAt` → 409 (`purchase-orders`), hỏi lại khi bất thường (`src/domain/receipt-anomalies.ts`, 0.2 #30), ngày nghiệp vụ = ngày ghi sổ (`stock-adjustments`: ngày duyệt).

## Goals / Non-Goals

**Goals:**
- Một lệnh "Ghi sổ kho" chuyển tình trạng, định giá phế liệu và cộng chi phí sửa, đúng từng đồng, trong một transaction.
- Giá dùng để tính là giá **lúc ghi sổ** (dưới khóa), không phải giá lúc lập nháp.
- Logic tính (giá phế liệu, phần hỏng, giá vào Tốt, luật dòng, bất thường) là hàm thuần trong `src/domain/`, có unit test.

**Non-Goals:**
- Không theo dõi hàng đang nằm ở xưởng chờ sửa (lệnh sửa, Bản 2).
- Không đổi API công khai hay luật của `postMovements` (spec `inventory-ledger` giữ nguyên).

## Decisions

### D1. Ghi sổ: các dòng nào (điểm cần chốt 1; giá phế liệu chốt lại khi review PR #53, sửa 0.2 #23)

Ký hiệu cho một dòng phiếu (một mã): B = giá BQ Chờ sửa đọc dưới khóa; G = sửa xong; S = phế liệu; C = chi phí sửa; W = trọng lượng chuẩn (kg/cái); P = giá sắt vụn tham khảo lúc ghi sổ.

- **Giá trị phế liệu** V = min( round(S × W × P), S × B ), làm tròn 1 ₫, 0,5 lên.
- **Phần hỏng** D = S × B − V (≥ 0).
- G > 0: hàng sửa xong gánh D. G = 0: D là **lỗ hỏng hàng** L của dòng.

| # | Loại | Tình trạng | Vị trí | Số lượng | Giá |
|---|---|---|---|---|---|
| 1 | `REPAIR_OUT` | Chờ sửa | lấy tại | −(G + S) | B (không đổi giá) |
| 2 | `REPAIR_IN` | Tốt | nhập về | +G | giá trị = G × B + C + D |
| 3 | `REPAIR_IN` | Phế liệu | nhập về | +S | giá trị = V |

Dòng 2 hoặc 3 có số 0 thì bỏ (sổ chặn dòng 0). Chênh giá trị của dòng phiếu = C khi G > 0, = −L khi G = 0. Cả phiếu: Σ giá trị vào − Σ giá trị ra = Σ C − Σ L.

Ví dụ D12: `GG-K17` B 160.000, lấy 40, G 36, S 4, W 13,5, P 7.500, C 1.980.000 → V = min(405.000; 640.000) = 405.000; D = 235.000; sổ: −6.400.000; +7.975.000 (221.528 ₫/cái); +405.000. Chênh +1.980.000 = C.

Cả dòng hỏng: `GG-M16` B 210.000, S 5, W 12 → V = min(450.000; 1.050.000) = 450.000; L = 600.000; sổ: −1.050.000; +450.000.

- **Lý do (phương án B, người dùng chốt 28/10/2026):**
  - Phế liệu từ phiếu sửa và phế liệu mua về (0.2 #27) cùng một giá BQ Phế liệu; định giá cùng một cách (theo giá sắt vụn) thì giá BQ Phế liệu gần với giá bán được, không bị đẩy lên bởi giá Chờ sửa.
  - `min` giữ phế liệu không bao giờ đắt hơn giá Chờ sửa của chính nó.
  - Phần giá trị mất (D) dồn vào hàng sửa xong của cùng mã: tổng giá trị sổ vẫn chỉ tăng đúng bằng chi phí sửa, không cần tài khoản lỗ khi còn hàng gánh.
  - Khi không còn hàng gánh (G = 0), ghi thật phần giảm giá trị là lỗ hỏng hàng; phiếu lưu số này cho báo cáo lợi nhuận (#19).
  - Phế liệu dùng `REPAIR_IN` (đổi giá): hàng mang giá V riêng, pha vào giá BQ Phế liệu.
- **Đã cân nhắc:**
  - *A — phế liệu giữ giá Chờ sửa* (bản propose đầu, 0.2 #23 cũ): đơn giản, không cần giá sắt vụn, nhưng giá BQ Phế liệu cao hơn giá bán (160.000 ₫/cái ≈ 11.850 ₫/kg so với 7.500 ₫/kg), lỗ dồn tới lúc bán. Bỏ.
  - *C — giữ giá Chờ sửa, cuối kỳ hạ giá Phế liệu qua phiếu sửa giá trị (#42)*: đúng hơn về kế toán nhưng chờ một chức năng chưa có, và giá BQ sai giữa kỳ. Bỏ.
  - *Phế liệu bằng `ADJUST_OUT`/`ADJUST_IN`*: sai nghĩa và ghi theo giá BQ Phế liệu hiện tại → lệch tổng giá trị. Bỏ.
  - *Hai dòng `REPAIR_OUT` (một cho Tốt, một cho Phế liệu)* hay *loại mới `REPAIR_SCRAP`*: không thêm thông tin, phải sửa sổ kho. Bỏ.

### D2. Tính giá dưới khóa, giữ một thứ tự khóa chung

Giá trị dòng 2, 3 cần B, mà B chỉ chắc sau khi khóa. Cách làm:

1. Service tính các vật tư, vị trí và cặp (mã, tình trạng) phiếu sẽ chạm: mỗi mã {Chờ sửa, Tốt nếu G > 0, Phế liệu nếu S > 0}.
2. Gọi hàm mới `lockForPosting(tx, { itemIds, locationIds, pairs })` trong `src/lib/inventory/post.ts`. Hàm khóa **đúng thứ tự của `postMovements`**: vật tư `FOR SHARE` (sắp theo id) → vị trí `FOR SHARE` (sắp theo id) → `inventory_cost` `FOR UPDATE` (sắp theo mã, tình trạng); trả giá BQ, tồn gộp và thông tin vật tư (mã, đơn vị, trọng lượng chuẩn). `postMovements` dùng lại chính hàm này, nên chỉ có một chỗ quyết định thứ tự khóa.
3. Đọc giá sắt vụn hiện hành bằng `currentScrapPrice(tx)` (bảng chỉ ghi thêm, không cần khóa: dòng mới không đổi dòng cũ; phiếu dùng giá đọc được và lưu lại).
4. Tính giá trị dòng, kiểm bất thường (D6) theo số vừa đọc.
5. Gọi `postMovements` như thường. Nó khóa lại đúng các dòng đó trong cùng transaction (Postgres cho phép chính transaction khóa lại dòng nó đang giữ), nên giá nó dùng cho dòng 1 bằng B đã đọc.

- **Lý do:** không đổi luật hay spec của sổ kho; thứ tự khóa giống hệt mọi chứng từ khác (vật tư → vị trí → giá), nên không thêm khả năng kẹt; giá dùng chắc chắn là giá lúc ghi.
- **Đã cân nhắc:**
  - *Chỉ xuất phần khóa giá (`lockPools`) rồi để `postMovements` khóa vật tư sau* (bản đầu): khóa giá trước vật tư, ngược thứ tự chung. Bỏ (review PR #53).
  - *Gọi `postMovements` hai lần (ra trước, lấy giá, rồi vào)*: lần 1 khóa Chờ sửa, lần 2 khóa Tốt → thứ tự khác các chứng từ khác, có thể kẹt (deadlock). Bỏ.
  - *Thêm vào `MovementDraft` kiểu "giá trị = giá dòng ghép + phần cộng thêm"*: phải sửa spec `inventory-ledger` chỉ cho một chứng từ. Để dành nếu Bản 2 cần.
  - *Đọc giá không khóa rồi ghi*: hai phiếu cùng lúc có thể tính theo giá cũ. Bỏ.

### D3. Phế liệu có chuyển sang kg không (điểm cần chốt 2)

**Không.** Phế liệu vào tình trạng `SCRAP` của **chính mã đó**, đếm theo cái; chỉ **giá** lấy theo kg quy đổi × giá sắt vụn (D1). D12 và thẻ kho hiện kèm kg quy đổi (cái × trọng lượng chuẩn), như D10 đang làm.

- **Lý do:** 0.2 #3 đã chốt phế liệu của mã tính theo cái vẫn đếm theo cái; sổ kho chỉ cho số nguyên cái ở mọi tình trạng; giữ được "phế liệu này là khung 1,7m" cho việc bán, đền bù sau này.
- **Đã cân nhắc:** *đổi sang `PL-SAT` theo kg quy đổi*: phải ghi ra mã này vào mã khác, kg quy đổi không phải kg cân, và trái 0.2 #3. Bỏ. Khi bán phế liệu theo kg, phiếu bán ghi kg cân (cột `weighed_kg` có sẵn).

### D4. Ai lập phiếu (điểm cần chốt 3; người dùng giữ như đề xuất khi review)

Quyền mới `repairs.manage` = **Giám đốc, Kế toán**: lập, sửa, xóa nháp, ghi sổ. Xem dùng `repairs.view` có sẵn (Giám đốc, Kế toán, Kinh doanh). Không cần Giám đốc duyệt.

- **Lý do:**
  - Phiếu ghi tiền (chi phí sửa, lỗ hỏng hàng) và đổi giá vốn: thuộc việc giữ sổ của Kế toán, giống `inventory.adjust`.
  - D12 là màn Desktop; Thủ kho, Xưởng không vào Desktop (`app-shell`).
  - 0.2 #6 chỉ bắt duyệt hợp đồng và đền bù. Chi phí bất thường đã có bước hỏi lại (D6); sai số lượng thì sửa bằng phiếu điều chỉnh.
  - Kinh doanh cần biết hàng Tốt sắp có để bán, thuê: giữ quyền xem như hiện tại (đã thấy giá trị tồn ở D10).
- **Đã cân nhắc:**
  - *Thủ kho lập*: không có màn điện thoại cho việc này ở MVP, và Thủ kho không giữ chi phí. Bỏ.
  - *Xưởng lập hoặc xem*: Xưởng không vào được Desktop, nên quyền xem không dùng được tới khi có M8 (`repair-work-orders`, Bản 2). Thêm cùng M8.
  - *Kế toán lập, Giám đốc duyệt* (như `stock-adjustments`): thêm một bước cho việc diễn ra nhiều lần mỗi tuần, không có trong 0.2 #6. Bỏ.

### D5. Lấy hàng ở đâu, Tốt nhập về đâu

Phiếu có hai trường: **Lấy hàng tại** và **Nhập về**, mỗi trường là bãi hoặc xưởng đang dùng (`YARD`, `WORKSHOP`). Phiếu mới mặc định cả hai là **bãi đang dùng có mã nhỏ nhất** (hiện là `BAI-01`), không ghi cứng mã. Một phiếu một cặp vị trí; mọi dòng dùng chung. Danh sách "Đang chờ sửa tại …" lọc theo vị trí lấy hàng.

- **Lý do:**
  - Hàng Chờ sửa có thể ở bãi hoặc xưởng; không có phiếu chuyển, nên phiếu sửa là chỗ duy nhất ghi được "từ xưởng về bãi" (như dòng mẫu `PSC-2026-021`).
  - Mặc định bãi → bãi khớp D12 ("Đang chờ sửa tại bãi") và quy mô 1 bãi + 1 xưởng; tìm theo loại nên vẫn chạy khi `BAI-01` ngừng dùng hoặc seed khác.
  - Giá BQ không phụ thuộc vị trí (0.2 #24), nên chọn vị trí chỉ ảnh hưởng tồn theo chỗ.
- **Đã cân nhắc:**
  - *Luôn lấy và nhập cùng một chỗ*: không ghi được hàng sửa ở xưởng về bãi. Bỏ.
  - *Vị trí theo từng dòng*: linh hoạt hơn nhưng D12 không có cột này, hiếm dùng. Bỏ.
  - *Cho lấy tại công trình*: hàng ở công trình chưa thu hồi thì không sửa được. Bỏ.

### D6. Chi phí theo mã, chia cho hàng sửa xong, hỏi lại khi cao

- Chi phí nhập **một số cho mỗi dòng** (0.2 #23). Mỗi mã ra **một** dòng `REPAIR_IN` Tốt chứa trọn C + D, nên tổng khớp từng đồng mà **không cần `allocate()`**. `allocate` chỉ cần nếu phải chia một khoản cho nhiều dòng sổ (VD tách Tốt theo nhiều vị trí), D5 đã loại trường hợp đó.
- Giá vào Tốt = `roundHalfUp(G × B + C + D, G)`. Đây cũng là đơn giá `postMovements` ghi cho dòng (`unitCostOf`), nên màn hình và sổ cùng một số. Khối D12 hiện từng phần (C ÷ G, D ÷ G) làm tròn riêng để đọc; số "= Giá vốn khi vào Tốt" luôn lấy từ tổng, không cộng các phần đã làm tròn.
- Dòng có C > 0 mà G = 0 bị từ chối (không có hàng để gánh). C = 0 hợp lệ.
- **Hỏi lại** (theo cách 0.2 #30): hàm thuần `repairAnomalies(lines, goodAvg)` trả câu hỏi cho dòng có `C > goodAvg × G` (so số nguyên, không chia). Chỉ xét chi phí người nhập, không xét D (D do hệ thống tính từ giá sắt vụn, không phải lỗi gõ). Mã chưa có giá BQ Tốt thì bỏ qua. Key `line:<mã hàng>`; client gửi `confirmedOverrides`; server tính lại với giá dưới khóa, thiếu key thì 422 kèm câu hỏi. Phần đã xác nhận lưu ở `repair_order.confirmed_note`.
- **Lý do ngưỡng "vượt giá BQ Tốt":** sửa tốn hơn giá trị một cái hàng Tốt là dấu hiệu gõ thừa số 0 hoặc nhập tổng vào ô của một mã; sổ chỉ ghi thêm và chưa có phiếu sửa giá trị (#42).
- **Đã cân nhắc:** *so với giá BQ Chờ sửa* (hỏi quá nhiều ca sửa bình thường); *ngưỡng phần trăm cố định* (thêm một con số phải chốt). Bỏ.

### D7. Trạng thái, ngày, khóa, chống ghi hai lần

- `DRAFT` → `POSTED`. Nháp lưu trên server (Desktop, không cần IndexedDB).
- **Ngày** (review PR #53): **ngày nghiệp vụ của dòng sổ = ngày ghi sổ** (hôm nay giờ Việt Nam), như `stock-adjustments` dùng ngày duyệt. "Ngày sửa xong" chỉ là thông tin trên phiếu (mặc định hôm nay, không sau hôm nay), không đưa vào sổ.
  - Lý do: hàng Tốt biến động gần như mỗi ngày; nếu dùng ngày sửa xong, luật không ghi lùi của sổ kho chặn gần hết phiếu không ghi sổ ngay trong ngày. Ngày sổ của phiếu sửa không ảnh hưởng tiền thuê (tiền thuê lấy ngày trên phiếu xuất, thu hồi).
  - Đã cân nhắc: *ngày sửa xong làm ngày sổ* (bản đầu): bị chặn như trên. *Cho ghi lùi riêng phiếu sửa*: phá luật "thứ tự ngày = thứ tự tính giá" của sổ kho. Bỏ.
- Lưu nháp: kiểm luật dòng (D9) và ngày sửa xong; **không** kiểm tồn, không cần giá sắt vụn (kiểm lúc ghi sổ, như `stock-adjustments`). Màn hiện số đang chờ sửa để người lập thấy trước.
- Sửa / xóa / ghi sổ: `SELECT … FOR UPDATE` phiếu trước, kiểm `status = DRAFT` và `updatedAt` (sửa, xóa) → lệch thì 409. Ghi sổ lần hai thấy `POSTED` → 409 "Phiếu đã được ghi sổ".
- Ghi sổ, một transaction, thứ tự khóa: phiếu `FOR UPDATE` → `lockForPosting` (vật tư → vị trí → giá, D2) → đọc giá sắt vụn → tính, kiểm bất thường → `postMovements` (khóa lại cùng các dòng, cùng thứ tự) → cập nhật phiếu `POSTED`, `posted_by`, `posted_at`, `posting_id`, `scrap_price_used`, `loss_amount` từng dòng, `confirmed_note`.
- Khóa phiếu đứng đầu vì chỉ lệnh của phiếu sửa chữa khóa bảng này; không chứng từ nào khóa giá rồi mới khóa phiếu sửa.

### D8. Bảng dữ liệu (migration kế tiếp, dự kiến `drizzle/0006_repair_orders.sql`)

`repair_order`:
- `id` uuid PK; `code` text unique (`PSC-2026-024`); `status` text CHECK in (`DRAFT`, `POSTED`).
- `repair_date` date (ngày sửa xong, chỉ thông tin); `repaired_by` text null (≤ 100); `note` text null (≤ 500).
- `from_location_id`, `to_location_id` uuid FK → `location` `ON DELETE RESTRICT`.
- `scrap_price_used` bigint null (₫/kg, có khi phiếu có phế liệu); `confirmed_note` text null; `posting_id` uuid null (nhóm dòng sổ của phiếu).
- `created_by`, `created_at`, `updated_at`, `posted_by` null, `posted_at` null. CHECK: `POSTED` ⇔ có `posted_by`, `posted_at`, `posting_id`; `scrap_price_used` null hoặc > 0.

`repair_order_line`:
- `id` uuid PK; `order_id` FK → `repair_order` `ON DELETE CASCADE` (chỉ nháp mới xóa được); `item_id` FK → `item` `RESTRICT`; `position` int.
- `quantity_taken`, `quantity_good`, `quantity_scrap` numeric(14,3); `repair_cost` bigint; `loss_amount` bigint null (ghi lúc ghi sổ).
- CHECK: `quantity_taken > 0`; `quantity_good >= 0`; `quantity_scrap >= 0`; `quantity_good + quantity_scrap = quantity_taken`; `repair_cost >= 0`; `repair_cost = 0 OR quantity_good > 0`; `loss_amount` null hoặc ≥ 0; `loss_amount = 0 OR quantity_good = 0`. Unique (`order_id`, `item_id`).

**Lưu gì, đọc lại gì:** lưu `scrap_price_used` và `loss_amount` lúc ghi sổ; các số còn lại (B, V, giá trị dòng Tốt, giá BQ sau) đọc lại từ dòng sổ của chứng từ.
- Lý do: giá sắt vụn không có trong sổ kho (chỉ có trong `scrap_price`, đổi theo thời gian), nên phải lưu giá đã dùng, như phiếu nhập. Lỗ hỏng hàng tính lại được từ sổ (giá trị ra − giá trị vào của dòng toàn phế liệu) nhưng cần cho báo cáo lợi nhuận (#19) và đầu phiếu; lưu một số để báo cáo khỏi phải ghép dòng sổ theo mã.
- Đã cân nhắc: *chỉ đọc lại từ sổ*: mất giá sắt vụn đã dùng. *Lưu hết mọi số tính ra*: trùng với sổ, có nguy cơ lệch. Bỏ cả hai.

Trigger chặn sửa/xóa phiếu `POSTED` và dòng của nó (bảo vệ cả khi gõ SQL).

### D9. Logic thuần `src/domain/repair-order.ts`

- `checkRepairLines(lines)`: luật spec (tổng khớp, > 0, số nguyên, không trùng, mã tính theo cái, chi phí ≥ 0 và có hàng sửa xong). Trả lỗi kèm `field` (`lines.<i>.quantityGood`…).
- `scrapValue({ scrap, weightKgMilli, scrapPrice, needsRepairAvg })` = V theo D1 (số nguyên lớn, làm tròn 0,5 lên). Thiếu giá sắt vụn khi S > 0 → lỗi "Chưa có giá sắt vụn tham khảo, nhờ Giám đốc nhập ở Cài đặt" (cùng câu với phiếu nhập). Thiếu trọng lượng chuẩn khi S > 0 → lỗi "<mã> chưa có trọng lượng chuẩn, không tính được giá phế liệu" (lưới an toàn; DB đã bắt mã cái có trọng lượng nên chỉ có unit test).
- `repairPostingLines(lines, pools, items, scrapPrice, from, to)`: ra mảng `MovementDraft` và `loss` từng dòng theo D1.
- `goodUnitCost(B, G, C, D)` và `previewAverage(pool, inQty, amount)` (dùng `averageAfterInflow` có sẵn) cho khối "Giá vốn sau sửa".
- `repairAnomalies(...)`, `repairPostedNote(...)` theo D6.

### D10. API (bọc `withAuth`, kiểm bằng zod)

| Route | Quyền | Việc |
|---|---|---|
| `GET /api/repairs?status=` | `repairs.view` | danh sách |
| `POST /api/repairs` | `repairs.manage` | tạo nháp → 201 `{ code }` |
| `GET /api/repairs/[code]` | `repairs.view` | phiếu + dòng; đã ghi sổ thì kèm số từ sổ kho, giá sắt vụn đã dùng, lỗ hỏng hàng |
| `PUT /api/repairs/[code]` | `repairs.manage` | sửa nháp, kèm `updatedAt` |
| `DELETE /api/repairs/[code]` | `repairs.manage` | xóa nháp |
| `POST /api/repairs/[code]/post` | `repairs.manage` | ghi sổ, body `{ confirmedOverrides: string[] }`; 422 kèm `anomalies` |
| `GET /api/repairs/awaiting?locationId=` | `repairs.view` | hàng Chờ sửa tại vị trí: mã, tên, số, B, trọng lượng chuẩn, giá BQ và tồn Tốt, Phế liệu; kèm giá sắt vụn hiện hành (để xem trước) |

Lỗi nghiệp vụ trả qua `respond.ts` như các module khác, kèm `field`.

### D11. Giao diện

- `/repairs`: bảng danh sách (`DataTable`), lọc trạng thái trên URL, nút "Phiếu mới" khi có `repairs.manage`.
- `/repairs/new` và `/repairs/[code]`: D12. Nhãn "Ngày sửa xong" kèm ghi chú nhỏ "Sổ kho ghi theo ngày ghi sổ". Cột phải "Đang chờ sửa tại <vị trí>" bấm để thêm dòng; dòng đã thêm thì mờ. Khối "Giá vốn sau sửa" tính ở client bằng hàm D9 với số từ `awaiting` (xem trước), ghi chú "Số chính xác tính lúc ghi sổ"; có dòng "+ Phần hỏng gánh thêm", câu phế liệu theo giá sắt vụn, và "Lỗ hỏng hàng" khi cả dòng hỏng. Nút "Ghi sổ kho" mở hộp thoại hỏi lại nếu có bất thường.
- Bản vẽ D12 ghi "195.861 → 196.401" và giá phế liệu theo giá Chờ sửa: số trong spec thắng (README thiết kế: spec thắng); không sửa bản vẽ, ảnh mốc theo số của seed.
- Thanh menu "Sửa chữa" đã có; thay `PlaceholderPage`. Token Bright Blue Base, không mã màu cứng; tiền viết `1.250.000 ₫`.

### D12. Lưu vết theo hướng #47

Rẻ, không làm bảng mới: phiếu có `created_by/at`, `posted_by/at`, `confirmed_note`; dòng sổ có `created_by`. Khi change `activity-log` làm, nó đọc các cột này hoặc gọi hàm ghi nhật ký chung trong cùng transaction ghi sổ. Không thêm `repair_order_event` riêng vì phiếu chỉ có hai bước.

### D13. Dữ liệu mẫu và E2E

- Seed: đẩy bộ đếm `PSC` 2026 lên 021 (dòng mẫu `PSC-2026-021` đã ghi sổ, không có bản ghi phiếu). Thêm nháp `PSC-2026-022` theo D12 (Khung 1,7m 40 → 36/4, 1.980.000 ₫; Chéo 20 → 20/0, 240.000 ₫) nếu seed có đủ Chờ sửa; giá sắt vụn 7.500 ₫/kg seed đã có. Chạy seed hai lần không nhân đôi.
- E2E dùng `E2E-KHO-01/02` (Chờ sửa có từ E2E nhập hàng) và kiểm theo chênh lệch, vì sổ kho không xóa được. Phiếu E2E có ghi chú `E2E thử`; global setup xóa nháp E2E (phiếu đã ghi sổ ở lại).

## Risks / Trade-offs

- [Giá xem trước trên D12 khác giá lúc ghi sổ khi có phiếu khác chen vào hoặc giá sắt vụn đổi] → ghi chú "Số chính xác tính lúc ghi sổ"; phiếu đã ghi sổ hiện số thật từ sổ kho và giá sắt vụn đã dùng.
- [Giá BQ Tốt tăng thêm phần hỏng của hàng phế cùng mã] → đúng ý phương án B (hàng sửa xong gánh hao hụt của lô đem sửa); khối D12 hiện riêng dòng "Phần hỏng gánh thêm" để người lập thấy.
- [Lỗ hỏng hàng làm tổng giá trị sổ giảm] → chỉ khi cả dòng hỏng hết; phiếu lưu `loss_amount`, đầu phiếu hiện tổng; báo cáo lợi nhuận (#19) đọc số này.
- [Giá sắt vụn đổi thì giá BQ Phế liệu pha nhiều mức giá] → chấp nhận, giống phế liệu mua về; giá dùng lưu trên phiếu.
- [Phiếu ghi sai không sửa được] → hỏi lại khi chi phí cao (D6); số lượng sai thì phiếu điều chỉnh; giá trị sai chờ #42.
- [Hàng đang ở xưởng không hiện ở đâu ngoài D10 "Tại xưởng"] → chấp nhận ở MVP; lệnh sửa (Bản 2) theo dõi.
- [`postMovements` đổi sang dùng `lockForPosting`] → chỉ gom code khóa có sẵn vào một hàm, giữ thứ tự; test cũ của `inventory` phải xanh, thêm test thứ tự khóa và đồng thời phiếu sửa + phiếu nhập.
- [Số migration trùng với change merge trước] → lấy số kế tiếp lúc apply, sinh lại bằng `npm run db:generate`.

## Migration Plan

- Migration chỉ thêm bảng, không đụng dữ liệu cũ. Rollback = bỏ hai bảng (`inventory_ledger.document_id` là uuid không có khóa ngoại, nên dòng sổ đã ghi không chặn việc bỏ bảng; nhưng chỉ rollback khi chưa ghi sổ phiếu nào ở môi trường thật).
- Không cần chạy lại `inventory:check` cho dữ liệu cũ; chạy sau E2E và seed.
