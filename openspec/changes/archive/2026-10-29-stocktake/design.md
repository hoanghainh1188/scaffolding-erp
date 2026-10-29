# Design: stocktake

## Context

- Sổ kho (`src/lib/inventory/`) đã có: mọi biến động qua `postMovements`, khóa theo thứ tự chung `lockForPosting` (vật tư → vị trí → giá), sổ chỉ ghi thêm, giá BQ theo (mã + tình trạng) gộp mọi vị trí (0.2 #24).
- Phiếu điều chỉnh (`stock-adjustments`): mã `ĐC`, luồng Nháp → Chờ duyệt → Đã ghi sổ, Giám đốc duyệt = ghi sổ, kiểm tồn lại lúc duyệt, chống duyệt hai lần. Logic thuần `adjustmentMovements` biến dòng "số lượng" thành `ADJUST_IN`/`ADJUST_OUT`.
- Nháp điện thoại (`src/lib/drafts/`): IndexedDB, outbox tự gửi lại, mã nháp chống trùng (như `client_draft_id` của phiếu nhập).
- Thiết kế đã vẽ và duyệt ở PR #51: M6a, M6, D13. Phạm vi chỉ bãi và xưởng (0.2 #31).
- Dòng sổ có `created_at` (giờ server lúc ghi). Đây là mốc để tính "sổ lúc đếm".

## Goals / Non-Goals

**Goals**

- Thủ kho đếm mù trên điện thoại, mất sóng vẫn đếm, không chặn xuất nhập.
- Chênh lệch đúng kể cả khi có nhập, xuất trong lúc kiểm kê.
- Giám đốc thấy chỗ đáng ngờ (cờ), đếm lại từng dòng, duyệt một lần là cân sổ.

**Non-Goals**

- Kiểm kê công trình, khóa kho, nhiều người đếm một phiên, đếm theo ô/kệ, lịch kiểm kê (xem proposal "Ngoài phạm vi").

## Decisions

### D1. Thiết kế màn (điểm cần chốt 1 trong issue #17)

Đã vẽ và duyệt ở PR #51: M6a (`M6a-StocktakeStart.dc.html`), M6 (`M6-Stocktake.dc.html`), D13 (`D13-Stocktake.dc.html`). Change này code theo các file đó, với hai bổ sung nhỏ không cần vẽ lại:

- **M1** thêm khối "Kiểm kê" theo kiểu thẻ "Xe sắp về bãi" có sẵn (spec `mobile-home`). Lý do: M1 là lối vào duy nhất của Thủ kho; không có khối này thì không mở được M6a hay thấy yêu cầu đếm lại.
- **Hủy phiên** (nút phụ "Hủy phiên" trên M6 và D13) và ô **Đơn giá** cho dòng thừa chưa từng có giá (D13). Lý do: một vị trí chỉ có một phiên mở (D4), nên phải có lối thoát khi bắt đầu nhầm; dòng chưa có giá thì `postMovements` từ chối nếu không có đơn giá.

Số "Cần xem kỹ: 2 dòng" trên bản vẽ là số mẫu. Theo luật cờ ở D6, đúng dữ liệu đó ra 3 dòng (`GG-CH` Tốt, `GG-CH` Chờ sửa, `PK-KU` Tốt). Spec thắng.

### D2. Không khóa xuất nhập; số sổ lấy đúng lúc "Xong mã này" (điểm cần chốt 2)

**Chọn:** không khóa (ghi vào `docs/requirements.md` 0.2 #32, chốt 28/10/2026). Mỗi mã trên điện thoại ghi hai mốc giờ: "Đếm mã này" (bắt đầu) và "Xong mã này" (xong). Lúc phiên được gửi, server tính cho mỗi dòng:

```
sổ lúc đếm = Σ quantity của inventory_ledger
             với (item, condition, location) của dòng và created_at <= giờ xong (đã chỉnh, D3)
chênh lệch = đếm − sổ lúc đếm
```

Duyệt ghi đúng `chênh lệch` vào sổ ở thời điểm duyệt. Vì sao đúng: gọi M là tổng biến động ghi sau giờ xong. Sổ lúc duyệt = sổ lúc đếm + M; hàng thật lúc duyệt = đếm + M. Cộng chênh lệch vào sổ lúc duyệt ra đúng hàng thật. Test bắt buộc ở tasks 2.2 và 4.4.

**Phương án đã cân nhắc:**

| Phương án | Vì sao không chọn |
|---|---|
| Khóa xuất nhập vị trí cả phiên | Bãi chính đếm mất cả buổi; khóa thì xe về không nhập được, xuất cho công trình bị trễ. Công ty nhỏ, không có ca nghỉ để kiểm kê |
| Chụp số sổ lúc **bắt đầu phiên** | Mọi phiếu nhập, xuất trong buổi đếm làm lệch giả. Phải bắt người dùng tự trừ |
| Điện thoại gọi server lấy số sổ ngay lúc bấm "Xong mã này" | Mất sóng thì không lấy được (M6 phải chạy khi mất sóng); số chụp nằm trên máy dễ lộ đếm mù. Tính từ `created_at` lúc gửi cho cùng kết quả, chạy cả khi đếm offline |
| Lưu số sổ bằng bảng "tồn cộng dồn" | Trái quy tắc chỉ tính tồn từ sổ kho |

Ghi chú: `created_at` là giờ bắt đầu transaction ghi sổ. Một phiếu đang ghi dở đúng lúc "Xong mã này" có thể được tính về một phía lệch vài giây. Cờ "Có nhập/xuất trong lúc đếm" (D6) phủ đúng khoảng này nên Giám đốc vẫn thấy.

### D3. Giờ điện thoại không đáng tin: chỉnh lệch rồi kẹp

Điện thoại gửi kèm `deviceNow` (giờ máy lúc gửi). Server tính `offset = serverNow − deviceNow`, cộng `offset` vào mọi mốc giờ của lần gửi, rồi kẹp vào `[started_at của phiên, serverNow]`. Giờ đã chỉnh được lưu trên dòng (`counted_at`, `count_started_at`), D13 hiện giờ này.

Lần gửi lại do outbox (mất trả lời) mang cùng `submissionId` nên không tính lại (D8). Một nháp chờ gửi lâu vẫn đúng vì `offset` tính theo lúc gửi thật.

Đã cân nhắc: tin giờ máy (sai khi máy lệch giờ), hoặc dùng giờ server lúc nhận (mọi mã có cùng giờ xong, mất ý nghĩa D2).

### D4. Phạm vi phiên, một phiên mở mỗi vị trí

- Vị trí: chỉ `YARD`, `WORKSHOP` đang dùng (0.2 #31). Kiểm ở service, có test riêng "không tạo được phiên ở `SITE`".
- Phạm vi: "Tất cả mã có tồn" hoặc danh sách nhóm hàng (`stocktake_group`). Dòng đếm = (mã + tình trạng) có tồn ≠ 0 tại vị trí lúc bắt đầu, mã đang dùng, thuộc nhóm đã chọn. Không lưu số sổ lúc bắt đầu (đếm mù, và D2 không cần).
- M6a đếm số dòng mỗi nhóm theo vị trí đang chọn ("Khung (8)") và "Lần trước: <ngày phiên Đã ghi sổ gần nhất>".
- **Một phiên mở (Đang đếm / Chờ duyệt) mỗi vị trí**, chặn bằng unique index một phần. Lý do: hai phiên cùng vị trí có thể cùng đếm một mã (thêm ngoài danh sách) và điều chỉnh hai lần. Chia việc bằng nhóm hàng theo nhiều phiên nối tiếp. Đã cân nhắc "cho nhiều phiên nhưng cấm trùng mã" — phức tạp hơn mà ít lợi ở quy mô 1 bãi + 1 xưởng.

### D5. Đếm mù (đề xuất 2)

- API của điện thoại (`/api/stocktakes/:code/count`) chỉ trả mã, tên, đơn vị, tình trạng, nhóm, số **chính phiên đã đếm**, cờ "Cần đếm lại", lý do trả lại. Không có số sổ, giá, chênh lệch. Có test khẳng định các trường đó vắng mặt.
- Thủ kho được Giám đốc cấp `stocktake.count`; Giám đốc có cả `inventory.view` nên đếm trên máy văn phòng vẫn thấy số sổ ở D13 — chấp nhận, Giám đốc là người duyệt.

### D6. Cờ cảnh báo (đề xuất 3)

Tính lúc gửi, lưu trên dòng; hàm thuần `stocktakeFlags` ở `src/domain/stocktake.ts`:

| Cờ | Điều kiện | Lý do |
|---|---|---|
| `MOVED` "Có nhập/xuất trong lúc đếm" | Có dòng sổ của (mã + tình trạng) tại vị trí với `created_at` trong `[count_started_at, counted_at]` | Hàng có thể đã vào/ra bãi khi Thủ kho đang đếm đống đó (D2) |
| `OVER_PCT` "Lệch x %" | `|chênh| × 100 > 1 × sổ` (ngưỡng **1 %** cho mọi mã, kể cả mã tính theo kg — chốt khi review PR #55; một hằng số dùng chung trong domain); hoặc sổ = 0 mà đếm > 0 | Bản vẽ: lệch 1,2 % có cờ, 0,93 % không. Cờ chỉ nhắc xem kỹ, không chặn duyệt; hằng số đổi được sau một lần chạy thật |
| `CONDITION_SWAP` "Nghi nhầm tình trạng" | Cùng mã trong phiên có một dòng chênh < 0 và một dòng chênh > 0 | Thường là phân loại Tốt/Chờ sửa khác lần trước, không phải mất hàng |

Đã cân nhắc ngưỡng theo giá trị (VD lệch > 1.000.000 ₫): giá trị đã có cột riêng và tổng ở trên; giữ một ngưỡng cho dễ hiểu.

### D7. Dòng chưa đếm, dòng thêm (đề xuất 4)

- Chưa đếm: `counted_quantity`, `counted_at`, `book_quantity` đều null. Không bao giờ sinh dòng sổ. D13 hiện "Chưa đếm".
- Thêm tình trạng / thêm mã ngoài danh sách: dòng mới `origin = 'ADDED'`, cùng luật so sổ. Thêm mã dùng ô tìm mã (`catalog.read`) và quét QR có sẵn (`item-scan`).
- "Xong mã này" cần số cho mọi dòng đang cần đếm của mã (0 cũng phải nhập). Lý do: stepper để trống khác với 0; mặc định 0 dễ biến "quên đếm" thành "mất hết".

### D8. Gửi chống trùng, nháp trên máy (đề xuất 7)

- Bắt đầu phiên cần mạng (cần mã `KK` và danh sách dòng từ server). Yêu cầu mang `clientStartId` (uuid), unique trên `stocktake`: gửi lại trả đúng phiên đã tạo.
- Đếm: nháp loại mới `STOCKTAKE` trong `DRAFT_KINDS`, `documentRef` = mã phiên, payload = số đếm và mốc giờ theo mã, kèm `round` của phiên. Dùng lại store, outbox, M1/M7 hiện "phiếu chưa gửi" có sẵn.
- Gửi: `POST /api/stocktakes/:code/submit` mang `submissionId` (= mã nháp của vòng đó). Server khóa phiên `FOR UPDATE`: nếu `last_submission_id = submissionId` thì trả kết quả hiện có (không tính lại); nếu phiên không ở Đang đếm thì 409 "Phiên đã gửi văn phòng"; còn lại tính sổ lúc đếm, cờ, lưu, chuyển Chờ duyệt — một transaction.
- Mở M6 khi server có `round` lớn hơn nháp (đã trả lại / đếm lại): nháp cũ bỏ các dòng bị đặt "Cần đếm lại", giữ các dòng khác.
- Đã cân nhắc gửi từng mã lên server ngay khi "Xong mã này": cần mạng ổn định ngoài bãi, nhiều yêu cầu nhỏ phải chống trùng từng cái; lợi ích (văn phòng xem tiến độ trực tiếp) không cần ở MVP.

### D9. Duyệt = ghi sổ, tách khỏi phiếu điều chỉnh (đề xuất 5)

**Chọn:** phiên kiểm kê là chứng từ riêng (`document_type = 'STOCKTAKE'`, `document_code = KK-…`, `document_id` = id phiên), **dùng lại** phần lõi của `stock-adjustments`:

- `adjustmentMovements(code, "Kiểm kê <mã vị trí>", lines)` với mỗi dòng lệch là một dòng kiểu `QUANTITY` (`quantityMilli` = chênh lệch, `unitCost` = đơn giá Giám đốc nhập nếu có) → `ADJUST_IN` / `ADJUST_OUT`.
- `postMovements` trong cùng transaction: giá theo BQ hiện tại (không đổi BQ, #11), kiểm tồn không âm, vật tư/vị trí ngừng dùng, ngày nghiệp vụ = hôm nay (giờ VN).
- `nextDocumentCode(tx, "KK", năm)` cho mã phiên (cấp lúc bắt đầu).
- Thông báo dùng chung: "Không đủ hàng: …", "… chưa có giá vốn, nhập đơn giá", "Nhập lý do trả lại".

Luồng duyệt: khóa phiên `FOR UPDATE` → `DONE`/`CANCELLED` thì 409 "Phiên kiểm kê đã được ghi sổ" / "Phiên kiểm kê đã hủy"; không phải Chờ duyệt thì 409 → dựng dòng → `postMovements` → lưu `posting_id`, `approved_by`, `approved_at`, `status = DONE`. Lỗi ở bất kỳ bước nào rollback cả phiên. Hai lệnh duyệt cùng lúc: lệnh sau chờ khóa, thấy `DONE`, trả 409.

**Phương án đã cân nhắc:**

| Phương án | Vì sao không chọn |
|---|---|
| Duyệt phiên tự tạo một phiếu `ĐC` đã ghi sổ | Hai chứng từ cho một việc; thẻ kho (D11) hiện `ĐC` thay vì `KK`, khó lần lại phiên; trạng thái phiếu ĐC (Nháp/Chờ duyệt) không có nghĩa ở đây |
| Gửi phiên tạo phiếu `ĐC` Chờ duyệt, Giám đốc duyệt ở `/inventory/adjustments` | Mất ngữ cảnh kiểm kê (sổ lúc đếm, cờ, đếm lại từng dòng) ngay lúc quyết định |

Phiên khớp hết vẫn duyệt được: `DONE` không có `posting_id` (ghi nhận đã kiểm).

### D10. Đếm lại, trả lại, hủy (đề xuất 6)

- **Yêu cầu đếm lại** (`inventory.approve`, phiên Chờ duyệt, ≥ 1 dòng đã đếm): các dòng chọn đặt `recount = true`, xóa `counted_quantity`, `counted_at`, `book_quantity`, cờ; phiên về `COUNTING`, `round + 1`. Lần gửi sau chỉ được gửi các dòng `recount` (và dòng chưa đếm, dòng thêm); server từ chối mã khác với "GG-K17 không cần đếm lại".
- **Trả lại** (lý do 1–500 ký tự, `normalizeReason` có sẵn): phiên về `COUNTING`, `round + 1`, giữ số đếm; mọi mã sửa được; lần gửi sau tính lại các mã được gửi.
- **Hủy**: `stocktake.count` khi `COUNTING`; `inventory.approve` khi `COUNTING` hoặc `SUBMITTED`. Lý do bắt buộc.
- Lưu `returned_reason`, `returned_by/at`, `cancel_reason`, `cancelled_by/at`, người/giờ từng bước (lưu vết rẻ như #47). Lịch sử nhiều vòng không lưu riêng: chỉ giữ vòng cuối. Đã cân nhắc bảng lịch sử vòng đếm — để sau nếu Giám đốc cần.

### D11. Quyền (đề xuất 8)

| Quyền | Vai trò | Dùng cho |
|---|---|---|
| `stocktake.count` (mới) | `DIRECTOR`, `WAREHOUSE` | M6a, M6, khối M1, bắt đầu, gửi, hủy phiên Đang đếm |
| `inventory.view` (có sẵn) | `DIRECTOR`, `ACCOUNTANT`, `SALES` | `/inventory/stocktakes`, D13, API đọc |
| `inventory.approve` (có sẵn) | `DIRECTOR` | Duyệt, đếm lại, trả lại, hủy phiên Chờ duyệt |

**Đã chốt (review PR #55): Xưởng chưa được đếm.** Đã cân nhắc thêm `WORKSHOP` vào `stocktake.count` để thợ xưởng tự đếm xưởng; không chọn vì 0.4 giao kiểm kê cho Thủ kho và vai trò Xưởng chưa có màn điện thoại riêng (M8 ở Bản 2). Thêm sau chỉ là một dòng trong bảng quyền.

### D12. Bảng dữ liệu (migration kế tiếp, dự kiến `drizzle/0007_stocktakes.sql`)

**`stocktake`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `code` | text unique | `KK-2026-003` |
| `location_id` | uuid FK `location` RESTRICT | |
| `scope_all` | boolean | true = tất cả mã có tồn |
| `status` | text | CHECK `COUNTING`, `SUBMITTED`, `DONE`, `CANCELLED` |
| `round` | int default 1 | CHECK ≥ 1 |
| `client_start_id` | uuid unique | chống bắt đầu hai lần |
| `last_submission_id` | uuid null | chống gửi hai lần |
| `started_by`, `started_at` | FK `user`, timestamptz | |
| `submitted_by`, `submitted_at` | null | |
| `returned_reason`, `returned_by`, `returned_at` | null | ≤ 500 ký tự |
| `approved_by`, `approved_at`, `posting_id` | null | CHECK `status = 'DONE'` ⇔ `approved_at` not null |
| `cancel_reason`, `cancelled_by`, `cancelled_at` | null | CHECK `status = 'CANCELLED'` ⇔ `cancelled_at` not null |
| `updated_at` | timestamptz | |

Index unique một phần `(location_id) WHERE status IN ('COUNTING','SUBMITTED')`.

**`stocktake_group`**: (`stocktake_id` CASCADE, `group_id` RESTRICT) PK đôi.

**`stocktake_line`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `stocktake_id` | FK CASCADE | |
| `item_id` | FK `item` RESTRICT | |
| `condition` | text | CHECK 4 tình trạng |
| `origin` | text | `LISTED` / `ADDED` |
| `count_started_at`, `counted_at` | timestamptz null | giờ đã chỉnh (D3) |
| `counted_quantity`, `book_quantity` | numeric(14,3) null | CHECK `counted_quantity >= 0`; ba cột `counted_at`, `counted_quantity`, `book_quantity` cùng null hoặc cùng có |
| `flags` | text[] default `{}` | `MOVED`, `OVER_PCT`, `CONDITION_SWAP` |
| `recount` | boolean default false | |
| `unit_cost` | bigint null | đơn giá Giám đốc nhập cho dòng chưa có giá; CHECK ≥ 0 |

Unique (`stocktake_id`, `item_id`, `condition`). Trigger chặn `UPDATE`/`DELETE` phiên `DONE` và dòng của nó ("Phiên kiểm kê đã ghi sổ, không sửa được"), như phiếu sửa chữa. Chênh lệch và giá trị lệch **không lưu**: tính khi đọc (chênh = đếm − sổ; giá trị = chênh × BQ hiện tại, hoặc từ dòng sổ khi `DONE`).

### D13. Logic thuần `src/domain/stocktake.ts`

- `STOCKTAKE_MESSAGES`, `OVER_PCT_THRESHOLD = 1`.
- `isCountableLocation(type)` — `YARD`, `WORKSHOP`.
- `adjustDeviceTime(t, deviceNow, serverNow, startedAt)` (D3).
- `lineDifference(counted, book)` theo phần nghìn; `stocktakeFlags(lines)` (D6).
- `stocktakeSummary(lines, avgCosts)` → Thiếu / Thừa / Khớp / Cần xem kỹ / tổng giá trị (D13 của UI).
- `stocktakeAdjustmentLines(lines)` → `AdjustmentLineInput[]` kiểu `QUANTITY` cho `adjustmentMovements`.
- `assertSubmission(sessionLines, submittedItems)` — đủ số cho mọi dòng cần đếm của mã, số nguyên cho mã tính theo cái, chỉ gửi dòng cần đếm khi đang đếm lại.

### D14. API (bọc `withAuth`, kiểm bằng zod)

| Route | Quyền | Vào | Ra |
|---|---|---|---|
| `GET /api/stocktakes/start-options` | `stocktake.count` | – | bãi/xưởng đang dùng, lần trước, số dòng có tồn; nhóm và số dòng mỗi nhóm theo vị trí |
| `POST /api/stocktakes` | `stocktake.count` | `clientStartId`, `locationId`, `groupIds \| null` | `code` |
| `GET /api/stocktakes/:code/count` | `stocktake.count` | – | dữ liệu đếm mù (D5), `round`, lý do trả lại |
| `POST /api/stocktakes/:code/submit` | `stocktake.count` | `submissionId`, `deviceNow`, `items[]` (`itemId`, `startedAt`, `countedAt`, `lines[]` (`condition`, `quantity`)) | trạng thái, số dòng đã đếm |
| `POST /api/stocktakes/:code/cancel` | `stocktake.count` / `inventory.approve` (D10) | `reason` | trạng thái |
| `GET /api/stocktakes` | `inventory.view` | `?status=` | danh sách |
| `GET /api/stocktakes/:code` | `inventory.view` | – | chi tiết D13 |
| `POST /api/stocktakes/:code/approve` | `inventory.approve` | `unitCosts?: Record<uuid, number>` (khóa = `stocktake_line.id`, giá trị = đơn giá ₫; zod kiểm uuid và số nguyên ≥ 0) | trạng thái, số dòng sổ |
| `POST /api/stocktakes/:code/recount` | `inventory.approve` | `lineIds[]` (≥ 1) | trạng thái |
| `POST /api/stocktakes/:code/return` | `inventory.approve` | `reason` | trạng thái |

Lỗi theo kiểu `ServiceFailure` có sẵn: 400 dữ liệu sai, 403 quyền, 404 không có phiên, 409 sai trạng thái / hết hàng.

### D15. Giao diện

- `/m/stocktake/new` (M6a), `/m/stocktake/[code]` (M6): card, stepper +/-, nút to; thanh "Mất kết nối – đã lưu nháp" có sẵn.
- `/inventory/stocktakes` (danh sách) và `/inventory/stocktakes/[code]` (D13); lối vào "Kiểm kê" trên `/inventory`. Thanh duyệt chỉ cho `inventory.approve`, chọn dòng bằng checkbox của bảng.
- Token Bright Blue Base, không hex. Tiền theo `domain-values` (`−2.788.056 ₫`).
- Trang dùng giờ hiện tại gọi `await connection()` (Cache Components).

### D16. Dữ liệu mẫu và E2E

- `npm run db:seed:dev` thêm một phiên `KK` Chờ duyệt tại bãi mẫu với 5 dòng lệch như D13 (dùng mã vật tư đang có trong seed).
- Phiên seed ở `BAI-01` giữ nguyên cho ảnh mốc D13. Vì D4 (một phiên mở mỗi vị trí), **E2E bắt đầu phiên ở `XUONG-01`**, không đụng `BAI-01`.
- E2E chỉ đếm `E2E-KHO-02` (kiểm theo chênh lệch, như các change trước): `repairs.spec.ts` đo cột xưởng của `E2E-KHO-01` theo chênh lệch, nên một điều chỉnh song song trên mã đó làm test kia sai (chốt khi apply). Các dòng khác của phạm vi để chưa đếm nên không điều chỉnh. E2E chỉ tạo chênh lệch **thừa** (`ADJUST_IN`). Lần chạy đầu `E2E-KHO-02` chưa có tồn ở xưởng nên E2E thêm mã bằng "Thấy hàng không có trong danh sách"; các lần sau mã đã có trong danh sách.
- Global setup gọi seed phiên mẫu (một lần, khi chưa có phiên nào) để CI có phiên Chờ duyệt ở `BAI-01` cho ảnh mốc D13.
- Global setup hủy mọi phiên mở tại `XUONG-01` do tài khoản `e2e.*` bắt đầu. Nếu `XUONG-01` có phiên mở của người khác thì **dừng** với "XUONG-01 đang có phiên <mã> của <người>, hủy hoặc duyệt trước khi chạy E2E", không hủy dữ liệu người dùng.
- Ghi chung một dòng ở `CLAUDE.md` mục "Lưu ý" với việc global setup tự thêm hàng Chờ sửa `E2E-KHO-01` ở `XUONG-01` (`ensureRepairStock`, nợ từ `simple-repair`).

## Risks / Trade-offs

- **Sai vài giây quanh `created_at`** (D2) → cờ `MOVED` phủ; Giám đốc yêu cầu đếm lại dòng đó.
- **Đồng hồ máy đổi giữa lúc đếm và lúc gửi** (người dùng chỉnh giờ) → offset sai cho các mốc trước khi chỉnh. Kẹp vào khoảng phiên giới hạn sai số; hiếm.
- **Phiên mở lâu chặn vị trí** (D4) → nút Hủy; M1 luôn hiện phiên đang mở.
- **Giám đốc vừa đếm vừa duyệt** (có cả `stocktake.count` và `inventory.approve`), nên có thể tự đếm, tự duyệt → chấp nhận ở quy mô hiện tại; D13 luôn hiện "Người đếm" cạnh nút duyệt để thấy rõ.
- **Tính sổ lúc đếm bằng tổng sổ** cho mỗi dòng: tối đa vài trăm dòng mỗi phiên, có index `(item_id, condition, location_id)`; chạy một lần lúc gửi.
- **Thiết bị khác của cùng người đếm**: nháp chỉ ở máy đã đếm; mở trên máy khác thấy phiên nhưng không thấy số chưa gửi. Chấp nhận như phiếu nhập.

## Migration Plan

- Migration chỉ thêm bảng, index, trigger; không đụng dữ liệu cũ. Chạy `npm run db:migrate`.
- Rollback: xóa ba bảng mới (khi chưa có phiên `DONE`; đã có thì dòng sổ `STOCKTAKE` vẫn đứng riêng, đúng như mọi chứng từ khác).

## Open Questions

Không còn. Đã chốt khi review PR #55: Xưởng chưa đếm (D11), ngưỡng 1 % cho mọi mã (D6), quyết định kiểm kê ghi vào `docs/requirements.md` 0.2 #32 (D2).
