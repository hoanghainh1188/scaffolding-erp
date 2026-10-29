# Design: stock-value-adjustment

## Context

- Sổ kho (`src/lib/inventory/post.ts`): mọi dòng qua `postMovements`, khóa theo thứ tự `lockForPosting` (vật tư → vị trí → giá). Bảng `inventory_cost` giữ (giá BQ, tồn gộp) theo (mã + tình trạng), cập nhật cùng transaction, đối chiếu bằng `npm run inventory:check` (`reconcile.ts`: so `avg_cost_after` của dòng cuối và `sum(quantity)`).
- Ràng buộc DB hiện tại (`drizzle/0003`): `quantity` khác 0 theo dấu của loại; `location_id NOT NULL`; trigger chặn UPDATE/DELETE/TRUNCATE. Hàm thuần `assertMovementLine` từ chối số lượng 0; chỉ `OPENING`, `PURCHASE_IN`, `REPAIR_IN` có `amount`.
- Giá trị tồn **không lưu**: luôn là tồn × giá BQ (0.2 #24). D10 tính `value` như vậy.
- Phiếu điều chỉnh (`stock_adjustment`, `stock_adjustment_line`, `src/lib/inventory/adjustments.ts`): mã `ĐC`/`TĐK`, luồng Nháp → Chờ duyệt → Đã ghi sổ, duyệt = ghi sổ, khóa phiếu `FOR UPDATE` rồi kiểm `DONE` để chống duyệt hai lần, nhật ký `logActivity`.
- Phiếu nhập lưu: số đã nhận, cách tách tình trạng (`qty_new/good/needs_repair/scrap`), kg cân, chi phí chuyến (`goods_receipt_cost`), giá sắt vụn lúc ghi (`scrap_price_per_kg`). Đơn giá và cách chia (`method`) nằm ở đơn thu mua. Trọng lượng chuẩn nằm ở danh mục và **sửa được** sau này.
- Hàm thuần có sẵn: `allocate`, `splitLotByCondition` (`landed-cost.ts`), tính chi phí cả chuyến (`receipt-cost.ts`), `roundHalfUp` (`average-cost.ts`).

## Goals / Non-Goals

**Goals**

- Sửa giá trị đã ghi sai mà không đụng dòng sổ cũ, không đổi tồn, và `inventory:check` vẫn khớp.
- Trường hợp hay gặp nhất (chi phí chuyến nhập nhầm) làm bằng một ô số, chia lại đúng y như lúc ghi.
- Dùng lại tối đa luồng, quyền, màn của phiếu điều chỉnh.

**Non-Goals**

- Sửa tiền hàng / công nợ, ghi phần đã bán vào giá vốn hàng bán, chia lại tự động cho phiếu sửa chữa / tồn đầu kỳ, ghi lùi ngày (xem proposal "Ngoài phạm vi").

## Decisions

### D1. Loại biến động `REVALUE`: một dòng, số lượng 0, không vị trí (điểm cần chốt 1)

**Chọn:** thêm loại `REVALUE`. Mỗi (mã + tình trạng) trên phiếu ghi **đúng một** dòng sổ:

| Cột | Giá trị |
|---|---|
| `movement` | `REVALUE` |
| `quantity` | `0` |
| `location_id` | `NULL` |
| `amount` | chênh lệch có dấu (VD −23.403.614) |
| `avg_cost_after` | giá BQ mới |
| `unit_cost` | giá BQ mới (cho cột không âm; D11 không hiện) |
| `pool_quantity_after` | tồn gộp, không đổi |
| `document_type` / `document_code` | `REVALUE` / `ĐCG-2026-001` |
| `description` | "Giảm giá trị 23.403.614 ₫ · sửa PN-2026-094" |

Ràng buộc DB (migration `0009`) thay `inventory_ledger_movement_check`:

```sql
(movement in (<IN>) and quantity > 0 and location_id is not null)
or (movement in (<OUT>) and quantity < 0 and location_id is not null)
or (movement = 'REVALUE' and quantity = 0 and location_id is null)
```

và bỏ `NOT NULL` của `location_id` (khóa ngoại giữ nguyên). Trigger chỉ ghi thêm giữ nguyên.

Code: `Movement` thêm `REVALUE`; `changesAverage` gồm `REVALUE`; `assertMovementLine` cho số lượng 0 **chỉ** với `REVALUE` (và bắt buộc 0, "Dòng điều chỉnh giá không có số lượng"); `MovementDraft.locationId` thành `string | null` (chỉ `null` với `REVALUE`). Hàm thuần mới `averageAfterRevalue(pool, delta)`:

```
value×1000 = poolMilli × avg + delta × 1000      (bigint)
poolMilli = 0          → lỗi "đã hết hàng"
value×1000 < 0         → lỗi "giá trị sau âm (−x ₫)"   (x = value làm tròn 1 ₫)
giá BQ mới = roundHalfUp(value×1000, poolMilli)
```

`postMovements` nhánh `REVALUE`: không cộng tồn, không kiểm tồn theo vị trí, `lockForPosting` bỏ qua vị trí `null`.

**Phương án đã cân nhắc:**

| Phương án | Vì sao không chọn |
|---|---|
| Cặp dòng `REVALUE_OUT` −tồn theo giá cũ / `REVALUE_IN` +tồn theo giá mới | Phải tách theo **từng vị trí** đang có hàng (bãi, xưởng, mọi công trình): một sửa sai sinh hàng chục dòng. Cột Nhập/Xuất của thẻ kho và báo cáo nhập-xuất bị phồng giả. `REVALUE_IN` lại là "hàng vào từ ngoài" trái #11 |
| Dòng số lượng 0 nhưng gắn một vị trí (VD bãi có nhiều hàng nhất) | Vị trí đó vô nghĩa (giá BQ là toàn công ty, #24); thẻ kho lọc vị trí khác sẽ thiếu dòng làm giá BQ đổi |
| Mỗi vị trí có hàng một dòng số lượng 0, chia chênh lệch theo tồn | Nhiều dòng, phải chia làm tròn, mà kết quả giá BQ vẫn chỉ một |
| Lưu chênh lệch ở bảng riêng ngoài sổ | Phá "sổ kho là nguồn duy nhất của giá vốn"; `inventory:check` đọc giá BQ của dòng sổ cuối sẽ lệch |

Ảnh hưởng truy vấn có sẵn: tồn theo vị trí, D10, kiểm kê, thu hồi đều `sum(quantity)` → dòng 0 không đổi kết quả; truy vấn `inner join location` tự bỏ dòng `NULL`. Thẻ kho phải thêm `OR location_id IS NULL` (D6). Test cho từng chỗ ở tasks 3.x.

### D2. Tồn bằng 0: chặn; còn tồn ít thì dồn cả chênh lệch vào hàng còn (điểm cần chốt 2)

**Chọn:**

- **Tổng tồn (mọi vị trí) = 0** lúc lưu hoặc lúc duyệt → **chặn**: "`<mã> <tình trạng>` đã hết hàng, không điều chỉnh giá trị được". Duyệt chặn thì phiếu vẫn Chờ duyệt.
- **Còn tồn** → **toàn bộ** chênh lệch vào hàng đang tồn, đúng công thức issue: (tồn × giá BQ ± chênh lệch) ÷ tồn.
- **Giá trị sau < 0** → chặn, báo số âm. Bằng 0 thì cho.
- Màn lập và màn duyệt hiện giá BQ trước → sau để Giám đốc thấy độ lệch. Không đặt ngưỡng chặn %.

Vì sao dồn hết: tổng giá vốn của cả công ty (đã xuất + còn tồn) cuối cùng **đúng bằng** số đúng, vì phần đã xuất theo giá cao được bù bằng phần còn lại theo giá thấp hơn (spec scenario "Hàng của chuyến đã bán một phần": 50 × 315.020 + 150 × 158.996 = 39.600.400 ₫, đúng bằng 200 × 198.002; lệch tối đa vài đồng do làm tròn giá BQ). Đây là cách sửa bình quân gia quyền thường dùng khi không có sổ cái. Đã ghi vào `docs/requirements.md` 0.2 #35 (chốt 29/10/2026).

**Phương án đã cân nhắc:**

| Phương án | Vì sao không chọn |
|---|---|
| Tồn 0: vẫn ghi, treo chênh lệch chờ lần nhập sau | Lần nhập sau gánh lỗi của lô cũ, giá BQ mới sai mà không ai thấy; số lượng 0 thì công thức chia cho 0 |
| Tồn 0: ghi vào "chênh lệch giá vốn" / giá vốn hàng bán | Chưa có phân hệ kế toán, không có chỗ ghi. Làm khi có Tài chính (ngoài phạm vi) |
| Chỉ điều chỉnh phần tương ứng hàng còn tồn (chênh lệch × tồn ÷ số nhập) | Không biết hàng còn tồn thuộc lô nào (giá BQ trộn mọi lô); phần còn lại vẫn không có chỗ ghi; trái công thức đã nêu trong issue |
| Chặn khi giá BQ đổi quá X % | Thêm một quyết định nghiệp vụ không ai yêu cầu; Giám đốc duyệt từng phiếu và thấy trước → sau |

### D3. Hàng ở công trình có chịu chênh lệch (điểm cần chốt 3)

**Chọn: có.** Tồn dùng trong công thức là tồn gộp mọi vị trí, gồm công trình (#24), lấy từ `inventory_cost.pool_quantity` đã khóa `FOR UPDATE`. Hàng ở công trình không đổi số lượng; khi thu hồi về sau ghi theo giá BQ mới. Dòng xuất cho công trình đã ghi trước đó giữ đơn giá cũ (sổ chỉ ghi thêm).

Tiền thuê và đền bù tính theo bảng giá của hợp đồng, không theo giá vốn, nên không bị ảnh hưởng.

**Phương án đã cân nhắc:** chỉ chia cho hàng ở bãi/xưởng → không làm được: chỉ có **một** giá BQ cho (mã + tình trạng), không có giá riêng theo vị trí; muốn thế phải bỏ #24.

### D4. Chia lại theo phiếu gốc: có, chỉ cho chi phí chuyến của phiếu nhập (điểm cần chốt 4)

**Chọn:** hai cách lập dòng trên cùng một loại phiếu:

1. **Nhập tay** (mặc định): mỗi dòng (mã + tình trạng) + chênh lệch. Dùng cho mọi chứng từ gốc (phiếu nhập, phiếu sửa chữa, tồn đầu kỳ...).
2. **Sửa chi phí chuyến** (chỉ phiếu nhập): chọn phiếu nhập, nhập **tổng chi phí chuyến đúng**. Dòng do hệ thống dựng, không sửa tay.

Cách dựng dòng (hàm thuần `revaluationFromTrip`, service `buildTripRevaluation`):

```
đầu vào lấy lại từ DB: dòng phiếu nhập (số nhận, kg cân, tách tình trạng),
  đơn giá + cách chia của đơn, giá sắt vụn lưu trên phiếu, trọng lượng chuẩn hiện tại
chi phí hiện hành = chi phí đúng của phiếu sửa chi phí DONE gần nhất, không có thì Σ goods_receipt_cost
đã ghi[mã+tt]   = Σ amount PURCHASE_IN của phiếu nhập + Σ value_delta các phiếu sửa chi phí DONE của phiếu đó

bước kiểm:  tripCost(chi phí hiện hành).byCondition  phải = đã ghi   (từng mã+tt)
            lệch → từ chối "Không dựng lại được cách chia của PN-…, lập dòng tay"
dòng mới:   chênh[mã+tt] = tripCost(chi phí đúng).byCondition − đã ghi,  bỏ dòng 0
            không còn dòng nào → "Chi phí chuyến không đổi, không có gì để điều chỉnh"
```

Bước kiểm bắt trường hợp trọng lượng chuẩn đã sửa trong danh mục (chia theo trọng lượng hoặc phế liệu đổi kg quy đổi), đơn giá đơn đã đổi, hay có phiếu tay đã sửa giá trị của chuyến: khi đó không dám "chia đúng như gốc", người dùng lập dòng tay. Giá sắt vụn lấy từ phiếu nhập (không lấy giá hiện tại) nên phần Phế liệu chỉ đổi khi S > T (#27).

**Hàng của chuyến đã qua phiếu sửa** (Chờ sửa → Tốt): phần chi phí sai đã theo giá vốn sang Tốt. "Sửa chi phí chuyến" chỉ sửa đúng (mã + tình trạng) mà phiếu nhập đã ghi, nên phần đó vẫn nằm ở Tốt, và dòng Chờ sửa có thể bị chặn nếu Chờ sửa đã hết (D2). Trường hợp này Kế toán **lập dòng tay** cho Tốt (chứng từ gốc vẫn là `PN-…` vì cần dòng sổ của mã + tình trạng; nếu `PN` không có dòng Tốt thì ghi chứng từ gốc là phiếu sửa `PSC-…`). Không thêm code.

Một phiếu nhập chỉ có một phiếu sửa chi phí **chưa ghi sổ** (unique một phần trong DB, D6; lưu phiếu khóa dòng `goods_receipt` `FOR SHARE` như quy ước bản ghi được tham chiếu). Lý do: hai phiếu cùng tính từ một "đã ghi" sẽ trừ hai lần.

**Phương án đã cân nhắc:**

| Phương án | Vì sao không chọn |
|---|---|
| Chỉ nhập tay | Kế toán phải tự chạy lại phép chia phần dư lớn nhất và tách tình trạng: dễ sai từng đồng, đúng chỗ issue lo |
| Chia lại cho mọi loại chứng từ (sửa chữa, tồn đầu, sửa tiền hàng) | Phiếu sửa chữa và tồn đầu kỳ ghi giá trị **theo từng mã**, không có bước chia chung, nhập tay đã đủ. Sửa tiền hàng đụng công nợ phải trả → Tài chính |
| Sửa chi phí ngay trên phiếu nhập rồi ghi lại sổ | Phiếu nhập đã ghi sổ là bất biến; sổ chỉ ghi thêm |
| Cho sửa tay dòng do hệ thống dựng | Mất bảo đảm "đúng như phiếu gốc" và làm sai mốc "đã ghi" cho lần sửa sau |

### D5. Lý do, chứng từ gốc, luồng duyệt (điểm cần chốt 5)

**Chọn:** dùng lại bảng và luồng của phiếu điều chỉnh, thêm một **loại** phiếu.

- **Lý do** bắt buộc, ≤ 500 ký tự (`normalizeReason` có sẵn).
- **Chứng từ gốc** bắt buộc (khác phiếu điều chỉnh số lượng, ở đó là tùy chọn): phải có dòng sổ với `document_code` đó và `movement <> 'REVALUE'`; mỗi (mã + tình trạng) trên phiếu phải có dòng sổ của chứng từ đó. Kiểm lúc lưu và lúc gửi duyệt. Lý do: ép người lập chỉ ra **chỗ sai**, Giám đốc mở được chứng từ gốc để đối chiếu, và chặn "điều chỉnh giá trị" thành công cụ chỉnh giá tùy ý.
- **Luồng** Nháp → Chờ duyệt → Đã ghi sổ, trả lại kèm lý do, chỉ Nháp sửa/xóa: dùng nguyên `submitAdjustment`, `returnAdjustment`, `deleteAdjustment`.
- **Duyệt** (`approveAdjustment` nhánh `REVALUE`), một transaction:
  1. `SELECT … FOR UPDATE` phiếu; đã `DONE` → "Phiếu đã được ghi sổ" (chống duyệt hai lần, như hiện có).
  2. Phiếu sửa chi phí: kiểm lại "đã ghi" chưa đổi (bước kiểm D4).
  3. `postMovements` với các dòng `REVALUE` (khóa giá theo thứ tự chung; tính giá mới, chặn tồn 0 / âm theo số lúc duyệt).
  4. Phiếu → `DONE`, `posting_id`, người/giờ duyệt; `logActivity` (Duyệt, tóm tắt "Sửa PN-… · ghi sổ n dòng điều chỉnh giá · ±x ₫").
- Ngày nghiệp vụ = ngày duyệt (giờ VN). Luật không ghi lùi ngày giữ nguyên.

**Phương án đã cân nhắc:** bảng riêng `stock_revaluation` → lặp lại danh sách, trạng thái, quyền, nhật ký, API; danh sách "Phiếu điều chỉnh" bị tách hai chỗ. Chứng từ gốc tùy chọn như `ĐC` → issue yêu cầu bắt buộc, và không có nó thì Giám đốc không có gì để đối chiếu.

### D6. Dữ liệu và API

**Migration `drizzle/0009_stock_value_adjustment.sql`:**

- `inventory_ledger`: `location_id` bỏ `NOT NULL`; thay `inventory_ledger_movement_check` (D1).
- `stock_adjustment`:
  - `kind` thêm `'REVALUE'`.
  - `source_receipt_id uuid NULL REFERENCES goods_receipt(id) ON DELETE RESTRICT`, `corrected_trip_cost bigint NULL`, `recorded_trip_cost bigint NULL` (chi phí hiện hành lúc dựng, để hiện "35.000.000 ₫ → 3.500.000 ₫").
  - Check: `kind = 'REVALUE'` ⇒ `related_document_code is not null`; ba cột chuyến cùng null hoặc cùng có, chỉ với `REVALUE`, `corrected_trip_cost >= 0`.
  - Unique một phần: `(source_receipt_id) WHERE status <> 'DONE'` (một phiếu sửa chi phí chưa ghi sổ cho mỗi phiếu nhập).
- `stock_adjustment_line`:
  - `line_type` thêm `'VALUE'`; cột mới `value_delta bigint NULL`.
  - `location_id` bỏ `NOT NULL`; nhánh shape mới: `line_type = 'VALUE' and quantity = 0 and value_delta <> 0 and location_id is null and to_condition is null and to_location_id is null and unit_cost is null`; các nhánh cũ thêm `location_id is not null and value_delta is null`.
  - Unique `(adjustment_id, item_id, condition) WHERE line_type = 'VALUE'`.
- `document_counter` dùng prefix `ĐCG` (không tạo sequence mới, 0.2 #33).

**Ghi chú khi làm (apply):** sửa phiếu dùng `PATCH` như route có sẵn. Nhật ký dùng lại loại chứng từ `STOCK_ADJUSTMENT` (mã `ĐCG` phân biệt), không đổi ràng buộc `activity_log`. Code nằm ở `src/lib/inventory/revaluations.ts` (kiểm chứng từ gốc, xem trước, `buildTripRevaluation`), `trip-adjustments.ts` (lập/sửa phiếu sửa chi phí) và `adjustment-queries.ts` (phần đọc tách khỏi `adjustments.ts` cho dưới 800 dòng).

**Domain:** `ADJUSTMENT_KINDS` thêm `REVALUE`, `ADJUSTMENT_PREFIX.REVALUE = "ĐCG"`, nhãn "Điều chỉnh giá"; `src/domain/stock-revaluation.ts`: `assertValueLine`, `averageAfterRevalue`, `revaluationMovements`, `revaluationFromTrip` (thuần, nhận số liệu chuyến đã đọc sẵn).

**API** (đều qua `withAuth`):

| Route | Quyền | Vào | Ra |
|---|---|---|---|
| `POST /api/inventory/adjustments` | `inventory.adjust` | `kind: "REVALUE"`, `reason`, `relatedDocumentCode`, `lines: [{itemId, condition, valueDelta}]` | phiếu Nháp |
| `PATCH /api/inventory/adjustments/<id>` | `inventory.adjust` | như trên + `updatedAt` (lệch → 409) | phiếu |
| `POST /api/inventory/adjustments/trip-cost` | `inventory.adjust` | `receiptId`, `correctedTripCost`, `reason` | phiếu Nháp `REVALUE` có dòng dựng sẵn |
| `PATCH /api/inventory/adjustments/<id>/trip-cost` | `inventory.adjust` | `correctedTripCost`, `reason`, `updatedAt` | dựng lại dòng |
| `GET /api/inventory/adjustments/revalue-preview?itemId&condition&valueDelta` | `inventory.adjust` | | tồn, giá BQ, giá trị, giá BQ mới dự kiến (hoặc lỗi tồn 0 / âm) |
| `submit`, `approve`, `return`, `DELETE` có sẵn | như cũ | | |

**Giao diện** (`/inventory/adjustments`, không có file thiết kế; theo kiểu khung lập phiếu có sẵn, token Bright Blue Base):

- Nút "Lập phiếu" mở menu: Điều chỉnh số lượng (có sẵn), Tồn đầu kỳ (có sẵn), **Điều chỉnh giá trị**, **Sửa chi phí chuyến**.
- Khung "Điều chỉnh giá trị": chứng từ gốc, lý do, bảng dòng (mã, tình trạng, chênh lệch có dấu, ô xem trước "Tồn · Giá BQ · Giá trị → Giá BQ mới").
- Khung "Sửa chi phí chuyến": chọn phiếu nhập (mã `PN-…`, đơn, ngày), hiện chi phí đã ghi, ô chi phí đúng, lý do, bảng dòng chỉ đọc.
- Chi tiết phiếu: như spec "Hiện trên trang Phiếu điều chỉnh". Danh sách thêm loại "Điều chỉnh giá".
- Thẻ kho D11 (`card.ts`): lọc vị trí thêm `OR location_id IS NULL`; dòng `REVALUE` hiện nhãn "Điều chỉnh giá", Nhập/Xuất/Đơn giá trống.
- Không có ô ngày trên phiếu (ngày nghiệp vụ = ngày duyệt). Nếu sau này thêm ô ngày (VD lọc danh sách) thì dùng `DateInput`, không dùng `<input type="date">`.
- Mỗi lệnh ghi (tạo, sửa, dựng từ phiếu nhập, xóa nháp, gửi, duyệt, trả lại) gọi `logActivity` trong transaction của lệnh (spec delta `activity-log`; `coverage.test.ts` bắt chỗ quên).

## Risks / Trade-offs

- [Nới `location_id` thành nullable, truy vấn cũ quên lọc] → mọi truy vấn tồn dùng `sum(quantity)` (dòng 0 vô hại) hoặc `inner join location`; thêm test tích hợp: D10, tồn theo vị trí, kiểm kê, xóa vị trí đã dùng vẫn đúng sau một dòng `REVALUE`. DB vẫn bắt dòng thường thiếu vị trí.
- [Hàng còn tồn ít gánh cả chênh lệch, giá BQ nhảy mạnh] → hiện trước → sau ở màn lập và duyệt; Giám đốc duyệt từng phiếu; chặn khi âm. Tổng giá vốn công ty vẫn đúng (D2).
- [Trọng lượng chuẩn / đơn giá đổi sau khi nhập làm chia lại sai] → bước kiểm "dựng lại phải ra đúng số đã ghi" trước khi sinh dòng (D4); lệch thì buộc nhập tay.
- [Hai phiếu sửa chi phí cùng một chuyến] → unique một phần trên `source_receipt_id` khi chưa `DONE` + kiểm lại "đã ghi" lúc duyệt.
- [Duyệt đồng thời với phiếu nhập/xuất cùng mã] → `postMovements` khóa `inventory_cost` theo thứ tự chung; giá mới tính theo tồn lúc khóa (spec scenario "Tồn đổi giữa lúc lập và lúc duyệt").
- [Điều chỉnh giá dùng để "làm đẹp" số] → chứng từ gốc bắt buộc và phải chứa đúng (mã + tình trạng), chỉ Giám đốc duyệt, nhật ký ghi mọi bước.

## Migration Plan

1. Chạy `npm run db:migrate` (`0009`): chỉ nới ràng buộc và thêm cột null; dữ liệu cũ thỏa ràng buộc mới, không cần backfill.
2. `npm run inventory:check` trước và sau migration: phải "0 lệch".
3. Lùi lại: chỉ được khi chưa có dòng `REVALUE` (`select count(*) from inventory_ledger where movement = 'REVALUE'` = 0): khôi phục check cũ, `SET NOT NULL`, xóa cột mới. Đã có dòng `REVALUE` thì không lùi (sổ chỉ ghi thêm), sửa tiến.
