# Design: purchase-orders

## Context

- Đã có các phần change này dùng lại:
  - danh mục vật tư và nhà cung cấp (`master-data`);
  - sổ kho, giá vốn bình quân và `postMovements` (`inventory-ledger`);
  - bộ đếm chứng từ `document_counter` + `nextDocumentCode` (`src/lib/inventory/counter.ts`);
  - quyền `purchasing.view` (Giám đốc, Kế toán, Kinh doanh); trang `/purchasing` hiện vẫn là trang giữ chỗ.
- `domain-values` chỉ cho lưu 4 trạng thái chứng từ: `DRAFT`, `PENDING_APPROVAL`, `IN_PROGRESS`, `DONE`.
- Vật tư `PIECE` luôn có trọng lượng chuẩn > 0 (CHECK `item_weight_check`). Vật tư `KG` không có trọng lượng chuẩn.
- Quyết định 0.2 dùng ở đây:
  - Đơn chỉ là dự kiến; tiền trả và giá vốn tính theo số thực nhận (#13).
  - Lô hàng cũ: Phế liệu theo giá sắt vụn tham khảo, phần còn lại chia cho Tốt và Chờ sửa theo số cái (#27).
  - Một đơn có nhiều phiếu nhập (#14); nhận thiếu thì mặc định đóng đơn (#12).
  - Chi phí chuyến nào chia vào hàng của chuyến đó, theo cách chia ghi trên đơn (#25).
  - Chi phí mua hàng không cộng vào tiền trả người bán (#26).
- Bản vẽ D3b đã có cả phần nhận hàng. Phần này cần bảng phiếu nhập của `goods-receipt` (#8), nên ở change này chỉ để trống.

## Goals / Non-Goals

**Goals:**
- Đơn thu mua lưu đủ thông tin để `goods-receipt` nhận hàng mà không phải sửa lại bảng đơn.
- Một hàm chia chi phí thuần, có test, dùng chung cho xem trước (D3) và giá vốn thật (`goods-receipt`).
- Luật chuyển trạng thái nằm ở một chỗ, có test cả cho các lệnh mà `goods-receipt` sẽ gọi.

**Non-Goals:**
- Không ghi sổ kho, không tính tiền phải trả người bán thật.
- Không có màn Mobile.
- Không duyệt đơn.

## Decisions

### D1. Đơn không chạm sổ kho

- Đơn thu mua chỉ là kế hoạch. Mọi bảng của change này nằm ngoài sổ kho.
- Service `src/lib/purchasing/` **không import** `postMovements`. Integration test kiểm rằng sau mọi lệnh, số dòng `inventory_ledger` và nội dung `inventory_cost` không đổi.
- Giá nhập ở D3 tính ở trình duyệt bằng hàm thuần (D3 dưới đây) và **không lưu**. Nếu lưu, đó sẽ là "số cộng dồn" thứ hai có thể lệch với sổ kho, trái quy tắc trong CLAUDE.md.

### D2. Trạng thái: 3 trạng thái lưu + kết quả + nhãn tính ra

Lưu trong DB:
- `status` ∈ `DRAFT`, `IN_PROGRESS`, `DONE` (bộ của `domain-values`, không có `PENDING_APPROVAL` vì đơn không cần duyệt);
- `outcome` ∈ `RECEIVED`, `CLOSED`, `CANCELLED`, chỉ có khi `status = DONE`.

Nhãn hiển thị:
- `IN_PROGRESS` + chưa có phiếu nhập = "Chờ xe về";
- `IN_PROGRESS` + đã có phiếu nhập = "Đang nhận";
- `DONE` = "Hoàn thành · Đã nhận đủ / Đã đóng / Đã hủy".

Các tên trạng thái trong issue khớp như sau:

| Issue | Trong change này |
|---|---|
| Nháp | `DRAFT` |
| Đã đặt | `IN_PROGRESS` chưa có phiếu nhập, nhãn "Chờ xe về" như D2 |
| Đang nhận | `IN_PROGRESS` đã có phiếu nhập |
| Đã nhận đủ | `DONE` + `RECEIVED` |
| Đã đóng | `DONE` + `CLOSED` |
| (thêm) Đã hủy | `DONE` + `CANCELLED` |

Bản vẽ D2 cũng dùng đúng kiểu này: badge "Đang xử lý" kèm chữ phụ "Chờ xe về", "Thủ kho đang đếm", "chờ giao bù 40 mâm".

**Luật chuyển** nằm ở một chỗ, `src/domain/purchase-order.ts`:
- Hàm thuần `transition(order, command)`, với `order` gồm `{ status, outcome, hasReceipts, lineCount, expectedDate }`.
- Trả về trạng thái mới, hoặc ném `DomainValueError` kèm thông báo đúng spec.
- Có 6 lệnh:

| Lệnh | Ai gọi | Kết quả |
|---|---|---|
| `PLACE` | Kinh doanh, Giám đốc | `IN_PROGRESS` |
| `CANCEL` | Kinh doanh, Giám đốc | `DONE` + `CANCELLED` (chỉ khi chưa có phiếu nhập, phải có lý do) |
| `CLOSE` | Kinh doanh, Giám đốc | `DONE` + `CLOSED` (chỉ khi đã có phiếu nhập) |
| `RECEIVE_FULL` | `goods-receipt` | `DONE` + `RECEIVED` |
| `RECEIVE_SHORT` | `goods-receipt` | `DONE` + `CLOSED` |
| `RECEIVE_SHORT_WAIT` | `goods-receipt` | giữ `IN_PROGRESS` |

Change này test đủ cả 6 lệnh. `goods-receipt` chỉ cần gọi.

Lựa chọn đã cân nhắc:
- **Thêm trạng thái lưu `ORDERED`, `RECEIVING`, `CANCELLED`.** Không chọn. Phải sửa `domain-values`, và "đang nhận" là sự thật suy ra từ việc có phiếu nhập; lưu riêng thì có thể lệch.
- **Hủy = xóa đơn.** Không chọn. Đơn đã đặt có thể đã báo cho kho và người bán; giữ lại mã, lý do và lịch sử thì tra cứu được. Chỉ đơn nháp mới xóa hẳn.

Ai làm gì:
- Kinh doanh và Giám đốc (`purchasing.manage`): tạo, sửa, đặt, hủy, đóng, xóa nháp.
- Kế toán: chỉ xem (Kế toán là người trả tiền người bán, cần xem nhưng không đặt hàng).
- Thủ kho: các lệnh `RECEIVE_*` qua phiếu nhập ở `goods-receipt`, không gọi trực tiếp.

### D3. Chia chi phí: phần dư lớn nhất, `bigint`, 3 kiểu cơ sở chia

Module `src/domain/landed-cost.ts` (thuần, không đọc DB):

```ts
type AllocationBasis = "VALUE" | "WEIGHT" | "QUANTITY";
interface AllocationLine { amount: Money; weightKgMilli: number; quantityMilli: number }
allocate(total: Money, lines: readonly AllocationLine[], basis: AllocationBasis): Money[]
lineWeightKgMilli(unit: "PIECE" | "KG", quantityMilli: number, standardWeightKg: string | null): number
landedUnitCost(amount: Money, allocated: Money, quantityMilli: number): Money  // dùng unitCostOf có sẵn
```

Các cơ sở chia:
- `VALUE`: chia theo thành tiền.
- `WEIGHT`: chia theo số kg.
  - Dòng đặt theo cái: số cái × trọng lượng chuẩn.
  - Dòng đặt theo kg: số kg.
  - Mọi số tính bằng phần nghìn kg, kiểu `bigint`.
- `QUANTITY`: chia theo số lượng. Không phải cách người dùng chọn. Dùng để chia phần giá của Tốt và Chờ sửa trong một dòng (D5).

Làm tròn khớp tổng:
1. Tính phần chính xác của mỗi dòng: `total × basis_i / Σbasis`, bằng `bigint`.
2. Mỗi dòng nhận phần nguyên (`floor`).
3. Số đồng còn dư (luôn < số dòng) chia mỗi lần 1 ₫ cho dòng có phần dư lớn nhất trước. Hai phần dư bằng nhau thì dòng đứng trước nhận trước.

Đây là cách chia phần dư lớn nhất (largest remainder). Kết quả: tổng luôn khớp; không dòng nào lệch quá 1 ₫ so với phần chính xác; kết quả không phụ thuộc thứ tự dòng, trừ khi hai phần dư bằng nhau.

Lỗi:
- `total = 0`: mọi dòng nhận 0.
- `Σbasis = 0` mà `total > 0`:
  - cách `VALUE`: "Tiền hàng bằng 0 nên không chia chi phí theo giá trị được, chọn chia theo trọng lượng";
  - cách khác, hoặc không có dòng nào số lượng > 0: "Không có hàng để chia chi phí".
- Số âm: lỗi lập trình, ném `RangeError`.

Lựa chọn đã cân nhắc:
- **Làm tròn từng dòng nửa lên.** Không chọn. Tổng có thể lệch 1–2 ₫ so với tiền thật trả nhà xe, và giá trị ghi sổ kho sẽ không bằng tiền chi ra.
- **Dòng cuối nhận phần lệch.** Số mẫu trên bản vẽ D3 làm theo cách này. Không chọn: kết quả đổi khi đổi thứ tự dòng, và dòng cuối có thể lệch nhiều hơn 1 ₫.

**Ví dụ tính tay** (số dự kiến của bản vẽ D3, tổng chi phí 4.880.000 ₫). Bảng này là bảng mong đợi của unit test.

| Dòng | Số lượng | Đơn giá | Thành tiền | Kg | Theo giá trị: chính xác → chia | Giá nhập | Theo trọng lượng: chia | Giá nhập |
|---|---|---|---|---|---|---|---|---|
| Khung 1,7m (13,5 kg) | 200 cái | 185.000 | 37.000.000 | 2.700 | 2.231.098,34 → **2.231.098** | 196.155 | **1.960.568** | 194.803 |
| Chéo (2,8 kg) | 400 cái | 32.000 | 12.800.000 | 1.120 | 771.839,43 → **771.840** | 33.930 | **813.273** | 34.033 |
| Mâm 1,6m (11 kg) | 150 cái | 145.000 | 21.750.000 | 1.650 | 1.311.524,03 → **1.311.524** | 153.743 | **1.198.125** | 152.988 |
| Phế liệu sắt lẫn | 1.250,5 kg | 7.500 | 9.378.750 | 1.250,5 | 565.538,20 → **565.538** | 7.952 /kg | **908.034** | 8.226 /kg |
| **Cộng** | | | **80.928.750** | 6.720,5 | **4.880.000** | | **4.880.000** | |

- Theo giá trị: tổng các phần nguyên là 4.879.999 ₫. 1 ₫ dư về Chéo (phần lẻ 0,43 lớn nhất).
- Bản vẽ D3 ghi Chéo 771.839 và Phế liệu 565.539, lệch 1 ₫ ở hai dòng này. **Spec thắng.** Giá nhập một đơn vị vẫn khớp bản vẽ.
- Theo trọng lượng: phần chính xác lần lượt là 1.960.568,41 / 813.272,82 / 1.198.125,14 / 908.033,63. Tổng phần nguyên 4.879.998 ₫; 2 ₫ dư về Chéo (0,82) và Phế liệu (0,63).
- Dòng Mâm theo trọng lượng: 22.948.125 ÷ 150 = 152.987,5, làm tròn lên 152.988 (ca đúng nửa của 0.2 #10).

### D4. Đơn vị đặt: dòng có `unit` riêng, kho luôn theo đơn vị của mã

- Mỗi dòng có `unit` (`PIECE` | `KG`). Số lượng và đơn giá tính theo đơn vị đó.
- Mã `KG` chỉ có dòng `KG`. Mã `PIECE` có dòng `PIECE` hoặc `KG`. Service kiểm trong transaction đang khóa vật tư (`FOR SHARE`).
- Dòng `PIECE` phải có số lượng nguyên, giống luật của sổ kho.
- Dòng `KG` của mã `PIECE` (mua khung theo cân): số cái dự kiến = `floor(kg ÷ trọng lượng chuẩn)`, chỉ để hiển thị.

**Ràng buộc cho `goods-receipt`** (ghi ở đây để hai change khớp nhau):
- Tồn kho luôn ghi theo đơn vị của mã:
  - mã `PIECE` nhập theo số cái đếm được, kể cả khi đặt theo kg;
  - mã `KG` nhập theo kg cân.
- Tiền hàng thực nhận của dòng:
  - dòng `PIECE`: số cái thực nhận × đơn giá;
  - dòng `KG`: số kg cân thực tế × đơn giá. Dòng `KG` của mã `PIECE` vì thế cần nhập cả số cái đếm và số kg cân.
- Cơ sở `WEIGHT` của chuyến:
  - dòng `PIECE`: số cái thực nhận × trọng lượng chuẩn;
  - dòng `KG`: số kg cân.

Lựa chọn đã cân nhắc:
- **Quy kg ra cái ngay khi đặt** (lưu số cái). Không chọn. Mua theo cân thì người bán tính tiền theo kg (#13); lưu số cái sẽ mất số kg đã thỏa thuận.
- **Cho đổi đơn vị của mã theo đơn.** Không chọn. Tồn kho phải cùng một đơn vị thì giá BQ mới đúng.

### D5. Lô hàng cũ chưa phân loại: Phế liệu theo giá sắt vụn, phần còn lại chia đều theo cái

Quyết định của người dùng khi review PR #36, chốt 27/10/2026 (ghi thành 0.2 #27).

- Đơn `USED` ghi một dòng cho mỗi mã, **không ghi tình trạng**. Thủ kho tách Tốt / Chờ sửa / Phế liệu khi xe về.
- Giá chia trên **tổng tiền dòng của chuyến** T = tiền hàng thực nhận + chi phí phân bổ:
  1. **Phế liệu** lấy giá trị S = kg quy đổi × giá sắt vụn tham khảo (₫/kg).
     - Kg quy đổi = `piecesToKg` (số cái × trọng lượng chuẩn). Mã tính theo kg thì lấy số kg.
     - S làm tròn đến 1 ₫, 0,5 làm tròn lên (`lineAmount`).
  2. **Tốt và Chờ sửa** chia phần còn lại T − S theo số cái, bằng `allocate(…, "QUANTITY")`, để tổng khớp đến từng đồng. Hai tình trạng này có cùng giá một cái.
  3. **Trường hợp biên:**
     - S > T: Phế liệu nhận đúng T, Tốt và Chờ sửa nhận 0 ₫.
     - Cả lô là phế liệu (Tốt + Chờ sửa = 0): Phế liệu nhận toàn bộ T, kể cả khi S < T.
     - Không có phế liệu: không cần giá sắt vụn, cả T chia cho Tốt và Chờ sửa.
  - Mỗi tình trạng thành một dòng `PURCHASE_IN` với `amount` đúng số đã chia. Sổ kho nhận tổng tiền, không nhận đơn giá nhân lại (spec `landed-cost`).
- Đơn `NEW` nhập thẳng vào tình trạng Mới, không chia.

Hàm thuần trong `src/domain/landed-cost.ts`:

```ts
splitLotByCondition(input: {
  total: Money;                 // T
  unit: "PIECE" | "KG";         // đơn vị của mã
  standardWeightKg: string | null;
  goodMilli: number; repairMilli: number; scrapMilli: number;
  scrapPricePerKg: Money | null; // bắt buộc khi scrapMilli > 0 và còn Tốt/Chờ sửa
}): { GOOD: Money; NEEDS_REPAIR: Money; SCRAP: Money }
```

Thiếu giá sắt vụn khi cần dùng thì báo "Chưa có giá sắt vụn tham khảo, nhờ Giám đốc nhập ở Cài đặt".

**Ví dụ tính tay** (là bảng mong đợi của unit test). Dòng Khung 1,7m của D3: T = 39.231.098 ₫ cho 200 cái, trọng lượng chuẩn 13,5 kg, giá sắt vụn 7.500 ₫/kg.

| Tình trạng | Số cái | Cách tính | Giá trị | Giá một cái |
|---|---|---|---|---|
| Phế liệu | 12 | 12 × 13,5 = 162 kg × 7.500 | **1.215.000** | 101.250 |
| Tốt | 150 | (39.231.098 − 1.215.000) × 150 / 188 = 30.331.993,09 | **30.331.993** | 202.213 |
| Chờ sửa | 38 | 38.016.098 × 38 / 188 = 7.684.104,91 → nhận 1 ₫ dư | **7.684.105** | 202.213 |
| **Cộng** | 200 | | **39.231.098** | |

Các ca biên (cũng là unit test):
- 10 khung, T = 800.000 ₫, tách 2 Tốt / 8 Phế liệu: S = 8 × 13,5 × 7.500 = 810.000 > T, nên Phế liệu 800.000 ₫ và Tốt 0 ₫.
- 12 khung, T = 2.000.000 ₫, cả 12 là Phế liệu (S = 1.215.000 < T): Phế liệu nhận 2.000.000 ₫.
- 200 khung, không có Phế liệu, không có giá sắt vụn: 150 Tốt / 50 Chờ sửa chia T theo cái.
- Giá có 0,5 ₫: 1 khung × 13,5 kg × 7.333 ₫/kg = 98.995,5 → S = 98.996 ₫.

Lý do:
- Phế liệu chỉ bán được theo giá sắt vụn. Cho nó gánh giá như hàng Tốt thì giá trị kho bị thổi lên, và lỗ chỉ lộ ra lúc bán.
- Tốt và Chờ sửa vẫn chia đều theo cái: người bán định giá cả lô, không có căn cứ khách quan để nói khung Chờ sửa đáng bao nhiêu phần của khung Tốt. Hàng Chờ sửa được cộng chi phí sửa khi về Tốt (#23).

**Ràng buộc cho `goods-receipt` (#8):**
- Thêm chỗ lưu **giá sắt vụn tham khảo** (₫/kg) và màn để Giám đốc nhập.
- Giá dùng là giá có hiệu lực lúc ghi sổ phiếu nhập. Giá này không làm đổi giá của phiếu đã ghi sổ trước đó.
- Change này **không** làm bảng và màn đó. Change này chỉ làm hàm thuần, nhận giá làm tham số.

Lựa chọn đã cân nhắc:
- **Cùng giá một cái cho cả 3 tình trạng** (bản đầu của proposal này). Không chọn nữa: giá trị phế liệu trong kho cao hơn hẳn giá bán sắt vụn.
- **Hệ số theo tình trạng** (VD Tốt 100 %, Chờ sửa 60 %). Không làm ở MVP. Hệ số chọn tay khác nhau giữa người làm; nếu cần, thêm sau mà không đổi bảng đơn.
- **Phế liệu luôn lấy giá sắt vụn, kể cả khi S > T** (phần dư âm trừ vào Tốt). Không chọn. Giá trị ghi sổ sẽ lớn hơn tiền thật bỏ ra, và Tốt có thể ra giá âm.
- **Cho đặt nhiều dòng cùng một mã, mỗi dòng một tình trạng.** Không chọn. Khi xe về, thủ kho không biết cái khung nào thuộc dòng nào. Người bán định giá riêng thì ghi giá trung bình, hoặc tách đơn.

### D6. Sửa, hủy, đóng khi đã có phiếu nhập

| Đơn | Sửa | Hủy | Đóng | Xóa |
|---|---|---|---|---|
| Nháp | Mọi thứ trừ mã | – | – | Có |
| Đặt, chưa có phiếu nhập | Mọi thứ trừ mã | Có, bắt buộc lý do | Không ("dùng Hủy đơn") | Không |
| Đặt, đã có phiếu nhập | Ngày, giờ, phương tiện, ghi chú | Không | Có, lý do không bắt buộc | Không |
| Hoàn thành | Không | Không | Không | Không |

Lý do khóa dòng hàng sau phiếu nhập:
- Phiếu nhập đã ghi sổ theo đơn giá và cách chia của đơn.
- Đổi đơn giá sau đó thì tiền trả người bán và giá vốn đã ghi sẽ không còn khớp nhau.
- Sổ kho chỉ ghi thêm. Sai thì lập phiếu điều chỉnh kho (đã có), không sửa ngược.
- Người bán giao thêm mã khác thì lập đơn mới.

Ngày dự kiến vẫn sửa được khi đã có phiếu nhập, vì chuyến giao bù có ngày mới (D3b: "Người bán hẹn giao bù").

### D7. Bảng dữ liệu (migration `drizzle/0004_purchase_orders.sql`)

**`purchase_order`**:
- `id uuid` PK; `code text unique` (`PO-2026-055`);
- `supplier_id` → `supplier` `RESTRICT`;
- `kind` (`NEW` | `USED`);
- `status` (`DRAFT` | `IN_PROGRESS` | `DONE`), `outcome` (null | `RECEIVED` | `CLOSED` | `CANCELLED`);
- `expected_date date` null, `expected_time time` null;
- `vehicle text` null, `note text` null;
- `allocation_method` (`VALUE` | `WEIGHT`, mặc định `VALUE`);
- `end_reason text` null (lý do hủy/đóng);
- `created_by`, `created_at`, `updated_at`; `placed_by`, `placed_at`; `ended_by`, `ended_at` (→ `user` `RESTRICT`).

CHECK:
- `(status = 'DONE') = (outcome is not null)`;
- `status = 'DRAFT' or expected_date is not null`;
- `outcome <> 'CANCELLED' or end_reason is not null`.

Index: `(status, expected_date)`, `(supplier_id)`.

**`purchase_order_line`**:
- `id`; `order_id` → `purchase_order` `CASCADE`; `line_no int`;
- `item_id` → `item` `RESTRICT`;
- `unit` (`PIECE` | `KG`), `quantity numeric(14,3) > 0`, `unit_price bigint >= 0`;
- `unique (order_id, item_id)`.
- `CASCADE` chỉ để xóa đơn nháp. Đơn đã đặt không xóa được, service chặn.
- Mã `KG` chỉ đặt theo kg: service kiểm vì CHECK không đọc được bảng khác.

**`purchase_order_cost`**:
- `id`; `order_id` `CASCADE`; `line_no`;
- `label text` (độ dài 1–60); `amount bigint > 0`.

**`purchase_order_event`** (chỉ ghi thêm ở tầng service; không cần trigger vì không phải số liệu tiền):
- `id bigint identity`; `order_id` `CASCADE`;
- `kind` (`CREATED`, `PLACED`, `UPDATED`, `CANCELLED`, `CLOSED`; `goods-receipt` thêm `RECEIPT_POSTED`, `BACKORDER_MARKED`);
- `actor_id` → `user`; `note text` null (VD mã phiếu nhập); `created_at`.

Mã đơn: `nextDocumentCode(tx, "PO", year)` trên `document_counter` có sẵn, `year` = năm của ngày nghiệp vụ hôm nay theo giờ Việt Nam.
- Cấp khi tạo, kể cả nháp: bản vẽ D2 có đơn nháp mang mã `PO-2026-054`.
- Xóa nháp làm hụt số. Chấp nhận được: đây là mã nội bộ, không phải số hóa đơn.

Thành tiền, tổng cộng **không lưu**, luôn tính từ dòng (cùng hàm `lineAmount` của `average-cost.ts`).

### D8. Service và khóa (`src/lib/purchasing/orders.ts`)

Mỗi lệnh ghi là **một transaction**:
- `create(input, { place })`:
  - khóa nhà cung cấp `FOR SHARE` và kiểm đang dùng;
  - khóa các vật tư `FOR SHARE` (theo thứ tự id) và kiểm đang dùng + đơn vị;
  - cấp mã, ghi đơn + dòng + chi phí;
  - ghi sự kiện `CREATED` (và `PLACED` nếu "Lưu đơn").
- `update(id, input)`:
  - `FOR UPDATE` đơn;
  - so `input.updatedAt` với `updated_at` vừa đọc; khác nhau thì từ chối với 409 "Đơn vừa được người khác sửa, tải lại trang" và không ghi gì;
  - đọc tóm tắt phiếu nhập (D9) để biết phần nào được sửa;
  - khóa nhà cung cấp/vật tư như trên;
  - thay toàn bộ dòng và chi phí (xóa rồi ghi lại, vì chưa có gì tham chiếu dòng khi chưa có phiếu nhập);
  - ghi sự kiện `UPDATED` nếu đơn đã đặt.
- `place`, `cancel`, `close`: `FOR UPDATE` đơn → `transition()` (D2) → ghi + sự kiện.
- `remove`: `FOR UPDATE`, chỉ `DRAFT`, xóa.

Chặn ngừng dùng (sửa `src/lib/catalog/partners.ts`, `items.ts`):
- Lệnh ngừng dùng đã khóa bản ghi `FOR UPDATE`. Giờ đếm thêm đơn `IN_PROGRESS` có tham chiếu bản ghi đó, và báo mã đơn (tối đa 3 mã, thêm "…").
- `FOR UPDATE` của lệnh ngừng dùng và `FOR SHARE` của lệnh lưu/đặt đơn chờ nhau. Vì thế chỉ có một trong hai kết quả của spec, không có đơn đặt cho nhà cung cấp vừa ngừng dùng. Đây là cách `inventory-ledger` đã làm với vật tư còn tồn.
- Xóa nhà cung cấp hoặc vật tư đã có trong đơn: khóa ngoại `RESTRICT` báo `23503`, service đổi thành "… đã được dùng nên chỉ ngừng dùng được" như các bản ghi khác.

Đọc:
- `list({ tab, q, kind, page })` trả dòng D2 + số đơn mỗi tab + số xe về hôm nay.
- `getByCode(code)` trả đơn, dòng (kèm tên, mã, đơn vị, trọng lượng chuẩn của vật tư), chi phí, lịch sử (kèm tên người làm), tóm tắt phiếu nhập.
- Tìm theo `supplier.search_text` (đã bỏ dấu) và `code`.

### D9. Chỗ nối với `goods-receipt`

`src/lib/purchasing/receipts.ts`:
- `receiptSummary(tx, orderIds)` trả `{ trips: 0, receivedByLine: {} }` ở change này.
- `goods-receipt` đổi phần thân để đọc bảng phiếu nhập. Mọi chỗ cần "đã có phiếu nhập chưa" đều gọi hàm này:
  - luật sửa/hủy/đóng;
  - tab Chờ xe về / Đang nhận;
  - nhãn trạng thái;
  - D3b.
- Hai change vì thế không phải sửa nhiều chỗ.

`goods-receipt` sẽ:
- thêm quyền đọc đơn cho Thủ kho;
- gọi `transition()` với lệnh `RECEIVE_*` trong transaction ghi phiếu nhập;
- chia chi phí từng chuyến bằng `allocate(…, order.allocation_method)` rồi chia theo tình trạng bằng `splitLotByCondition` (D5);
- thêm giá sắt vụn tham khảo và màn nhập giá (D5);
- ghi sự kiện vào `purchase_order_event`;
- điền phần nhận hàng của D3b.

Lựa chọn đã cân nhắc: **Thêm cột `receipt_count` vào đơn.** Không chọn. Đó là số đếm lưu riêng, có thể lệch với bảng phiếu nhập.

### D10. API (bọc `withAuth`, kiểm bằng zod)

Đọc dùng `purchasing.view`; mọi lệnh ghi dùng `purchasing.manage`.

| Route | Quyền | Input | Output |
|---|---|---|---|
| `GET /api/purchasing/orders` | `purchasing.view` | `tab`, `q`, `kind`, `page` | dòng D2, `counts`, `arrivingToday`, `total` |
| `POST /api/purchasing/orders` | `purchasing.manage` | đơn đầy đủ + `place: boolean` | `{ id, code }` 201 |
| `GET /api/purchasing/orders/[code]` | `purchasing.view` | – | đơn chi tiết (D8), 404 "Không tìm thấy đơn thu mua" |
| `PATCH /api/purchasing/orders/[code]` | `purchasing.manage` | đơn đầy đủ + `updatedAt` | đơn chi tiết; 409 khi `updatedAt` lệch |
| `DELETE /api/purchasing/orders/[code]` | `purchasing.manage` | – | 204 |
| `POST /api/purchasing/orders/[code]/place` | `purchasing.manage` | – | đơn chi tiết |
| `POST /api/purchasing/orders/[code]/cancel` | `purchasing.manage` | `{ reason }` | đơn chi tiết |
| `POST /api/purchasing/orders/[code]/close` | `purchasing.manage` | `{ reason? }` | đơn chi tiết |
| `GET /api/purchasing/form-options` | `purchasing.view` | – | nhà cung cấp và vật tư đang dùng (vật tư kèm đơn vị, trọng lượng chuẩn) |

- Đơn đầy đủ gồm: `supplierId`, `kind`, `expectedDate`, `expectedTime`, `vehicle`, `note`, `allocationMethod`, `lines[{ itemId, unit, quantity, unitPrice }]`, `costs[{ label, amount }]`.
- Tiền và số lượng gửi dạng chuỗi số, đọc bằng `parseMoney` / `parseQuantity` có sẵn.
- Lỗi nghiệp vụ trả 409 hoặc 422 theo `src/lib/catalog/respond.ts` (như các route danh mục và kho), kèm `field` để form hiện dưới ô.

### D11. Giao diện

Trang:
- `src/app/(desktop)/purchasing/page.tsx`: D2, thay trang giữ chỗ. Bộ lọc trên URL `?tab=draft|waiting|receiving|done&q=&kind=&page=`.
- `purchasing/orders/new/page.tsx`, `purchasing/orders/[code]/edit/page.tsx`: D3. Form client, dùng `landed-cost` để xem trước. Sửa đơn đã có phiếu nhập thì khóa ô theo D6.
- `purchasing/orders/[code]/page.tsx`: D3b.

Component trong `src/components/purchasing/`:
- `order-table`, `order-status-badge` (badge `DocumentStatusBadge` có sẵn + chữ phụ);
- `order-form`, `order-lines`, `order-costs`, `allocation-choice`, `order-total`;
- `order-detail`, `order-history`, `receiving-placeholder`;
- `cancel-dialog`, `close-dialog`.

Quy ước:
- Dùng component đã có trong `src/components/ui/` (`RadioGroup`, `AlertDialog`, `Dialog`, `Table`, `Input`; ô chọn dùng `<select>` như form điều chỉnh kho) và token Bright Blue Base. Nút đổi cái/kg là hai `Button` dạng nhóm. Hex trong bản vẽ đổi sang token.
- Trang đọc giờ (`new Date()`) gọi `await connection()` trước, như D10/D11.
- Nút ghi chỉ hiện khi `can(role, "purchasing.manage")`, và server vẫn kiểm.

### D12. Quyền

Thêm vào `src/domain/permissions.ts`:

```ts
// purchase-orders design D2, D12: sales buys, the director oversees; the
// accountant pays sellers and reads orders through purchasing.view.
"purchasing.manage": ["DIRECTOR", "SALES"],
```

- `purchasing.view` giữ nguyên (Văn phòng).
- Thủ kho đọc đơn: quyền riêng thêm ở `goods-receipt`. Để trang D2/D3b của văn phòng không mở cho Thủ kho.

### D13. Dữ liệu mẫu và E2E

- `npm run db:seed:dev` thêm 5 đơn qua service, chỉ chạy khi chưa có đơn nào:
  - đơn D3 (đã đặt, 4 dòng, 3 khoản chi phí, theo giá trị);
  - một đơn hàng mới đã đặt;
  - một đơn nháp;
  - một đơn đã hủy;
  - một đơn đặt hôm nay.
  - Chưa có đơn "Đang nhận" hay "Đã nhập" vì cần phiếu nhập. `goods-receipt` thêm sau.
- E2E:
  - Đơn tạo trong test có ghi chú `E2E thử`, nhà cung cấp mẫu Hòa Phát. Không tạo nhà cung cấp riêng: ảnh mốc D16 đếm số nhà cung cấp.
  - `global-setup.ts` xóa mọi đơn có ghi chú đó trước khi chạy. Đơn không thuộc sổ kho nên xóa được; `goods-receipt` sẽ phải đổi chỗ này khi đơn có phiếu nhập.
  - Ảnh mốc D2 lọc `?q=` theo nhà cung cấp mẫu để không đổi theo số đơn E2E. Che ô mã đơn và lời nhắc xe về.

## Risks / Trade-offs

- **[Hai người cùng sửa một đơn]** `FOR UPDATE` chỉ xếp hàng, không phát hiện xung đột. → Form gửi kèm `updatedAt` đã đọc; lệch thì 409 "Đơn vừa được người khác sửa, tải lại trang" (D8).
- **[Số mẫu D3 lệch 1 ₫]** Người kiểm tay so với bản vẽ sẽ thấy khác. → Ghi rõ ở proposal và D3; kiểm tay so với bảng D3 của design, không so với bản vẽ.
- **[Giá sắt vụn tham khảo cũ]** Giá thị trường đổi mà chưa ai cập nhật thì Phế liệu bị định giá sai, và phần chênh dồn sang Tốt / Chờ sửa. → `goods-receipt` hiện ngày cập nhật giá trên phiếu nhập; tổng giá trị lô vẫn đúng bằng tiền thật bỏ ra.
- **[Tốt và Chờ sửa cùng giá một cái]** Hàng Chờ sửa có thể mang giá cao hơn giá trị thật cho tới khi sửa xong. → Chấp nhận (D5); chi phí sửa cộng vào khi về Tốt (#23).
- **[Hàm `receiptSummary` trả rỗng]** Các nhánh "đã có phiếu nhập" ở service chưa chạy được bằng dữ liệu thật trong change này. → Luật nằm trong `transition()` thuần, test đủ bằng unit test với `hasReceipts: true`. `goods-receipt` thêm integration test cho các nhánh đó.
- **[Hụt số mã khi xóa nháp]** → Chấp nhận (D7).

## Migration Plan

- Migration chỉ thêm bảng mới, không sửa bảng cũ, không đụng sổ kho.
- Rollback: xóa 4 bảng mới. Không có dữ liệu nào khác phụ thuộc chúng trước `goods-receipt`.
