# Design: returns-and-compensation

## Context

- `deliveries` đã đưa hàng ra công trình. Dòng `DELIVERY_IN` nằm ở vị trí `SITE` của hợp đồng, tình trạng Mới hoặc Tốt.
- "Đang ở công trình" hiện chỉ đọc dòng sổ của phiếu xuất (`onSiteByItem` trong `src/lib/deliveries/records.ts`). Vì vậy cột "Đã trả" của D6 luôn là 0.
- Hợp đồng đã có bảng giá đền bù theo từng bản (`contract_compensation`):
  - `lost_price` = giá mất, `damage_price` = giá "hỏng, sửa được";
  - cả hai có thể trống;
  - đọc qua `contractTermsAt`, kèm `paymentTermsDays`.
- `overdueDebt` còn là hàm chờ, trả "không nợ" cho tới change `receivables`.
- Hạ tầng: Vercel (hàm serverless, giới hạn body khoảng 4,5 MB) + Neon Postgres 17. Mỗi công ty sau này một DB (0.2 #33). Chưa có dịch vụ lưu file nào.
- Nháp điện thoại (`src/lib/drafts/`) đã có hàng chờ gửi cho phiếu nhập, kiểm kê, phiếu xuất. Chưa có nháp nào kèm file.
- CSP hiện cho `img-src 'self' blob: data:`.

## Goals / Non-Goals

**Goals:**

- Thủ kho nhập thu hồi trên M4 một lần, ghi sổ đúng giá BQ. Tổng giá trị sổ khớp `inventory:check` cả khi đổi tình trạng.
- "Đang ở công trình", "còn phải giao", "Đã trả" đúng sau thu hồi và hàng mất.
- Phiếu đền bù tự sinh theo 0.2 #20 và giá theo bản hợp đồng tại ngày trả. Giám đốc duyệt, giảm trừ có lý do.
- Phiếu đền bù đã duyệt có đủ số để `receivables` đọc mà không lưu số cộng dồn.
- Ảnh đạt mọi yêu cầu bảo mật trong comment 01/11 của issue #11.

**Non-Goals:**

- Chuyển công trình, mua lại, đổi hàng (#132).
- Cấn trừ cọc, sổ công nợ (`receivables`). Tiền thuê (`rental-billing`). Thanh lý hợp đồng.
- Sửa / hủy phiếu thu hồi đã ghi sổ. Thêm ảnh sau ghi sổ. Cước chiều về. In phiếu thu hồi.

## Decisions

### D1. Tình trạng đổi khi trả (điểm cần chốt 1)

**Rút ở công trình: Mới trước, rồi Tốt.**

- Thủ kho không phân biệt được cái nào ra đi là Mới. Hệ thống phân bổ theo thứ tự cố định.
- Các nhóm trả về được xét lần lượt Tốt → Chờ sửa → Phế liệu → Mất. Mỗi nhóm lấy hết Mới còn lại ở công trình rồi mới lấy Tốt.
- Hàm thuần `allocateReturn(onSite, line)` trong `src/domain/return-note.ts`, có unit test.
- **Vì sao:** hàng Mới đã ra công trình là đã dùng, về bãi chỉ còn Tốt (M4 không có ô "Mới"). Rút Mới trước để số "Mới đang ở công trình" không treo mãi trên sổ.
  - Tiền thuê không đổi theo cách rút, vì Mới và Tốt cùng giá thuê.
  - Phần còn lại ở công trình là Tốt.
- **Đã cân nhắc:**
  - Tốt trước: giữ Mới ở công trình lâu hơn dù hàng thật đã dùng.
  - Theo tỉ lệ: phải chia lẻ, khó đọc.
  - Thủ kho tự chọn: không làm được ở bãi.

**Giá trị khi đổi tình trạng: ra ở giá BQ cũ, vào ở giá BQ của tình trạng mới.**

- Mỗi cặp ra / vào là `RETURN_OUT` (công trình, tình trạng gốc) + `RETURN_IN` (bãi, tình trạng mới), `pairedWith` dòng ra.
- `postMovements` đã định giá đúng như vậy: dòng không đổi giá lấy giá BQ hiện tại của chính (mã + tình trạng) đó.
- Kết quả:
  - mỗi nhóm (mã + tình trạng) vẫn có giá trị = tồn × giá BQ (0.2 #24);
  - giá BQ không đổi;
  - tổng giá trị kho giảm đúng phần chênh. Đó là giá trị mất đi do hàng xuống cấp, hiện trên phiếu là "Giá trị giảm do đổi tình trạng", tính từ các dòng sổ, không lưu.
- **Vì sao:** cùng cách với phiếu điều chỉnh đổi tình trạng (`stock-adjustments`, `adjustmentMovements` loại `CONDITION`). `inventory:check` đối chiếu từng nhóm nên vẫn khớp.
- **Đã cân nhắc:** mang giá Tốt sang Chờ sửa (như dòng ra). Cách này làm đổi giá BQ của Chờ sửa, trái 0.2 #11 ("thu hồi không đổi giá BQ").

**(Mã + tình trạng) vào chưa từng có giá: lấy giá của dòng ra đi cùng.**

- Đây đúng là spec `inventory-ledger` "Dòng vào tình trạng chưa từng có giá", có sẵn scenario "Thu hồi phế liệu lần đầu".
- Hệ quả: lần đầu một mã có Phế liệu, Phế liệu mang giá Tốt (cao). Giá trị đó vào kho, chưa thành lỗ.
- Đề xuất **giữ nguyên spec**, không thêm luật giá sắt vụn ở đây. Lý do:
  - giữ một luật duy nhất cho mọi dòng không đổi giá;
  - giá phế liệu được sửa đúng ở lần sửa chữa / bán phế liệu;
  - nếu cần, sửa bằng phiếu điều chỉnh giá trị (0.2 #35).
- Nếu anh muốn Phế liệu lần đầu lấy min(kg × giá sắt vụn, giá Tốt) như 0.2 #23 thì đổi trong `postMovements` cho riêng `RETURN_IN` Phế liệu. Đây là câu hỏi mở 1.

### D2. Hàng Mất ghi bằng loại dòng sổ nào (điểm cần chốt 2)

**Loại mới `LOSS_OUT`** ở vị trí công trình, tình trạng gốc (Mới / Tốt, theo D1), số lượng âm, giá trị = số × giá BQ hiện tại, không đổi giá BQ.

- **Vì sao không dùng `ADJUST_OUT`:** `ADJUST_*` là của phiếu điều chỉnh và kiểm kê.
  - Thẻ kho, báo cáo và `rental-billing` cần phân biệt "khách làm mất" với "kho đếm lệch".
  - Tách loại thì không phải đọc thêm `document_type`.
- **Vì sao không dùng `RETURN_OUT` không có dòng vào:** dễ nhầm là hàng về bãi khi đọc sổ theo loại.
- **Giá trị mất ghi ở đâu:**
  - `amount` của dòng `LOSS_OUT` (âm) chính là giá vốn hàng mất. Tổng giá trị kho giảm đúng số này.
  - Phiếu thu hồi hiện "Giá trị hàng mất" = tổng `amount` các dòng `LOSS_OUT`, tính ra, không lưu.
  - Tiền khách đền là chuyện khác, nằm ở phiếu đền bù.
- `LOSS_OUT` thêm vào `MOVEMENTS` (`src/domain/movement.ts`), danh sách `MOVEMENTS_OUT` của schema, tạo lại check `inventory_ledger_movement_check`.
  - Nhãn thẻ kho: "Mất ở công trình".
  - `changesAverage` = false.
- Hàng mất **thôi tính thuê từ ngày trả** (0.2 #21). `rental-billing` đọc dòng `LOSS_OUT` như mọi dòng ra ở công trình.

### D3. Trạng thái phiếu và ai chuyển (điểm cần chốt 3)

**Phiếu thu hồi không có trạng thái trên server.**

- Nháp chỉ nằm trên máy. Server chỉ có phiếu khi đã ghi sổ.
- Phiếu đã ghi sổ không sửa, không hủy. Trigger chặn `UPDATE` / `DELETE` trên `return_note` và `return_note_line`. Dòng con chỉ chèn được trong transaction tạo phiếu: trigger so `return_note.posted_at = now()`, vì `now()` là giờ bắt đầu transaction.
- **Vì sao:** thu hồi diễn ra một lần khi xe hạ tải. Không có bước văn phòng lập trước như phiếu xuất. Thêm Nháp / Chờ duyệt trên server chỉ thêm việc.
- Đếm sai thì sửa tồn bằng phiếu điều chỉnh (`stock-adjustments`), còn tiền thì sửa bằng giảm trừ trên phiếu đền bù.

**Phiếu đền bù: Chờ duyệt → Đã duyệt | Đã từ chối** (`PENDING`, `APPROVED`, `REJECTED`). Chuyển qua `transition()` trong `src/domain/compensation.ts`.

- **Tự sinh lúc ghi sổ thu hồi**, cùng transaction, khi có ít nhất một số Chờ sửa / Phế liệu / Mất > 0.
- Mỗi dòng phiếu đền bù là (mã + loại):
  - loại `DAMAGED` (Chờ sửa), `SCRAPPED` (Phế liệu), `LOST` (Mất);
  - số lượng chép từ phiếu thu hồi;
  - **đơn giá chép từ bản hợp đồng tại ngày trả**: `DAMAGED` ← `damage_price`, `SCRAPPED` / `LOST` ← `lost_price`;
  - lưu `revision_id` của bản đó.
- **Sửa được trước khi duyệt** (chỉ Giám đốc):
  - đơn giá của **dòng chưa có giá** (hợp đồng để trống);
  - số tiền giảm trừ và lý do.
  - Không sửa số lượng (đến từ sổ kho). Không sửa giá đã có trong hợp đồng: muốn bớt thì dùng giảm trừ, để dấu vết rõ.
- **Từ chối**: bắt buộc lý do, phiếu thành Đã từ chối, không có tiền phải thu. Không mở lại.
  - Mỗi phiếu thu hồi chỉ có một phiếu đền bù, nên từ chối là thôi thu hẳn. D8 nhắc trước khi từ chối: "Từ chối thì không thu tiền đền bù của phiếu thu hồi này nữa."
  - Duyệt với giảm trừ là cách để thu một phần.
- **Đã cân nhắc:**
  - Kế toán lập phiếu đền bù tay: chậm, dễ sót.
  - Cho sửa số lượng trên phiếu đền bù: lệch với sổ kho.
  - Từ chối rồi trả về Chờ duyệt: không cần, giảm trừ đã đủ linh hoạt.

### D4. Lưu ảnh ở đâu (điểm cần chốt 4)

**Lưu trong Postgres, bảng `return_photo` cột `bytea`.** Ảnh đã nén lại ở server thành WebP.

- **Vì sao:**
  1. Không thêm dịch vụ, không thêm khóa bí mật, CSP không đổi (ảnh cùng tên miền, `img-src 'self'`).
  2. Gắn ảnh vào phiếu trong **cùng transaction** ghi sổ. Không có ảnh mồ côi ở kho ngoài.
  3. Sao lưu và khôi phục theo thời điểm của Neon gồm cả ảnh.
  4. Mỗi công ty một DB (0.2 #33): ảnh đi theo DB, không lẫn công ty.
  5. Kho riêng tư mặc định. Chỉ xem qua route `withAuth`.
- **Dung lượng ước tính:**
  - WebP 1.600 px chất lượng 75: khoảng 150–250 KB / ảnh;
  - 10 ảnh × 30 phiếu / tháng: khoảng 75 MB / tháng, dưới 1 GB / năm.
  - Truy vấn danh sách **không bao giờ** chọn cột `content`. Postgres để giá trị lớn ngoài bảng chính (TOAST) nên bảng vẫn nhẹ.
- **Đã cân nhắc:**
  - **Vercel Blob (store private)**: rẻ hơn khi nhiều.
    - Nhược: thêm token, CSP `connect-src`, tải lên từ trình duyệt hoặc qua server. Hai hệ thống không cùng transaction, phải dọn ảnh mồ côi.
    - Mỗi công ty sau này cần store riêng.
    - **Chuyển sang đây khi ảnh vượt khoảng 5 GB**, bằng một change riêng: giữ nguyên API xem ảnh `/api/returns/photos/[id]`, chỉ đổi chỗ đọc.
  - **S3 / R2**: như trên, thêm nhà cung cấp mới.
- **Luồng an toàn (theo comment bảo mật của #11):**
  1. **Trên điện thoại:**
     - thu nhỏ bằng canvas (cạnh dài 1.600 px, JPEG 0,8). Việc này cũng bỏ phần lớn EXIF, nhưng không được tin;
     - lưu vào nháp IndexedDB.
  2. `POST /api/m/returns/photos` (multipart: `draftId`, `clientPhotoId`, `caption`, `file`), bọc `withAuth` + `returns.receive`. Server kiểm theo thứ tự:
     - **dung lượng ≤ 4 MB** (đọc tối đa 4 MB + 1 byte rồi dừng; dưới giới hạn body của Vercel);
     - **magic bytes** JPEG (`FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`), WebP (`RIFF....WEBP`). Hàm thuần `src/domain/image-type.ts`. Không đọc đuôi file hay `Content-Type`;
     - **≤ 10 ảnh** cho mã nháp đó;
     - **`sharp`**: giải mã, giới hạn số điểm ảnh (`limitInputPixels` 40 MP, chống "bom" ảnh), `rotate()` theo EXIF rồi xuất WebP **không kèm metadata** (mặc định của `sharp`), resize 1.600 px. Giải mã lỗi trả 400.
  3. **Tên / mã ảnh** = `gen_random_uuid()` do server sinh. Tên file gửi lên bị bỏ. `(client_draft_id, client_photo_id)` unique: gửi lại cùng ảnh trả mã cũ.
  4. Ghi sổ phiếu thu hồi: trong transaction, `UPDATE return_photo SET return_note_id = … WHERE client_draft_id = … AND uploaded_by = <người ghi sổ> AND return_note_id IS NULL`.
  5. **Xem:** `GET /api/returns/photos/[id]`.
     - Bọc `withAuth`; cho người có `returns.receive` hoặc `canContract(RENTAL, view)` trên hợp đồng của phiếu.
     - Ảnh nháp chỉ người tải lên xem được.
     - Trả `image/webp`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`.
     - Không tồn tại / không quyền đều **404**, để không dò được mã.
  6. **Chỉ ghi thêm:** trigger `return_photo_frozen` chặn `DELETE` và mọi `UPDATE` khi `return_note_id` đã có (chỉ cho đổi `return_note_id` từ trống sang có một lần).
  7. **Dọn ảnh nháp bỏ dở:** mỗi lần tải ảnh, xóa ảnh `return_note_id IS NULL` cũ hơn 7 ngày (cùng bảng, không cần cron).
- **Giữ ảnh bao lâu:** **giữ cùng chứng từ, không tự xóa** ở MVP. Ảnh là bằng chứng đền bù, công nợ có thể tranh chấp lâu. Luật xóa theo năm làm sau, nếu dung lượng thành vấn đề.
- **Thư viện mới `sharp`:**
  - Next.js đã dùng `sharp` để tối ưu ảnh và nó chạy được trên Vercel.
  - Đây là thư viện xử lý ảnh, không phải thư viện UI, nhưng vẫn **cần anh đồng ý** khi duyệt.
  - Không có `sharp` thì chỉ còn cách tự viết bộ đọc / xóa EXIF cho JPEG. Cách đó không nén lại được PNG / WebP và dễ sót.

### D5. Phiếu đền bù đã duyệt lưu gì (điểm cần chốt 5)

Khi duyệt, cùng transaction, lưu trên `compensation_note`:

| Cột | Ý nghĩa |
|---|---|
| `amount_due` `bigint` | Tiền phải thu = Σ (số × đơn giá) − giảm trừ, ≥ 0 |
| `discount_amount`, `discount_reason` | Giảm trừ và lý do (lý do bắt buộc khi > 0) |
| `approval_reason` | Lý do duyệt khi nhà thầu nợ quá hạn |
| `approved_by`, `approved_at` | Người duyệt, lúc duyệt (UTC) |
| `approved_date` `date` | Ngày duyệt theo giờ Việt Nam |
| `due_date` `date` | `approved_date + payment_terms_days` của bản hợp đồng tại ngày trả (0.2 #18) |

- `receivables` đọc phiếu `APPROVED`: nhà thầu (qua hợp đồng), `amount_due`, `approved_date`, `due_date`.
- Quá hạn tính ra. Không có bảng số dư hay số cộng dồn nào.
- `amount_due` là số của **một chứng từ**, chốt lúc duyệt và bị trigger khóa, không phải số cộng dồn.
- Check DB: `status = 'APPROVED'` ⇔ `amount_due`, `approved_*`, `due_date` có giá trị.
- **Vì sao lưu `amount_due` thay vì tính lại:** đơn giá, giảm trừ đều nằm trên phiếu đã khóa nên tính lại cũng ra cùng số. Lưu sẵn để `receivables` không phải biết luật đền bù, và để có một con số đã được Giám đốc nhìn thấy khi bấm "Duyệt 3.500.000 ₫".

### D6. Hàng lạ trên phiếu thu hồi (điểm cần chốt 6)

**Chặn.** Dòng phiếu chỉ được là mã đang ở công trình **của hợp đồng này** (số đang ở công trình > 0 lúc ghi sổ). Tổng trả về + mất của mã không vượt số đó.

- Hàng của **hợp đồng khác của cùng nhà thầu**:
  - Thủ kho lập phiếu thu hồi thứ hai cho hợp đồng đó (M4 cho chọn hợp đồng khác ngay sau khi lưu, với cùng biển số).
  - Không gộp hai hợp đồng vào một phiếu, vì tiền thuê và đền bù tính theo hợp đồng.
- **Hàng không thuộc công ty** (đồ của nhà thầu, mã không có) hoặc vượt số đang ở công trình:
  - không nhận vào sổ;
  - Thủ kho ghi vào ô **ghi chú** của phiếu (VD "Xe chở thêm 10 khung của Minh Phát, đã trả lại xe") để văn phòng xử lý.
- **Vì sao:** nhận hàng lạ vào sổ làm sai tồn công ty và giá BQ, và làm "đang ở công trình" của hợp đồng âm.
- **Đã cân nhắc:** dòng "hàng lạ" ghi riêng ngoài sổ (bảng chờ xử lý). Cách này thêm một quy trình văn phòng chưa ai yêu cầu. Để `site-operations` (chuyển công trình) giải quyết trường hợp hàng của công trình khác.

### D7. Ghi sổ: một transaction, thứ tự khóa

`postReturn(db, actor, input)` trong `src/lib/returns/post.ts`:

1. **Tìm mã nháp trước** (`client_draft_id`):
   - đã có phiếu cùng người ghi → trả phiếu đó (replay, không ghi gì);
   - khác người → 409.
2. Mở transaction. **Khóa hợp đồng `FOR UPDATE`**. Cùng khóa đầu tiên với `postDelivery`, nên thu hồi và xuất của một hợp đồng chạy nối tiếp, không đọc "đang ở công trình" cũ.
3. Kiểm hợp đồng thuê `ACTIVE`, bãi `YARD` đang dùng, vị trí công trình của hợp đồng.
4. Đọc **đang ở công trình theo (mã + tình trạng)** của hợp đồng (D8).
5. Kiểm chia tình trạng, số nguyên, mã lạ, trả quá (`src/domain/return-note.ts`). Rồi `allocateReturn` dựng `MovementDraft[]`.
6. `postMovements(tx, posting, drafts)`, ngày = hôm nay giờ Việt Nam. `postMovements` tự gọi `lockForPosting` (vật tư → vị trí → giá) và chặn tồn âm.
7. Chèn `return_note` (`posted_at = now()`), `return_note_line`. Gắn ảnh.
8. Nếu có hỏng / mất:
   - `contractTermsAt(tx, contractId, ngày trả)`;
   - `compensationLines()` (hàm thuần);
   - chèn `compensation_note` `PENDING` + dòng.
9. `logActivity`:
   - "Ghi sổ PTH-…" kèm tóm tắt "trả 100 cái, mất 2 cái";
   - "Tạo ĐB-…" nếu có.

Duyệt / từ chối / sửa phiếu đền bù:

- khóa phiếu `FOR UPDATE` → kiểm `updatedAt` (409) → kiểm trạng thái → kiểm quyền / lý do → ghi → `logActivity`.
- Duyệt gọi `overdueDebt(tx, customerId)` trong transaction.

### D8. "Đang ở công trình" đọc cả phiếu thu hồi

- `onSiteByItem(tx, contractId)`: tổng `quantity` các dòng sổ có `location_id` = vị trí công trình của hợp đồng, của chứng từ thuộc hợp đồng:
  - `document_type = 'DELIVERY_NOTE'` join `delivery_note.contract_id`;
  - **hoặc** `document_type = 'RETURN_NOTE'` join `return_note.contract_id`.
  - Viết bằng `UNION ALL` hai nhánh, giữ chỉ mục `inventory_ledger_document_idx`.
- Thêm `onSiteByItemCondition` (cùng truy vấn, nhóm thêm `condition`) cho D7 bước 4 và M4.
- D6:
  - "Đã trả" = Σ |dòng ra ở công trình của phiếu thu hồi| (gồm `LOSS_OUT`);
  - "Đã xuất" giữ như cũ;
  - kiểm `đã xuất − đã trả = đang ở công trình` bằng test.
- `site-operations` sau này thêm nhánh thứ ba (phiếu chuyển công trình).

### D9. Dữ liệu (migration `drizzle/0016_returns.sql`)

- **`return_note`**
  - Cột: `id`, `code` unique, `contract_id` → `contract` RESTRICT, `site_location_id`, `yard_location_id` → `location` RESTRICT, `business_date` `date`, `vehicle_plate` (1–20), `note` (1–500), `client_draft_id` `uuid` unique not null, `posting_id` `uuid` not null, `saved_on_device_at` `timestamptz`, `posted_by` → `user`, `posted_at`.
  - Index `(contract_id)`, `(business_date)`.
- **`return_note_line`**
  - Cột: `note_id` cascade, `line_no`, `item_id` RESTRICT, `good_quantity`, `repair_quantity`, `scrap_quantity`, `lost_quantity` `numeric(14,3)` ≥ 0.
  - Check: tổng > 0.
  - Unique `(note_id, item_id)`, `(note_id, line_no)`.
- **`compensation_note`**
  - Cột: `id`, `code` unique, `return_note_id` unique → `return_note`, `contract_id`, `revision_id` → `contract_revision`, `status` check, `discount_amount` `bigint` default 0 ≥ 0, `discount_reason`, `approval_reason`, `rejected_reason` (1–500), `amount_due` `bigint`, `approved_by`, `approved_at`, `approved_date`, `due_date`, `rejected_by`, `rejected_at`, `created_at`, `updated_at`.
  - Check hình dạng theo trạng thái:
    - `APPROVED` có đủ cột duyệt;
    - `REJECTED` có lý do;
    - `PENDING` không có `amount_due`.
  - Check `discount_amount > 0` ⇒ có `discount_reason`.
- **`compensation_note_line`**
  - Cột: `note_id` cascade, `item_id`, `kind` (`DAMAGED`, `SCRAPPED`, `LOST`), `quantity` > 0, `unit_price` `bigint` ≥ 0 (trống = chưa có giá), `contract_price` `bigint` (giá trong hợp đồng lúc tạo, để nhật ký / D8 biết dòng nào nhập tay).
  - PK `(note_id, item_id, kind)`.
  - Thành tiền tính ra (`lineAmount`), không lưu.
- **`return_photo`**
  - Cột: `id` `uuid` default `gen_random_uuid()`, `client_draft_id` `uuid` not null, `client_photo_id` `uuid` not null, `return_note_id` → `return_note` (trống khi còn nháp), `position` `smallint`, `caption` (≤ 100), `content` `bytea` not null, `byte_size` `integer` (≤ 4.194.304), `width`, `height`, `uploaded_by` → `user`, `uploaded_at`.
  - Unique `(client_draft_id, client_photo_id)`.
  - Index `(return_note_id)`, `(uploaded_at) where return_note_id is null`.
- **Trigger:**
  - `return_note_frozen` (chặn UPDATE / DELETE; dòng con chỉ chèn khi `posted_at = now()`);
  - `compensation_note_frozen` (chặn UPDATE / DELETE khi `OLD.status` ≠ `PENDING`, cả dòng con);
  - `return_photo_frozen` (D4).
- **Sửa check cũ:**
  - `inventory_ledger_movement_check` thêm `LOSS_OUT`;
  - `activity_log` thêm loại chứng từ `RETURN_NOTE`, `COMPENSATION_NOTE` và thao tác `REJECT` ("Từ chối", nhóm "Trả lại, hủy, xóa").
- **Quyền DB:** các bảng mới là bảng thường (CRUD cho `erp_app`). Trigger lo phần khóa. Không thêm vào `APPEND_ONLY_TABLES`.
- **Bảng đếm** `document_counter`: tiền tố `PTH`, `ĐB` theo năm.

### D10. Đơn giá, tổng, hạn trả (hàm thuần `src/domain/compensation.ts`)

- `compensationLines(returnLines, terms)`:
  - chọn giá theo loại (0.2 #20);
  - giá trống → `unitPrice: null`;
  - bỏ dòng số 0.
- `compensationTotal(lines)`: Σ `lineAmount(quantity, unitPrice)`. Làm tròn từng dòng tới 1 ₫ (số kg lẻ vẫn ra số nguyên). Báo lỗi nếu còn dòng giá trống.
- `assertDiscount(total, discount, reason)`, `amountDue(total, discount)`.
- `dueDate(approvedDate, paymentTermsDays)`: cộng ngày theo lịch, dùng `business-date`.
- `transition(status, action)`.
- Thông báo lỗi gom một chỗ (`COMPENSATION_MESSAGES`), theo 0.2 #45.

### D11. Quyền

| Việc | Quyền |
|---|---|
| M4: danh sách hợp đồng, mở hợp đồng, gửi ảnh, lưu phiếu | `returns.receive` (DIRECTOR, WAREHOUSE) |
| M7 / M1 xem phiếu thu hồi (không giá) | `returns.receive` |
| Desktop: chi tiết phiếu thu hồi, danh sách phiếu đền bù, D8, ảnh | `canContract(user, "RENTAL", "view")` |
| Sửa đơn giá, giảm trừ, duyệt, từ chối | `compensations.approve` (DIRECTOR) |

- Không gọi `can` thẳng cho quyền xem hợp đồng. Trang gọi `requirePermission`, API bọc `withAuth`. `route-guards.test.ts` bắt route quên bọc.
- M4 / `/api/m/returns` không trả giá.
- `/api/compensations/*` không mở cho Thủ kho: Thủ kho không có `contracts.rental.view`.

### D12. API và trang

- `GET /api/m/returns/contracts?q=`: hợp đồng thuê `ACTIVE` còn hàng ở công trình (D8), không giá.
- `GET /api/m/returns/contracts/[id]`: công trình, nhà thầu, bãi chọn được, từng mã đang ở công trình (gộp Mới / Tốt), không giá.
- `POST /api/m/returns/photos`: tải ảnh (D4) → `{ id }`.
- `POST /api/m/returns`: `{ draftId, contractId, yardLocationId, vehiclePlate?, note?, savedOnDeviceAt, lines: [{ itemId, good, repair, scrap, lost }], photoIds }` → `{ code }`, kể cả khi gửi lại.
- `GET /api/m/returns/[code]`: chỉ xem cho M7, không giá.
- `GET /api/returns/[code]`: chi tiết desktop (giá trị giảm, giá trị mất tính từ sổ).
- `GET /api/returns/photos/[id]`: ảnh (D4).
- `GET /api/compensations?status=`, `GET /api/compensations/[id]`.
- `PUT /api/compensations/[id]`: `{ updatedAt, prices: [{ itemId, kind, unitPrice }], discountAmount, discountReason }`.
- `POST /api/compensations/[id]/approve`: `{ updatedAt, approvalReason? }`.
- `POST /api/compensations/[id]/reject`: `{ updatedAt, reason }`.
- Trang:
  - `/m/returns/new` (M4: bước chọn công trình → đếm), `/m/returns/[code]`;
  - `/sales/returns/[code]`, `/sales/compensations`, `/sales/compensations/[code]` (D8);
  - khối "Đền bù" trên D5;
  - D6 thêm "Đã trả" và dòng thu hồi;
  - M1 khối "Thu hồi", M7 loại "Thu hồi".
- Ô ngày (lọc danh sách) dùng `DateInput`. Tiền viết `3.915.000 ₫`.

### D13. Nháp điện thoại và ảnh chờ gửi

- `DRAFT_KINDS` thêm `RETURN`. Payload: hợp đồng, bãi, dòng, biển số, ghi chú, `savedOnDeviceAt`, danh sách ảnh `{ clientPhotoId, caption, blob, uploadedId? }`.
- IndexedDB lưu `Blob` được. Xin lưu bền (`askPersistentStorage`) như hiện có.
- Người gửi (`returnSender` trong `src/lib/drafts/outbox.ts`):
  1. Gửi từng ảnh chưa có `uploadedId`, ghi lại `uploadedId` ngay sau mỗi ảnh. Mất sóng giữa chừng thì lần sau chỉ gửi phần còn lại.
  2. Gửi lưu phiếu kèm `photoIds`.
  3. Lỗi 4xx (trả quá, mã lạ) → nháp thành `REJECTED` với thông báo của server để Thủ kho sửa. Lỗi mạng / 5xx → thử lại.
- Nháp cũ hơn 3 ngày được nhắc như các loại khác (`STALE_AFTER_MS`).
- Mỗi lần đổi số (+ / −) lưu nháp ngay.

## Risks / Trade-offs

- **[Ảnh trong DB làm DB to]** → Ước tính < 1 GB / năm. Danh sách không chọn `content`. Có đường chuyển sang kho đối tượng (D4) mà không đổi API xem ảnh.
- **[`sharp` là gói native]** → Next.js đã dựa vào nó, Vercel hỗ trợ sẵn. Test CI chạy trên Linux như Vercel. Thêm test tích hợp xử lý ảnh thật (JPEG có EXIF GPS).
- **[Thu hồi chặn mã lạ làm Thủ kho phải lập nhiều phiếu]** → M4 cho lập phiếu tiếp theo cho hợp đồng khác ngay sau khi lưu, giữ biển số.
- **[Phân bổ Mới trước có thể khác thực tế]** → Không ảnh hưởng tiền thuê. Giá trị chênh Mới → Tốt vẫn ghi đúng là giá trị giảm.
- **[Phế liệu lần đầu mang giá Tốt]** → Theo spec hiện có (D1). Có câu hỏi mở 1 để đổi nếu anh muốn.
- **[Phiếu thu hồi không sửa được]** → Giống phiếu nhập và phiếu xuất. Sai thì điều chỉnh tồn + giảm trừ đền bù. Ghi rõ ở "Ngoài phạm vi".
- **[Body 4,5 MB của Vercel]** → Mỗi ảnh một request ≤ 4 MB. Lưu phiếu chỉ gửi JSON.
- **[`overdueDebt` còn là hàm chờ]** → Cảnh báo nợ quá hạn chỉ thật khi có `receivables`. Test dùng bản giả trả nợ quá hạn.

## Migration Plan

1. Migration `0016_returns.sql` chạy bằng owner (`npm run db:migrate`). `db:migrate` tự cấp quyền cho `erp_app`.
2. Không đổi dòng sổ cũ. Check mới chỉ nới thêm giá trị (`LOSS_OUT`, `RETURN_NOTE`, `COMPENSATION_NOTE`, `REJECT`).
3. Thêm `sharp` vào `dependencies`. Tạo lại lock bằng npm 11.19 (lưu ý `@emnapi`).
4. Seed dev: phiếu thu hồi An Phú – Block B + phiếu đền bù Chờ duyệt như D8, có 2 ảnh mẫu tạo bằng `sharp` (ô màu, không ảnh thật).
5. Quay lui: deploy bản trước. Bảng mới không ai đọc. Check nới thêm không cản bản cũ.

## Open Questions

1. **Phế liệu lần đầu** (D1): giữ luật hiện có (lấy giá dòng ra), hay lấy min(kg × giá sắt vụn, giá Tốt) như phế liệu từ sửa chữa (0.2 #23)? Đề xuất: **giữ luật hiện có**.
2. **`sharp`** (D4): anh đồng ý thêm thư viện này không? Đề xuất: **có**.
3. **Kinh doanh xem D8**: hiện theo quyền xem hợp đồng thuê, nên Kinh doanh (phạm vi có cho thuê) xem được phiếu đền bù và ảnh, không duyệt được. Có cần giới hạn hơn không? Đề xuất: **giữ**, để người phụ trách hợp đồng giải thích với khách.
