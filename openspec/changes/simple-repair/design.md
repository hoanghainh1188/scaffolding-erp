# Design: simple-repair

## Context

- Sổ kho (`inventory-ledger`) đã có loại `REPAIR_OUT` / `REPAIR_IN`; `REPAIR_IN` là loại **đổi giá BQ** (cùng `OPENING`, `PURCHASE_IN`). Mọi dòng ghi qua `postMovements(tx, actor, posting)` trong transaction của chứng từ. Dòng đổi giá phải đưa **tổng giá trị**; dòng khác ghi theo giá BQ hiện tại.
- `postMovements` khóa `inventory_cost` theo (mã, tình trạng) **sắp xếp cố định** rồi mới tính giá. Giá BQ Chờ sửa chỉ biết chắc sau khi khóa.
- Giá BQ gộp mọi vị trí (0.2 #24). Hàng Chờ sửa hiện vào **bãi** (phiếu nhập, sau này thu hồi); xưởng chỉ có hàng qua tồn đầu kỳ hoặc điều chỉnh. Dòng mẫu `PSC-2026-021` trong `src/lib/inventory/sample.ts` ra tại `XUONG-01`, vào Tốt tại `BAI-01`.
- MVP chưa có phiếu chuyển bãi ↔ xưởng. Trang `/repairs` đang là trang chờ, quyền `repairs.view` (Giám đốc, Kế toán, Kinh doanh) đã có. Trang Desktop chặn vai trò Thủ kho, Xưởng (`app-shell`).
- Mẫu đã có để dùng lại: bộ đếm mã `nextDocumentCode` (`src/lib/inventory/counter.ts`), sửa có `updatedAt` → 409 (`purchase-orders`), hỏi lại khi bất thường (`src/domain/receipt-anomalies.ts`, 0.2 #30).

## Goals / Non-Goals

**Goals:**
- Một lệnh "Ghi sổ kho" chuyển tình trạng và cộng chi phí sửa, đúng từng đồng, trong một transaction.
- Giá dùng để tính là giá **lúc ghi sổ** (dưới khóa), không phải giá lúc lập nháp.
- Logic tính (giá vào Tốt, luật dòng, bất thường) là hàm thuần trong `src/domain/`, có unit test.

**Non-Goals:**
- Không theo dõi hàng đang nằm ở xưởng chờ sửa (lệnh sửa, Bản 2).
- Không đổi API công khai hay luật của `postMovements` (spec `inventory-ledger` giữ nguyên).

## Decisions

### D1. Ghi sổ: các dòng nào (điểm cần chốt 1)

Mỗi dòng phiếu (một mã) ghi tối đa 3 dòng sổ, cùng chứng từ `REPAIR` / mã phiếu, theo thứ tự:

| # | Loại | Tình trạng | Vị trí | Số lượng | Giá |
|---|---|---|---|---|---|
| 1 | `REPAIR_OUT` | Chờ sửa | lấy tại | −(sửa xong + phế liệu) | giá BQ Chờ sửa (không đổi giá) |
| 2 | `REPAIR_IN` | Tốt | nhập về | +sửa xong | giá trị = sửa xong × B + chi phí |
| 3 | `REPAIR_IN` | Phế liệu | nhập về | +phế liệu | giá trị = phế liệu × B |

B = giá BQ Chờ sửa của mã, đọc dưới khóa trong transaction ghi sổ. Dòng 2 hoặc 3 có số 0 thì bỏ (sổ chặn dòng 0).

Ví dụ D12: `GG-K17` B = 160.000, lấy 40, Tốt 36, phế 4, chi phí 1.980.000 → −40 × 160.000 = −6.400.000; +7.740.000; +640.000. Chênh lệch giá trị = +1.980.000 = đúng chi phí.

- **Lý do:**
  - Giá trị ra khỏi Chờ sửa (n × B) đi trọn sang Tốt + Phế liệu, cộng chi phí. Tổng giá trị sổ chỉ tăng đúng bằng chi phí sửa; không mất, không đẻ tiền.
  - Phế liệu dùng `REPAIR_IN` (đổi giá): hàng vào Phế liệu mang **giá Chờ sửa** (0.2 #23), pha vào giá BQ Phế liệu. Nếu dùng loại không đổi giá thì 4 cái sẽ ghi theo giá BQ Phế liệu hiện tại, phần chênh với giá Chờ sửa biến mất khỏi sổ.
  - Một dòng `REPAIR_OUT` cho cả số lấy ra (không tách 2 dòng ra): thẻ kho Chờ sửa gọn, cùng một giá B.
- **Đã cân nhắc:**
  - *Phế liệu bằng `ADJUST_OUT`/`ADJUST_IN`*: sai nghĩa (không phải sửa sai), và ghi theo giá BQ Phế liệu → lệch tổng giá trị. Bỏ.
  - *Hai dòng `REPAIR_OUT` (một cho Tốt, một cho Phế liệu)*: không thêm thông tin, thẻ kho dài hơn. Bỏ.
  - *Thêm loại `REPAIR_SCRAP`*: phải sửa spec và CHECK của sổ kho mà không thêm gì so với `REPAIR_IN` + tình trạng `SCRAP`. Bỏ.

### D2. Tính giá dưới khóa: xuất hàm khóa giá từ `post.ts`

Giá trị dòng 2, 3 cần B, mà B chỉ chắc sau khi khóa. Cách làm:

1. Service tính danh sách (mã, tình trạng) mà phiếu sẽ chạm: với mỗi mã {Chờ sửa, Tốt, Phế liệu nếu có}.
2. Gọi hàm mới `lockCostPools(tx, pairs)` trong `src/lib/inventory/post.ts` (chính là `lockPools` hiện có, xuất ra, trả `avgCost` và tồn gộp). Hàm khóa theo **cùng thứ tự sắp xếp** như `postMovements`.
3. Tính giá trị dòng và kiểm bất thường (D6) theo số vừa đọc.
4. Gọi `postMovements` như thường. Nó khóa lại đúng các dòng đó trong cùng transaction (khóa dòng của Postgres cho phép chính transaction khóa lại), nên giá nó dùng cho dòng 1 bằng B đã đọc.

- **Lý do:** không đổi luật hay spec của sổ kho; thứ tự khóa không đổi nên không thêm nguy cơ kẹt; giá dùng chắc chắn là giá lúc ghi.
- **Đã cân nhắc:**
  - *Gọi `postMovements` hai lần (ra trước, lấy giá, rồi vào)*: lần 1 khóa Chờ sửa, lần 2 khóa Tốt → thứ tự khóa khác các chứng từ khác (Tốt trước Chờ sửa), có thể kẹt (deadlock). Bỏ.
  - *Thêm vào `MovementDraft` kiểu "giá trị = giá dòng ghép + phần cộng thêm"*: gọn một lần gọi, nhưng phải sửa spec `inventory-ledger` (người ghi không còn đưa tổng giá trị) chỉ cho một chứng từ. Để dành nếu Bản 2 cần.
  - *Đọc giá không khóa rồi ghi*: hai phiếu cùng lúc có thể tính theo giá cũ. Bỏ.

### D3. Phế liệu có chuyển sang kg không (điểm cần chốt 2)

**Không.** Phế liệu vào tình trạng `SCRAP` của **chính mã đó**, đếm theo cái. D12 và thẻ kho hiện kèm kg quy đổi (cái × trọng lượng chuẩn), như D10 đang làm.

- **Lý do:** 0.2 #3 đã chốt phế liệu của mã tính theo cái vẫn đếm theo cái; sổ kho chỉ cho số nguyên cái ở mọi tình trạng; giữ được "phế liệu này là khung 1,7m" cho việc bán, đền bù sau này.
- **Đã cân nhắc:** *đổi sang `PL-SAT` theo kg quy đổi*: phải ghi ra mã này vào mã khác (chuyển giá trị giữa hai mã), kg quy đổi không phải kg cân, và trái 0.2 #3. Bỏ. Khi bán phế liệu theo kg, phiếu bán ghi kg cân (cột `weighed_kg` có sẵn).

### D4. Ai lập phiếu (điểm cần chốt 3)

Quyền mới `repairs.manage` = **Giám đốc, Kế toán**: lập, sửa, xóa nháp, ghi sổ. Xem dùng `repairs.view` có sẵn (Giám đốc, Kế toán, Kinh doanh). Không cần Giám đốc duyệt.

- **Lý do:**
  - Phiếu ghi tiền (chi phí sửa) và đổi giá vốn: thuộc việc giữ sổ của Kế toán, giống `inventory.adjust`.
  - D12 là màn Desktop; Thủ kho, Xưởng không vào Desktop (`app-shell`).
  - 0.2 #6 chỉ bắt duyệt hợp đồng và đền bù. Chi phí bất thường đã có bước hỏi lại (D6); sai thì sửa bằng phiếu điều chỉnh.
  - Kinh doanh cần biết hàng Tốt sắp có để bán, thuê: giữ quyền xem như hiện tại (đã thấy giá trị tồn ở D10).
- **Đã cân nhắc:**
  - *Thủ kho lập*: không có màn điện thoại cho việc này ở MVP, và Thủ kho không giữ chi phí. Bỏ.
  - *Xưởng lập hoặc xem* (gợi ý ban đầu "Xưởng xem được"): Xưởng không vào được Desktop, nên quyền xem không dùng được tới khi có M8 (`repair-work-orders`, Bản 2). Không thêm bây giờ; thêm cùng M8.
  - *Kế toán lập, Giám đốc duyệt* (như `stock-adjustments`): thêm một bước cho việc diễn ra nhiều lần mỗi tuần, không có trong 0.2 #6. Bỏ; người dùng có thể chốt khác khi duyệt.

### D5. Lấy hàng ở đâu, Tốt nhập về đâu

Phiếu có hai trường: **Lấy hàng tại** và **Nhập về**, mỗi trường là bãi hoặc xưởng đang dùng (`YARD`, `WORKSHOP`), mặc định `BAI-01`. Một phiếu một cặp vị trí; mọi dòng dùng chung. Danh sách "Đang chờ sửa tại …" lọc theo vị trí lấy hàng.

- **Lý do:**
  - Hàng Chờ sửa có thể ở bãi hoặc xưởng; không có phiếu chuyển, nên phiếu sửa là chỗ duy nhất ghi được "từ xưởng về bãi" (như dòng mẫu `PSC-2026-021`).
  - Mặc định bãi → bãi khớp D12 ("Đang chờ sửa tại bãi") và quy mô 1 bãi + 1 xưởng; đa số phiếu không phải chọn gì.
  - Giá BQ không phụ thuộc vị trí (0.2 #24), nên chọn vị trí chỉ ảnh hưởng tồn theo chỗ.
- **Đã cân nhắc:**
  - *Luôn lấy và nhập cùng một chỗ*: không ghi được hàng sửa ở xưởng về bãi. Bỏ.
  - *Vị trí theo từng dòng*: linh hoạt hơn nhưng D12 không có cột này, hiếm dùng. Bỏ.
  - *Cho lấy tại công trình*: hàng ở công trình chưa thu hồi thì không sửa được. Bỏ.

### D6. Chi phí theo mã, chia cho hàng sửa xong, hỏi lại khi cao

- Chi phí nhập **một số cho mỗi dòng** (0.2 #23). Mỗi mã ra **một** dòng `REPAIR_IN` Tốt chứa trọn chi phí, nên tổng khớp từng đồng mà **không cần `allocate()`**. `allocate` chỉ cần nếu phải chia một khoản cho nhiều dòng sổ (VD tách Tốt theo nhiều vị trí), D5 đã loại trường hợp đó.
- Giá vào Tốt hiển thị = `roundHalfUp(sửa xong × B + chi phí, sửa xong)` (= B + chi phí ÷ sửa xong, làm tròn 1 ₫). Đây cũng là đơn giá `postMovements` ghi cho dòng (`unitCostOf`), nên màn hình và sổ cùng một số.
- Dòng có chi phí > 0 mà sửa xong = 0 bị từ chối (không có hàng để gánh). Chi phí 0 hợp lệ.
- **Hỏi lại** (theo cách 0.2 #30): hàm thuần `repairAnomalies(lines, goodAvg)` trả câu hỏi cho dòng có `chi phí > goodAvg × sửa xong` (so số nguyên, không chia). Mã chưa có giá BQ Tốt thì bỏ qua. Key `line:<mã hàng>`; client gửi `confirmedOverrides`; server tính lại với giá dưới khóa, thiếu key thì 422 kèm câu hỏi. Phần đã xác nhận lưu ở `repair_order.confirmed_note`.
- **Lý do ngưỡng "vượt giá BQ Tốt":** sửa tốn hơn giá trị một cái hàng Tốt là dấu hiệu gõ thừa số 0 hoặc nhập tổng vào ô của một mã; sổ chỉ ghi thêm và chưa có phiếu sửa giá trị (#42).
- **Đã cân nhắc:** *so với giá BQ Chờ sửa* (bắt nhiều ca sửa bình thường đắt hơn giá hàng hỏng, hỏi quá nhiều); *ngưỡng phần trăm cố định* (thêm một con số phải chốt). Bỏ.

### D7. Trạng thái, khóa, chống ghi hai lần

- `DRAFT` → `POSTED`. Nháp lưu trên server (Desktop, không cần IndexedDB).
- Lưu nháp: kiểm luật dòng (D9); **không** kiểm tồn (tồn kiểm lúc ghi sổ, như `stock-adjustments`). Màn hiện số đang chờ sửa để người lập thấy trước.
- Sửa / xóa / ghi sổ: `SELECT … FOR UPDATE` phiếu trước, kiểm `status = DRAFT` và `updatedAt` (sửa, xóa) → lệch thì 409. Ghi sổ lần hai thấy `POSTED` → 409 "Phiếu đã được ghi sổ".
- Ghi sổ trong một transaction: khóa phiếu → khóa vật tư/vị trí (do `postMovements`) → `lockCostPools` (D2) → tính, kiểm bất thường → `postMovements` → cập nhật phiếu `POSTED`, `posted_by`, `posted_at`, `posting_id`, `confirmed_note`.
- Ngày nghiệp vụ = ngày sửa xong; luật không sau hôm nay, không ghi lùi là của `postMovements`.

### D8. Bảng dữ liệu (migration `drizzle/0006_repair_orders.sql`)

`repair_order`:
- `id` uuid PK; `code` text unique (`PSC-2026-024`); `status` text CHECK in (`DRAFT`, `POSTED`).
- `repair_date` date (ngày sửa xong); `repaired_by` text null (≤ 100); `note` text null (≤ 500).
- `from_location_id`, `to_location_id` uuid FK → `location` `ON DELETE RESTRICT`.
- `confirmed_note` text null; `posting_id` uuid null (nhóm dòng sổ của phiếu).
- `created_by`, `created_at`, `updated_at`, `posted_by` null, `posted_at` null. CHECK: `POSTED` ⇔ có `posted_by`, `posted_at`, `posting_id`.

`repair_order_line`:
- `id` uuid PK; `order_id` FK → `repair_order` `ON DELETE CASCADE` (chỉ nháp mới xóa được); `item_id` FK → `item` `RESTRICT`; `position` int.
- `quantity_taken`, `quantity_good`, `quantity_scrap` numeric(14,3); `repair_cost` bigint.
- CHECK: `quantity_taken > 0`; `quantity_good >= 0`; `quantity_scrap >= 0`; `quantity_good + quantity_scrap = quantity_taken`; `repair_cost >= 0`; `repair_cost = 0 OR quantity_good > 0`. Unique (`order_id`, `item_id`).

Không lưu giá Chờ sửa hay giá vào Tốt trên phiếu: phiếu đã ghi sổ đọc số từ các dòng sổ của chứng từ (cùng nguyên tắc phiếu nhập: "không lưu tiền trên phiếu" trừ số người dùng nhập). Trigger chặn sửa/xóa phiếu `POSTED` và dòng của nó (bảo vệ cả khi gõ SQL).

### D9. Logic thuần `src/domain/repair-order.ts`

- `checkRepairLines(lines)`: luật spec (tổng khớp, > 0, số nguyên, không trùng, mã tính theo cái, chi phí ≥ 0 và có hàng sửa xong). Trả lỗi kèm `field` (`lines.<i>.quantityGood`…).
- `repairPostingLines(lines, pools, from, to)`: ra mảng `MovementDraft` theo D1.
- `goodUnitCost(B, good, cost)` và `previewAverage(pool, inQty, amount)` (dùng `averageAfterInflow` có sẵn) cho khối "Giá vốn sau sửa".
- `repairAnomalies(...)`, `repairPostedNote(...)` theo D6.

### D10. API (bọc `withAuth`, kiểm bằng zod)

| Route | Quyền | Việc |
|---|---|---|
| `GET /api/repairs?status=` | `repairs.view` | danh sách |
| `POST /api/repairs` | `repairs.manage` | tạo nháp → 201 `{ code }` |
| `GET /api/repairs/[code]` | `repairs.view` | phiếu + dòng; đã ghi sổ thì kèm số từ sổ kho |
| `PUT /api/repairs/[code]` | `repairs.manage` | sửa nháp, kèm `updatedAt` |
| `DELETE /api/repairs/[code]` | `repairs.manage` | xóa nháp |
| `POST /api/repairs/[code]/post` | `repairs.manage` | ghi sổ, body `{ confirmedOverrides: string[] }`; 422 kèm `anomalies` |
| `GET /api/repairs/awaiting?locationId=` | `repairs.view` | hàng Chờ sửa tại vị trí: mã, tên, số, giá BQ Chờ sửa, giá BQ và tồn Tốt (để xem trước) |

Lỗi nghiệp vụ trả qua `respond.ts` như các module khác, kèm `field`.

### D11. Giao diện

- `/repairs`: bảng danh sách (`DataTable`), lọc trạng thái trên URL, nút "Phiếu mới" khi có `repairs.manage`.
- `/repairs/new` và `/repairs/[code]`: D12. Cột phải "Đang chờ sửa tại <vị trí>" bấm để thêm dòng; dòng đã thêm thì mờ. Khối "Giá vốn sau sửa" tính ở client bằng hàm D9 với số từ `awaiting` (xem trước), ghi chú nhỏ "Số chính xác tính lúc ghi sổ". Nút "Ghi sổ kho" mở hộp thoại hỏi lại nếu có bất thường.
- Thanh menu "Sửa chữa" đã có; thay `PlaceholderPage`. Token Bright Blue Base, không mã màu cứng; tiền viết `1.250.000 ₫`.

### D12. Lưu vết theo hướng #47

Rẻ, không làm bảng mới: phiếu có `created_by/at`, `posted_by/at`, `confirmed_note`; dòng sổ có `created_by`. Khi change `activity-log` làm, nó đọc các cột này hoặc gọi hàm ghi nhật ký chung trong cùng transaction ghi sổ. Không thêm `repair_order_event` riêng vì phiếu chỉ có hai bước.

### D13. Dữ liệu mẫu và E2E

- Seed: đẩy bộ đếm `PSC` 2026 lên 021 (dòng mẫu `PSC-2026-021` đã ghi sổ, không có bản ghi phiếu). Thêm nháp `PSC-2026-022` theo D12 (Khung 1,7m 40 → 36/4, 1.980.000 ₫; Chéo 20 → 20/0, 240.000 ₫) nếu seed có đủ Chờ sửa; chạy seed hai lần không nhân đôi.
- E2E dùng `E2E-KHO-01/02` (Chờ sửa có từ E2E nhập hàng) và kiểm theo chênh lệch, vì sổ kho không xóa được. Phiếu E2E có ghi chú `E2E thử`; global setup xóa nháp E2E (phiếu đã ghi sổ ở lại).

## Risks / Trade-offs

- [Giá xem trước trên D12 khác giá lúc ghi sổ khi có phiếu khác chen vào] → ghi chú "Số chính xác tính lúc ghi sổ"; phiếu đã ghi sổ hiện số thật từ sổ kho.
- [Phiếu ghi sai không sửa được] → hỏi lại khi chi phí cao (D6); số lượng sai thì phiếu điều chỉnh; giá trị sai chờ #42.
- [Hàng đang ở xưởng không hiện ở đâu ngoài D10 "Tại xưởng"] → chấp nhận ở MVP; lệnh sửa (Bản 2) theo dõi.
- [Xuất `lockCostPools` cho module khác dùng] → chỉ đọc và khóa, giữ thứ tự sắp xếp chung; có test đồng thời phiếu sửa + phiếu nhập.
- [Số migration trùng với change đang làm song song (`returns-and-compensation`)] → lấy số kế tiếp lúc apply, sinh lại bằng `npm run db:generate` nếu `main` đã có 0006.

## Migration Plan

- Migration chỉ thêm bảng, không đụng dữ liệu cũ; rollback = bỏ hai bảng (`inventory_ledger.document_id` là uuid không có khóa ngoại, nên dòng sổ đã ghi không chặn việc bỏ bảng; nhưng chỉ rollback khi chưa ghi sổ phiếu nào ở môi trường thật).
- Không cần chạy lại `inventory:check` cho dữ liệu cũ; chạy sau E2E và seed.
