# Design: contracts

## Context

- Danh mục đã có giá thuê ngày mặc định và **hai giá đền bù mặc định** (mất, hỏng sửa được) trên `item` (`daily_rental_price`, `lost_price`, `damage_price`), bộ (`kit`, `kit_component`), nhà thầu có `payment_terms_days` và `sales_user_id`, công trình gắn một nhà thầu (`site.customer_id`).
- `company_profile.short_name` có sẵn nhưng **cho phép trống**.
- `document_counter (prefix, year, last_number)` cấp số trong transaction bằng upsert (`nextDocumentCode`); chưa có chỗ nào cho mã không theo năm.
- Bảng quyền duy nhất `src/domain/permissions.ts`, quyền theo **vai trò** (mỗi người một vai trò, 0.5 #6). Chưa có quyền theo từng người.
- Chưa có công nợ (`receivables`) nên chưa có "nợ quá hạn"; chưa có kỳ tính tiền (`rental-billing`) nên chưa có "kỳ đã chốt"; chưa có phiếu xuất (`deliveries`).
- Thiết kế D4 vẽ trước 0.2 #40, còn số kiểu `HĐ-2026-041` và nhãn "Bán & Thuê": khi code dùng số theo 0.2 #40 và nhãn 0.2 #43 như D5, D5a.

## Goals / Non-Goals

**Goals:**
- Một mô hình dữ liệu cho hợp đồng **và** phụ lục, tra được "bản áp dụng tại ngày X" bằng một truy vấn đơn giản.
- Mọi luật tính (số ngày thuê, tối thiểu 45 ngày, giá trị dự kiến, giá tháng hiển thị, cảnh báo bảo lãnh, kiểm ngày hiệu lực, số hợp đồng) là **hàm thuần** trong `src/domain`, có unit test, để `rental-billing` dùng lại.
- Chừa chỗ (hàm chờ) cho nợ quá hạn và kỳ đã chốt, để `receivables`/`rental-billing` chỉ thay thân hàm, không sửa luồng duyệt.

**Non-Goals:**
- Không tính tiền thuê theo kỳ, không ghi công nợ, không ghi sổ kho.
- Không làm quyền theo từng hợp đồng (VD chỉ người phụ trách mới sửa được); người phụ trách chỉ để lọc và báo cáo (như 0.2 #41, spec `partner-directory`).

## Decisions

### D1. Trạng thái hợp đồng và phụ lục; ai chuyển (điểm cần chốt 1)

**Hợp đồng:** `DRAFT` (Nháp/báo giá) → `PENDING` (Chờ duyệt) → `APPROVED` (Đã duyệt) → `ACTIVE` (Đang thực hiện) → `CLOSED` (Thanh lý); thêm `CANCELLED` (Đã hủy).

| Chuyển | Ai | Điều kiện |
|---|---|---|
| tạo → `DRAFT` | quyền sửa loại đó | – |
| `DRAFT` → `PENDING` (Gửi duyệt) | quyền sửa loại đó | đủ dữ liệu bắt buộc (spec "Kiểm tra trước khi gửi duyệt") |
| `PENDING` → `APPROVED` (Duyệt) | `contracts.approve` | nợ quá hạn > 0 thì bắt buộc lý do |
| `PENDING` → `DRAFT` (Trả lại) | `contracts.approve` | bắt buộc lý do |
| `DRAFT` → `CANCELLED` | quyền sửa loại đó | lý do |
| `APPROVED` → `CANCELLED` | `contracts.approve` | chưa có phiếu xuất (`hasDeliveries` trả `false` tới change `deliveries`); phụ lục Nháp/Chờ duyệt bị hủy cùng transaction, mỗi phụ lục một dòng nhật ký Hủy "Hợp đồng đã hủy" |
| `APPROVED` → `ACTIVE` | hệ thống, change `deliveries` | phiếu xuất đầu tiên ghi sổ |
| `ACTIVE` → `CLOSED` | change `returns-and-compensation` / `receivables` | thanh lý |

- **"Từ chối" = Trả lại về Nháp**, không có trạng thái `REJECTED` cuối. Lý do: thực tế báo giá bị chê thì Kinh doanh sửa giá và gửi lại; một trạng thái chết buộc tạo hợp đồng mới, mất số đã in cho khách. Lý do trả lại lưu ở `contract_revision.returned_reason` (lần gần nhất) và trong nhật ký (đủ lịch sử). Khách không lấy thì **Hủy** (giữ số, vì báo giá đã in).
- **Không xóa nháp**: số đã có thể in cho khách; hủy giữ dấu vết, D4 xếp vào "Đã kết thúc".
- Bảng chuyển trong `transition()` ở `src/domain/contract.ts` như `purchase-order.ts`; service gọi nó sau khi khóa `FOR UPDATE`.
- **Loại và nhà thầu khóa từ lần lưu đầu** (số đã mang tên khách, D7): lệnh sửa nháp đổi `type` hoặc `customer_id` bị từ chối, người lập hủy nháp và lập mới. Công trình đổi được khi còn Nháp (vẫn của nhà thầu đó), khóa từ lúc gửi duyệt. Vì nhà thầu không đổi nên người phụ trách chỉ chép một lần lúc tạo.
- `ACTIVE`, `CLOSED` chỉ khai báo ở change này (có trong check của DB, `transition()` và nhãn), chưa có lệnh nào chuyển tới.

**Phụ lục:** `DRAFT` → `PENDING` → `APPROVED`; `PENDING` → `DRAFT` (Trả lại); `DRAFT`/`PENDING` → `CANCELLED`. Không có `ACTIVE`/`CLOSED`. Đã duyệt thì không sửa, không hủy (muốn đổi thì phụ lục mới). Mọi lệnh trên phụ lục khóa hợp đồng `FOR UPDATE` trước rồi mới khóa bản phụ lục, và từ chối khi hợp đồng không còn `APPROVED`/`ACTIVE` (VD đã hủy trong lúc phụ lục chờ duyệt). Mỗi hợp đồng **tối đa một phụ lục chưa xong**: tránh hai phụ lục chồng ngày hiệu lực và tránh tranh số; kiểm bằng unique một phần `(contract_id) where kind = 'AMENDMENT' and status in ('DRAFT','PENDING')`.

Đã cân nhắc: cho Kinh doanh tự "rút lại" hợp đồng Chờ duyệt. Bỏ: thêm một chuyển nữa trong khi Giám đốc trả lại là đủ; thêm sau nếu cần.

### D2. Lưu phụ lục: mỗi bản là một bộ đầy đủ ("revision") (điểm cần chốt 2)

Bảng `contract_revision`: **bản gốc** (`number = 0`, `kind = 'ORIGINAL'`) và mỗi **phụ lục** (`number = 1, 2...`, `kind = 'AMENDMENT'`). Mỗi bản giữ **toàn bộ** nội dung đổi được: điều khoản, dòng hàng, bộ, giá đền bù, cọc, kế hoạch giao. Lập phụ lục = **chép** bản đang áp dụng mới nhất thành bản mới rồi sửa.

- **Tra giá ngày X** = lấy bản `APPROVED` có `effective_from ≤ X` lớn nhất (bản gốc `effective_from = start_date`; X trước ngày bắt đầu vẫn lấy bản gốc). Một truy vấn `order by effective_from desc, number desc limit 1`, rồi đọc dòng của bản đó. **Hai bản cùng ngày hiệu lực thì bản số lớn hơn thắng** (lập sau, đã thấy bản trước). Chọn xếp thêm `number` thay vì bắt ngày hiệu lực sau hẳn, vì phụ lục cùng ngày bắt đầu (sửa giá trước khi giao hàng) hoặc hai phụ lục cùng ngày là có thật; luật `≥` giữ nguyên, kết quả vẫn xác định. Hàm thuần `revisionAt(revisions, date)` ở `src/domain/contract-revision.ts` để unit test; service `contractTermsAt(tx, contractId, date)` ở `src/lib/contracts/terms.ts` cho `rental-billing`.
- Ngày hiệu lực của phụ lục **thuộc bản mới** (giá mới tính từ chính ngày đó), khớp D5b "Từ 15/12/2026 · Giá mới".
- D5b "Hiện tại ↔ Mới" = so bản mới với bản nó chép từ (`based_on_revision_id`); hàm thuần `diffRevisions` dùng chung cho D5b, kiểm "chưa có thay đổi nào" và tóm tắt nhật ký. `diffRevisions` **cấm** đổi loại, nhà thầu, công trình, ngày ký, ngày bắt đầu (một câu báo chung) và bỏ dòng hàng; ngày bắt đầu là `effective_from` của bản gốc nên đổi nó làm sai cách tra giá. Ngày kết thúc dự kiến mới phải **sau** ngày hiệu lực.
- Nội dung của bản `APPROVED` bị **trigger khóa** (UPDATE/DELETE dòng con, UPDATE cột nội dung của bản), như phiếu sửa chữa đã ghi sổ. Trigger xét **`OLD.status = 'APPROVED'`**: chính lệnh duyệt (UPDATE từ `PENDING` sang `APPROVED`, ghi `approved_by/at`, `approval_reason`, `overdue_*`) đi qua được; mọi UPDATE sau đó, kể cả `approval_reason`, bị chặn. Cột trạng thái của `contract` vẫn đổi được (`ACTIVE`, `CLOSED`).

Đã cân nhắc:
- *Bảng phụ lục chỉ lưu dòng thay đổi* (delta): gọn hơn nhưng tra giá ngày X phải cộng dồn mọi delta trước X theo từng mã, và hiện "Hiện tại" phải tính lại; dễ sai khi phụ lục đổi cả giá đền bù, cọc, VAT. Bỏ.
- *Dòng hợp đồng có `valid_from`/`valid_to`*: phải đóng `valid_to` của dòng cũ khi duyệt (UPDATE dòng đã duyệt) và khó gom các thay đổi không phải dòng hàng (VAT, cọc). Bỏ.
- Chép đầy đủ tốn vài chục dòng mỗi phụ lục: không đáng kể (hợp đồng thường < 30 mã, vài phụ lục).

### D3. Nợ quá hạn khi chưa có `receivables`: hàm chờ (điểm cần chốt 3)

`src/lib/contracts/overdue.ts`: `overdueDebt(tx, customerId): Promise<{ amount: bigint; days: number }>`. Change này trả `{ amount: 0n, days: 0 }` kèm chú thích "thay ở change receivables". Luồng duyệt hợp đồng **và** phụ lục gọi hàm này **trong transaction duyệt** (sau khi khóa hợp đồng), và luật thuần `approvalReasonRequired(overdue, reason)` (`src/domain/contract.ts`) quyết định có bắt buộc lý do. Lý do, số nợ, số ngày lưu ở bản được duyệt (`approval_reason`, `overdue_amount`, `overdue_days`).

- Ô "Nhà thầu đang nợ quá hạn" trên D5a/D5 đọc cùng hàm: hôm nay luôn không hiện.
- Test "duyệt khi nợ quá hạn bắt buộc lý do": unit test luật thuần đủ ca; integration test thay hàm bằng `vi.mock` trả 96.000.000 ₫ / 7 ngày để kiểm luồng đầy đủ (từ chối không lý do, lưu lý do, cờ nhật ký).

Đã cân nhắc: bỏ hẳn tới `receivables`. Bỏ phương án này: luật 0.2 #15 nằm trong luồng duyệt hợp đồng; làm sau thì phải mở lại service, giao diện duyệt và test của change này. Hàm chờ khiến `receivables` chỉ thay thân hàm.

### D4. Bảng giá đền bù chung nằm ở danh mục vật tư (điểm cần chốt 4)

**Bảng chung = cột `lost_price`, `damage_price` của `item`** (đã có từ `master-data`, spec `item-catalog` "Giá đền bù mặc định" đã nói hợp đồng lấy hai giá này làm gợi ý). Người sửa: quyền `items.manage` (Giám đốc, Kinh doanh) như hiện nay, sửa ở D9. Không thêm bảng hay màn mới.

- Hợp đồng **chép** giá vào `contract_compensation` (`lost_price`, `damage_price`) và lưu kèm giá bảng chung lúc chép (`catalog_lost_price`, `catalog_damage_price`) để đánh dấu "khác bảng chung" mà không phụ thuộc giá danh mục hiện tại (0.2 #49).
- "Lấy lại bảng chung" (chỉ khi Nháp hoặc trong phụ lục Nháp) chép lại giá hiện tại của danh mục.

Đã cân nhắc: một bảng `compensation_price_list` riêng trong Cài đặt, chỉ Giám đốc sửa. Bỏ: trùng với cột đã có, phải chuyển dữ liệu, thêm một màn. Nếu sau muốn chỉ Giám đốc sửa giá đền bù thì tách quyền ở D9, không đổi mô hình. Giá khác bảng chung luôn hiện cho Giám đốc khi duyệt nên Kinh doanh sửa giá chung cũng không lọt.

### D5. Mẫu in lấy thông tin công ty từ `company_profile` (điểm cần chốt 5)

- Trang in `/sales/contracts/[id]/print` (server component, `requirePermission` theo loại) đọc `company_profile` qua `src/lib/company` (quyền `company.read`) và nội dung bản đang hiện. **Không viết cứng** tên, MST, địa chỉ, tài khoản, logo (0.2 #33 quy ước 4). Thiếu logo thì in chữ; thiếu trường nào thì bỏ dòng đó.
- Nút "In báo giá"/"In hợp đồng" mở trang in và gọi `printDocument({ title })` (chỗ in duy nhất), CSS `@media print` dùng token. Tiêu đề: Nháp/Chờ duyệt → "Báo giá <số>"; đã duyệt trở đi → "Hợp đồng <số>"; phụ lục in "Phụ lục <số phụ lục>" với bảng hiện tại ↔ mới.
- Không sinh PDF ở server, không lưu bản in: in lại luôn ra theo dữ liệu hiện tại (nội dung bản đã duyệt bị khóa nên không đổi; chỉ đầu trang công ty có thể mới hơn, đúng ý "đổi tên công ty thì in tên mới").

Đã cân nhắc: chụp thông tin công ty vào hợp đồng lúc duyệt. Bỏ ở MVP: chưa có yêu cầu in lại đúng y bản cũ; thêm sau được bằng một cột JSON.

### D6. Kế hoạch giao theo đợt chỉ là dự kiến (điểm cần chốt 6)

`contract_delivery_batch` (thứ tự, ngày dự kiến, ghi chú) + `contract_delivery_batch_line` (bộ **hoặc** mã + số lượng). Dùng cho: báo giá in, ô "Kho đủ hàng Tốt cho đợt 1", và **gợi ý** khi lập phiếu xuất ở `deliveries`.

- **Không ràng buộc**: phiếu xuất không phải khớp đợt, ngày hay số; 0.2 #17 (xuất thiếu thì phần thiếu chuyển đợt sau) là luật của phiếu xuất, `deliveries` tự giữ "còn phải giao". Không giữ hàng, không ghi sổ kho.
- Lý do: thực tế ngày giao đổi theo tiến độ công trình; ràng buộc cứng buộc lập phụ lục chỉ để dời ngày giao. Kế hoạch vẫn đổi được qua phụ lục cho có dấu vết, nhưng phiếu xuất không cần chờ.

Đã cân nhắc: phiếu xuất bắt buộc chọn đợt và không vượt số đợt. Bỏ vì lý do trên; `deliveries` có thể thêm "xuất theo đợt" như một gợi ý.

### D7. Số hợp đồng và số phụ lục

- Hàm thuần `src/domain/contract-code.ts`:
  - `codeToken(text)`: bỏ dấu (gồm `Đ/đ` → `D`), viết hoa, chỉ giữ `A–Z0–9`; rỗng → lỗi. Tối đa 20 ký tự.
  - `contractCodeBase({ month, year, companyShort, customerToken })` → `112026/ANPHAT-MINHPHAT`.
  - `contractCode(base, n)` → `n = 1`: `base`; `n ≥ 2`: `base-n`. Token chỉ có chữ và số nên hậu tố `-n` không lẫn.
  - `amendmentCode(contractCode, n)` → `<code>/01` (hai chữ số, ≥ 100 thì ba).
- Cấp số trong transaction tạo: `document_counter` với `prefix = 'HĐ:' + <VIẾT_TẮT>-<KHÁCH>` và `year = YYYY × 100 + MM` (VD `202611`). Upsert khóa dòng đếm nên hai lệnh cùng gốc ra hai số (spec "Lưu cùng lúc"). `numbering.ts` ghi chú rằng cột `year` ở đây chứa **năm-tháng**, và tự upsert + định dạng bằng `contractCode`, **không** gọi `nextDocumentCode`/`formatDocumentCode` (hàm đó ra kiểu `PN-2026-001`). Không dùng `SEQUENCE` (0.2 #33 quy ước 1). Cột `contract.code` unique là lớp chặn thứ hai.
- `MMYYYY` theo **ngày bắt đầu** (thuê từ ngày / ngày giao), vì D5 ghi `112026/...` cho hợp đồng gửi 25/10 bắt đầu 01/11. Số cấp lúc lưu lần đầu, không đổi sau (báo giá đã in mang số).
- Phần khách mặc định: token của hợp đồng gần nhất của nhà thầu, nếu không có thì mã nhà thầu bỏ gạch (`NT0003`). Người lập sửa được trước khi lưu lần đầu (D5a "Sửa được phần tên khách").
- Phụ lục: `contract.last_amendment_number` tăng trong transaction sau `SELECT … FOR UPDATE` hợp đồng; unique `(contract_id, number)`. Không dùng `document_counter` vì số phụ lục theo từng hợp đồng, dòng hợp đồng đã bị khóa sẵn trong lệnh.

Đã cân nhắc: tháng theo ngày ký (ngày ký có thể chưa có khi báo giá), tháng theo ngày tạo (lệch với D5). Bỏ.

### D8. Tách quyền thuê / bán: quyền theo loại + phạm vi của tài khoản Kinh doanh

Bảng quyền thêm: `contracts.rental.view`, `contracts.sale.view` (Giám đốc, Kế toán, Kinh doanh), `contracts.rental.manage`, `contracts.sale.manage` (Giám đốc, Kinh doanh), `contracts.approve` (Giám đốc). "manage" = tạo, sửa nháp, gửi duyệt, hủy nháp, lập và gửi phụ lục.

Chỉ quyền theo vai trò **không** tách được "người hàng thuê" với "người hàng bán" vì cả hai cùng vai trò Kinh doanh (0.5 #6). Thêm cột `user.contract_scope` (`ALL` | `RENTAL` | `SALE`, mặc định `ALL`), Giám đốc đặt ở D17, **chỉ có tác dụng với `SALES`**. Một hàm duy nhất trong `permissions.ts`:

```ts
canContract(user: { role; contractScope }, type: "RENTAL" | "SALE", action: "view" | "manage"): boolean
```

= `can(role, "contracts.<type>.<action>")` và (role ≠ `SALES` hoặc scope = `ALL` hoặc scope = type). API dùng `withAuth` rồi gọi `canContract` sau khi đọc loại hợp đồng; danh sách lọc `type in (loại được xem)` trong câu truy vấn; trang gọi `requireContractAccess(contract, action)`. `current-user` đọc `contract_scope` mỗi yêu cầu như vai trò (spec "Quyền đọc từ dữ liệu hiện tại").

Đã cân nhắc:
- *Tách vai trò Kinh doanh thành hai vai trò*: đổi 0.2 #6 (5 vai trò), mọi chỗ đọc `SALES` (mua hàng, danh mục) phải xét lại. Bỏ.
- *Quyền theo từng người tổng quát* (bảng `user_permission`): mạnh nhưng phá "bảng quyền duy nhất". Bỏ ở MVP.
- **Đã chốt** khi review PR #128 (02/11/2026): dùng phạm vi theo tài khoản như trên, ghi ở `docs/requirements.md` 0.2 #51.

### D9. Dòng hàng, bộ và bán theo kg

- `contract_kit (revision_id, kit_id, quantity)`: bộ người lập thêm, để hiện "Bộ × 300 · tự tách thành linh kiện" và in báo giá. Linh kiện ra `contract_line`.
- `contract_line` hợp đồng **thuê**: một dòng mỗi mã (unique `(revision_id, item_id)`), `own_quantity` (thêm lẻ) và số theo bộ tính lại từ `contract_kit` × `kit_component` lúc lưu (`quantity` lưu sẵn = lẻ + theo bộ; hàm thuần `explodeKits`). Lý do một dòng mỗi mã: tiền thuê tính theo mã ở công trình, một mã chỉ có một giá. Thành phần bộ lấy theo danh mục lúc lưu; bản đã duyệt bị khóa nên bộ đổi sau không ảnh hưởng.
- `contract_line` hợp đồng **bán**: `condition` (`NEW` | `GOOD` | `SCRAP`), `pricing_unit` (`ITEM` = đơn vị của mã | `KG`), unique `(revision_id, item_id, condition, pricing_unit)`. `SCRAP` bắt buộc `KG`; `KG` cần mã có `standard_weight_kg` hoặc mã đơn vị kg. Tiền dòng = `round(số × đơn giá)` bằng bigint (số lượng `numeric(14,3)` nhân ×1000), 0,5 lên.
- Giá: `price` (bigint ₫, ≥ 0) và `catalog_price` (giá thuê danh mục lúc thêm, null với hợp đồng bán vì danh mục chưa có giá bán).
- Hợp đồng thuê không có tình trạng ở dòng: chọn Mới/Tốt lúc xuất (`deliveries`), cùng một giá.

### D10. Công thức tiền thuê một chỗ: `src/domain/rental.ts`

- `DEFAULT_MIN_RENTAL_DAYS = 45` (0.2 #39) — **chỗ duy nhất** chứa 45; hợp đồng lưu `min_rental_days` khởi tạo từ hằng này (0.2 #33 quy ước 5).
- `rentalDays(issueDate, returnDate)` = số ngày lịch giữa hai ngày nghiệp vụ (`returnDate − issueDate`), dùng `business-date.ts`.
- `chargeableDays(days, minDays, quantity)` = `quantity = 0` ? 0 : max(days, minDays).
- `rentAmount({ dailyPrice, quantity, days })` bigint, làm tròn 1 ₫ với số lượng lẻ (kg, m).
- `expectedValue(dailyTotal, startDate, endDate, minDays)` cho D5/D5a; `monthDisplay(dailyTotal)` trả hai số **× 30 và × 31** cho dòng "tháng 30 ngày ≈ …, tháng 31 ngày ≈ …". Không có hàm nào chia 30.
- Đổi giá giữa chừng (spec "Đổi giá giữa chừng") là ví dụ để `rental-billing` ghép `rentAmount` theo đoạn ngày của từng bản; change này chỉ có unit test của hàm thuần, chưa có đoạn ngày từ phiếu xuất.
- 45 ngày tính cho **một lượng hàng từ lúc xuất tới lúc trả** như spec; câu hỏi 0.2b Q2 (theo đợt hay cả hợp đồng) có thể đổi cách `rental-billing` gom, không đổi hàm thuần.
- Chưa chốt (để `rental-billing`): hàng trả trước 45 ngày mà khoảng thuê đi qua ngày hiệu lực phụ lục thì **ngày bù cho đủ 45** tính giá nào (giá ngày trả, giá ngày cuối của 45 ngày, hay giá bản gốc). Ghi ở Workflow follow-up của tasks.

### D11. Kỳ đã chốt khi chưa có `rental-billing`: hàm chờ

`src/lib/contracts/billing-lock.ts`: `lastClosedPeriodEnd(tx, contractId): Promise<string | null>` trả `null`. Luật thuần `assertEffectiveDate(effectiveFrom, { contractStart, lastApprovedEffective, lastClosedEnd })` ở `src/domain/contract-revision.ts`: không trước ngày bắt đầu, không trước phụ lục đã duyệt gần nhất, **phải sau** `lastClosedEnd`. Gọi lúc lưu, gửi duyệt và **lúc duyệt** (kỳ có thể chốt trong lúc chờ). Integration test thay hàm bằng `vi.mock` trả `2026-11-30`.

### D12. Bảo lãnh: `src/domain/guarantee.ts`

`guaranteeWarnings({ expiryDate, today, contractEndDate })` → danh sách `EXPIRING` (0 ≤ còn ≤ `GUARANTEE_WARNING_DAYS = 30`), `EXPIRED` (hết hạn < hôm nay), `ENDS_BEFORE_CONTRACT` (hết hạn < ngày kết thúc dự kiến). "Hôm nay" theo `Asia/Ho_Chi_Minh`; trang dùng `new Date()` thì `await connection()` trước. D4 tính cảnh báo cho hợp đồng `APPROVED`/`ACTIVE` từ cọc của bản đang áp dụng hôm nay. Không chặn gửi hay duyệt (0.2 #50).

### D13. Dữ liệu (migration `drizzle/0014_contracts.sql`)

| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `contract` | `id`, `code` unique, `type` (`RENTAL`/`SALE`), `customer_id`, `site_id` null, `status`, `sales_user_id` null, `customer_token`, `last_amendment_number` int default 0, `created_by`, `created_at`, `updated_at` | FK `ON DELETE RESTRICT` tới `customer`, `site`, `user`; check `type`, `status`; check `type = 'SALE' or site_id is not null`; index `(status)`, `(customer_id)`, `(site_id)`, `(sales_user_id)` |
| `contract_revision` | `id`, `contract_id`, `number`, `kind` (`ORIGINAL`/`AMENDMENT`), `code`, `status`, `based_on_revision_id` null, `effective_from` date, `reason`, `signed_date`, `start_date`, `end_date` null, `min_rental_days` null, `billing_cycle` null (`MONTH_END`), `payment_terms_days`, `vat_enabled`, `vat_rate numeric(5,2)` null, `company_truck` bool, `freight_per_trip` bigint null, `note`, `submitted_by/at`, `approved_by/at`, `approval_reason`, `overdue_amount` bigint, `overdue_days`, `returned_reason`, `cancelled_reason`, `updated_at` | unique `(contract_id, number)`; unique một phần một phụ lục chưa xong; check VAT (bật thì 0 < rate ≤ 20, tắt thì null), `payment_terms_days 0–365`, `min_rental_days 1–365` (thuê) / null (bán), `end_date > start_date` |
| `contract_kit` | `revision_id`, `kit_id`, `quantity` int ≥ 1 | PK `(revision_id, kit_id)`, FK cascade theo bản, restrict tới `kit` |
| `contract_line` | `id`, `revision_id`, `item_id`, `condition` null, `pricing_unit`, `own_quantity`, `quantity numeric(14,3)` > 0, `price` bigint ≥ 0 null (nháp), `catalog_price` null | unique như D9 (hai unique một phần theo loại) |
| `contract_compensation` | `revision_id`, `item_id`, `lost_price`, `damage_price` (null khi nháp chưa nhập), `catalog_lost_price`, `catalog_damage_price` | PK `(revision_id, item_id)` |
| `contract_deposit` | `id`, `revision_id`, `kind` (`CASH`/`GUARANTEE`), `amount` bigint > 0, `method` (`CASH`/`TRANSFER`) null, `bank_name`, `guarantee_number`, `expiry_date` | check theo `kind` (cọc tiền có `method`; bảo lãnh đủ 4 trường). **Không có ngày nhận**: hợp đồng chỉ lưu khoản cọc thỏa thuận; cọc thường nhận sau khi ký, mà bản đã duyệt bị khóa, nên ghi nhận tiền đã nhận thuộc `receivables` |
| `contract_delivery_batch` | `id`, `revision_id`, `seq`, `planned_date`, `note` | unique `(revision_id, seq)` |
| `contract_delivery_batch_line` | `batch_id`, `kit_id` null, `item_id` null, `quantity` > 0 | check đúng một trong `kit_id`, `item_id` |
| `user` | thêm `contract_scope text not null default 'ALL'` | check `in ('ALL','RENTAL','SALE')` |

- Trigger `contract_revision_locked` (xét `OLD.status = 'APPROVED'`, D2): chặn mọi UPDATE và DELETE của bản đã duyệt, cho qua lệnh duyệt `PENDING → APPROVED`; chặn INSERT/UPDATE/DELETE dòng con (`contract_kit`, `contract_line`, `contract_compensation`, `contract_deposit`, `contract_delivery_batch*`) của bản `APPROVED`.
- Không phải bảng chỉ ghi thêm, nên **không** vào `APPEND_ONLY_TABLES`; `db:migrate` cấp CRUD cho `erp_app` như bảng thường.
- `DOCUMENT_TYPES` thêm `CONTRACT`, `CONTRACT_AMENDMENT`; cùng migration bỏ và tạo lại `activity_log_document_type_check` với hai giá trị mới (như `0013_catalog_extensions.sql`).

### D14. API và trang

| Route | Việc | Quyền |
|---|---|---|
| `GET /api/contracts` | danh sách D4 (lọc `type`, `status`, `customerId`, `siteId`, `salesUserId`, `q`, con trỏ) + ô đếm | `canContract(view)` theo từng loại |
| `POST /api/contracts` | tạo nháp, cấp số | `manage` loại gửi lên |
| `GET /api/contracts/code-preview` | gợi ý gốc số + phần khách | `manage` |
| `GET /api/contracts/[id]` | chi tiết D5 (bản gốc + các phụ lục + kiểm tra) | `view` |
| `PUT /api/contracts/[id]` | sửa nháp, kèm `updatedAt` (409 khi lệch) | `manage` |
| `POST /api/contracts/[id]/submit` \| `/approve` \| `/return` \| `/cancel` | chuyển trạng thái | `manage` / `contracts.approve` |
| `GET /api/contracts/[id]/terms?date=YYYY-MM-DD` | bản áp dụng tại ngày | `view` |
| `POST /api/contracts/[id]/amendments` | lập phụ lục (chép bản mới nhất) | `manage` |
| `PUT /api/contracts/[id]/amendments/[n]` + `/submit` \| `/approve` \| `/return` \| `/cancel` | như hợp đồng | như trên |

- Mỗi lệnh ghi: một transaction, `SELECT … FOR UPDATE` hợp đồng (và bản đang sửa) **trước** khi kiểm; danh mục được tham chiếu (vật tư, bộ, nhà thầu, công trình) giữ `FOR SHARE`; `logActivity(tx, actor, …)` cuối transaction; sửa không đổi trường thì không ghi.
- Lỗi dùng envelope có sẵn (`api-response.ts`), câu chữ theo 0.2 #45.
- Trang: `/sales` chuyển tới `/sales/contracts` (D4); `/sales/contracts/new`, `/sales/contracts/[id]` (D5), `/sales/contracts/[id]/edit` (D5a khi Nháp), `/sales/contracts/[id]/amendments/[n]` (D5b), `/sales/contracts/[id]/print`. Ô ngày `DateInput`. Dòng hàng là bảng (desktop).

## Risks / Trade-offs

- [Phạm vi theo tài khoản là cơ chế quyền thứ hai ngoài bảng quyền] → gói trong một hàm `canContract` ở `permissions.ts`; mở rộng `route-guards.test.ts` để route `/api/contracts/**` phải gọi nó; test chéo thuê ↔ bán ở cả trang và API.
- [Hàm chờ nợ quá hạn và kỳ đã chốt luôn trả "không có" → cảnh báo không bao giờ hiện thật trước `receivables`] → ghi rõ trong tasks và issue #33 (kiểm tay sau); `receivables`/`rental-billing` có task thay thân hàm và chạy lại test luồng.
- [Chép đầy đủ mỗi phụ lục: sửa bản nháp phải ghi lại toàn bộ dòng con] → service xóa–chèn dòng con của bản **nháp** trong transaction; bản đã duyệt bị trigger khóa nên không thể lỡ tay.
- [Số theo ngày bắt đầu: báo giá sớm cho công trình tháng sau mang tháng sau] → đúng như D5; người lập thấy số xem trước trước khi lưu.
- [D4 thiết kế cũ còn số `HĐ-2026-…`] → làm theo spec; ảnh mốc tạo trên CI theo dữ liệu seed mới.
- [Hợp đồng bán chưa có giá danh mục] → nhập tay; ghi ngoài phạm vi.

## Migration Plan

1. `drizzle/0014_contracts.sql` chỉ **thêm** bảng, cột `user.contract_scope` (mặc định `ALL` nên tài khoản cũ không mất quyền), trigger. Chạy `npm run db:migrate` (owner), quyền cho `erp_app` tự cấp.
2. Không chuyển dữ liệu: hợp đồng thật từ Excel thuộc change `data-migration`.
3. Seed dev thêm hợp đồng mẫu D5 (Chờ duyệt), một hợp đồng đã duyệt có phụ lục `/01` nháp (D5b), một hợp đồng bán; cần `company_profile.short_name` mẫu.
4. Lùi: migration mới không đụng bảng cũ; bỏ được bằng migration xóa các bảng `contract*` và cột `contract_scope` khi chưa có change sau dùng.

## Open Questions

- Mẫu in có cần ô chữ ký, điều khoản pháp lý cố định (văn bản dài) không? Change này in khối nội dung + ô ghi chú; văn bản điều khoản chung đặt sau vào Cài đặt công ty nếu chủ cần — không đổi spec hay task.
