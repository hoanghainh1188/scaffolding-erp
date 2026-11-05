# Design: receivables

## Context

- Bốn nguồn khoản nợ đã có trong DB, đều **không sửa được sau khi phát sinh**:
  - `billing_period` (bảng chỉ ghi thêm): `rent_amount`, `adjustment_amount`, `freight_amount`, `vat_amount`, `total_amount`, `due_date`. `total_amount` có thể **âm** (điều chỉnh âm lớn hơn tiền thuê + cước, 0.2 #80).
  - `delivery_note` `POSTED` của hợp đồng bán: dòng giá và pick bị trigger khóa; tiền hàng, cước tính qua `deliveredAmounts` (`src/lib/deliveries/amounts.ts`). **Không lưu** VAT và hạn: phải đọc `contractTermsAt(ngày giao)`.
  - `compensation_note` / `buy_back_note` `APPROVED`: `amount_due`, `due_date` đã lưu, check DB bắt buộc khi duyệt.
- `overdueDebt(tx, customerId)` (`src/lib/contracts/overdue.ts`) đang trả `{0, 0}`, được gọi **trong transaction** duyệt hợp đồng, phụ lục, đền bù, mua lại và ở trang (`compensations/queries.ts`).
- Thứ tự khóa hiện có: duyệt / sửa / ghi sổ đều **khóa hợp đồng `FOR UPDATE` trước** (`lockContract`), rồi chứng từ, rồi bảng tham chiếu `FOR SHARE` (nhà thầu, công trình); chốt kỳ thêm advisory chia sẻ `rental-holidays` sau hợp đồng; ghi sổ kho `lockForPosting` sau chứng từ.
- Bảng đếm `document_counter` + `nextDocumentCode(tx, prefix, year)` (`src/lib/inventory/counter.ts`).
- Role app **không có `UPDATE`** trên bảng chỉ ghi thêm, nên **không `SELECT … FOR UPDATE` được** trên các bảng đó (PostgreSQL đòi quyền `UPDATE`). Khóa phải đặt trên bảng thường.
- `buildXlsxBook` có sẵn (nhiều sheet), dùng cho D7 và D18.
- `transition(state, "CLOSE")` đã cho `ACTIVE → CLOSED`; các dịch vụ xuất, thu hồi, chuyển, mua lại, đổi hàng đã đòi `ACTIVE` (hoặc `APPROVED`/`ACTIVE`), phụ lục dùng `transition` nên đã từ chối hợp đồng `CLOSED`.

## Goals / Non-Goals

**Goals:**

- Mọi số tiền của khoản nợ đọc từ chứng từ gốc; chỉ lưu **sự kiện tiền** (phiếu thu, phân bổ, hủy, hoàn cọc), không lưu số dư.
- Lịch sử không đổi ngược: khoản đã hiện "Đã thu đủ" chỉ mở lại khi chính phiếu đã trừ nó bị hủy.
- Hàm thuần có test cho mọi phép tính (phân bổ, quá hạn, VAT bán, cấn cọc); phần DB chỉ dựng đầu vào và ghi kết quả.

**Non-Goals:**

- Tối ưu cho hàng nghìn nhà thầu (công ty có vài chục; xem Risks).
- Sổ cái kế toán, bút toán, đối soát ngân hàng.

## Decisions

### D1. Khoản nợ là một "view" tính ra; khóa VAT của hàng bán bằng luật phụ lục

- `src/lib/receivables/debts.ts` `readDebts(db, { customerIds?, contractId? })` trả danh sách `Debt { ref, kind, customerId, contractId, contractCode, documentCode, issuedDate, dueDate, rent, freight, sale, compensation, buyBack, vat, total }`, đọc **theo lô** (một truy vấn mỗi loại + một truy vấn dòng xuất bán cho nhiều phiếu), không N+1. `ref` = `{ kind: "BILLING" | "SALE" | "COMPENSATION" | "BUY_BACK", id }`.
- Phiếu xuất bán: tiền hàng, cước qua phần dùng chung với `deliveredAmounts` (tách hàm tính từ dòng đã đọc để dùng theo lô); VAT = `vatOfSale(sale + freight, rate)` làm tròn nửa lên như `vatGroups`; hạn = ngày giao + `paymentTermsDays` của `contractTermsAt(ngày giao)`.
- **Vấn đề:** VAT và hạn của phiếu xuất bán không lưu, nên một phụ lục hiệu lực **trước** ngày giao (hợp đồng bán không có kỳ chốt chặn) sẽ đổi số nợ của hàng đã giao, kể cả khoản đã trừ đủ.
- **Đề xuất:** thêm luật phụ lục: hợp đồng bán, ngày hiệu lực phải **sau ngày giao bán gần nhất** (song song luật "sau kỳ đã chốt" của hợp đồng thuê). Kiểm ở cùng chỗ `lastClosedPeriodEnd` (`amendments.ts`, sau khi khóa hợp đồng; phiếu xuất ghi sổ cũng khóa hợp đồng nên không lọt).
  - Phương án khác: lưu `vat_rate`, `due_date` lên `delivery_note` lúc ghi sổ. Đúng nhưng phải sửa trigger khóa phiếu, migration điền ngược cho phiếu cũ, và lệch nguyên tắc "không lưu bản sao" của issue. Phụ lục lùi ngày trên hợp đồng bán đã giao gần như không có thật, nên chặn rẻ hơn.
- **Khoản giảm nợ:** kỳ có `total_amount < 0` không hiện là nợ; được dùng như một **nguồn trả trước** (D2). Kỳ `= 0` và phiếu `amount_due = 0` là khoản đã thu đủ.

### D2. Phân bổ lưu thành dòng chỉ ghi thêm (điểm cần chốt 1)

**Đề xuất:** bốn bảng mới, đều chỉ ghi thêm (trigger `*_append_only` + `APPEND_ONLY_TABLES`):

- `receipt`: `id`, `code` (`PT-YYYY-NNN`, unique), `customer_id`, `kind` (`PAYMENT` | `DEPOSIT`), `contract_id` (bắt buộc khi `DEPOSIT`, trống khi `PAYMENT`, check), `amount > 0`, `method` (`CASH` | `TRANSFER`), `received_date`, `note`, `request_id` (uuid unique, chống gửi lặp), `created_by`, `created_at`.
- `receipt_allocation`: `id`, **nguồn** đúng một trong `receipt_id` / `credit_period_id` (kỳ có tổng âm), **khoản** đúng một trong `billing_period_id` / `delivery_note_id` / `compensation_note_id` / `buy_back_note_id` (khóa ngoại thật, check "đúng một"), `amount > 0`, `mode` (`AUTO`, `MANUAL`, `PREPAYMENT`, `DEPOSIT`), `settlement_id` (chỉ khi `DEPOSIT`), `created_by`, `created_at`.
- `receipt_cancellation`: `receipt_id` (unique → hủy hai lần bị chặn ở DB), `reason`, `cancelled_by`, `cancelled_at`.
- `contract_settlement` (D4): `contract_id` unique, `settled_date`, `refund_amount ≥ 0`, `refund_date`, `refund_method` (bắt buộc khi hoàn > 0), `settled_by`, `settled_at`.

**Phân bổ còn hiệu lực** = dòng có nguồn là kỳ âm, hoặc nguồn là phiếu **không** có dòng hủy. Còn lại của khoản = phát sinh − Σ phân bổ còn hiệu lực. Không bảng nào lưu số còn lại hay số dư.

**Hủy phiếu** chỉ chèn một dòng `receipt_cancellation`; phân bổ cũ giữ nguyên nhưng hết hiệu lực. Nhờ vậy nhật ký, Excel "Phiếu thu" và màn D14 xem lại đúng phiếu đã trừ gì trước khi hủy; không có `UPDATE` nào.

**Phương án đã cân nhắc:** **tính lại phân bổ mỗi lần xem** (lấy mọi phiếu theo ngày, trừ dần vào khoản theo hạn). Không cần bảng phân bổ, nhưng:

- khoản mới có hạn sớm hơn (VD kỳ 10 chốt muộn, hạn 15/11, sau khi phiếu đã "trả" đền bù hạn 21/11) làm phân bổ cũ **dịch chuyển ngược**: khoản đã hiện "Đã thu đủ" bỗng mở lại, số quá hạn quá khứ đổi;
- không lưu được "khách chỉ định khoản khác" (0.2 #19) nếu không có bảng;
- không chứng minh được phiếu thu đã trừ gì lúc lập.

Hàm thuần `src/domain/receivables.ts`:

- `orderDebts(debts)`: thứ tự cố định (hạn, ngày phát sinh, loại BILLING < SALE < COMPENSATION < BUY_BACK, số hợp đồng, mã / tháng).
- `allocate({ amount, openDebts, manual })` → `{ allocations, unapplied }`: kiểm phần chỉ định (thuộc nhà thầu, ≤ còn lại, tổng ≤ số tiền), rồi phần còn lại trừ FIFO theo `orderDebts`.
- `applyCredits({ credits, openDebts })`: nguồn trả trước theo thứ tự (ngày thu, mã phiếu; kỳ âm theo cuối kỳ) trừ vào khoản theo `orderDebts`.

### D3. Tiền trả trước tính ra, trừ ngay khi khoản phát sinh (điểm cần chốt 2)

**Đề xuất:**

- **Không lưu số dư.** Tiền trả trước = Σ phiếu `PAYMENT` còn hiệu lực + Σ |kỳ âm| − Σ phân bổ còn hiệu lực từ các nguồn đó. Không có số cộng dồn nào để lệch; `npm run receivables:check` không cần.
- **Trừ ngay trong transaction tạo khoản** (chốt kỳ, duyệt đền bù, duyệt mua lại, ghi sổ xuất bán) và **sau khi hủy phiếu**, bằng một hàm dùng chung `settleCredits(tx, customerId)` (`src/lib/receivables/credits.ts`): khóa nhà thầu (D5), đọc khoản còn nợ + nguồn trả trước còn dư, gọi `applyCredits`, chèn dòng `PREPAYMENT`. Trả về số đã trừ để thao tác gọi ghi vào tóm tắt nhật ký.
- **Bất biến:** sau mỗi lệnh ghi, *nhà thầu có tiền trả trước > 0 thì không còn khoản nào còn nợ*. Test integration kiểm bất biến này sau mỗi lệnh trong các ca của tasks.
- Phương án **trừ lúc xem** (tính ảo, không ghi): cùng vấn đề dịch chuyển ngược ở D2, và GET không được ghi DB. Phương án **trừ khi kế toán bấm "Áp trả trước"**: thêm việc tay, dễ quên, quá hạn hiện sai trong lúc chờ. Bỏ cả hai.
- Phiếu `DEPOSIT` **không** là nguồn trả trước (0.2 #82); chỉ dùng ở thanh lý (D4).

### D4. Thanh lý (điểm cần chốt 4)

**Đề xuất** (câu hỏi Q1, Q3 trong PR):

- **Ai bấm:** Kế toán hoặc Giám đốc (quyền mới `contracts.close`). **Không cần Giám đốc duyệt riêng:** mọi số được cấn đã qua duyệt (kỳ đã chốt, đền bù / mua lại Giám đốc duyệt, cọc là tiền đã thu), phép tính là trừ thuần; Giám đốc thấy dòng "Thanh lý" trên D18 (nhóm Duyệt, ghi sổ). Bản vẽ D14b cũng là Kế toán bấm.
  - Phương án khác: Kế toán lập "đề nghị thanh lý", Giám đốc duyệt. An toàn hơn khi hoàn tiền lớn nhưng thêm trạng thái chờ, thêm màn duyệt; hoàn cọc là trả lại đúng tiền khách đã nộp. Anh chọn ở Q1.
- **Chứng từ hoàn cọc:** dòng `contract_settlement` (số hoàn, ngày, hình thức, người); **không** tạo phiếu chi (chưa có phân hệ phải trả). Cấn trừ là các dòng `receipt_allocation` `mode = DEPOSIT` từ phiếu cọc, gắn `settlement_id`. Hoàn = cọc đã nhận − Σ cấn trừ, kiểm lại trong transaction, so `expectedRefund` gửi kèm (409 nếu lệch).
- **Khoản được cấn:** chỉ khoản còn nợ của **chính hợp đồng** (mọi loại), theo `orderDebts`. Không cấn tiền trả trước, không cấn hợp đồng khác (0.2 #81, bản vẽ D14b).
- **Điều kiện:** theo spec `contract-settlement`, đọc qua các hàm đã có: `onSiteByItem` (= 0 mọi mã), danh sách tháng có tiền của `src/lib/billing/compute.ts` so với kỳ đã chốt + dòng điều chỉnh chưa chốt, đếm chứng từ chờ theo trạng thái. Hàm `settlementChecks(tx, contractId, today)` dùng chung cho D14b (hiện) và lệnh (chặn).
- **Hợp đồng bán** thanh lý được với điều kiện phiếu xuất và phụ lục (Q3). Hàng chưa giao hết không chặn: hợp đồng bán kết thúc khi hai bên thôi giao.
- **Sau thanh lý chặn:** phiếu xuất, thu hồi, chuyển đi / tới, mua lại, đổi hàng, phụ lục, sửa, hủy (các dịch vụ đã đòi `ACTIVE` / `transition`; thêm test hồi quy), phiếu cọc, dòng điều chỉnh tiền thuê (thêm kiểm ở `adjustments.ts`). Hủy phiếu cọc đã cấn: chặn (phân bổ đã gắn `settlement_id`). Hủy phiếu **Trả nợ** đã trừ khoản của hợp đồng đã thanh lý: **cho phép**, khoản mở lại thành nợ thường (hoàn cọc đã ghi không tính lại); ghi rõ trong Risks.
- **Thứ tự trong transaction:** khóa hợp đồng `FOR UPDATE` → kiểm `transition("CLOSE")` và điều kiện → khóa nhà thầu `FOR UPDATE` → đọc khoản của hợp đồng + cọc → cấn, ghi `contract_settlement`, phân bổ → đổi trạng thái → `logActivity`.

### D5. Khóa và thứ tự khóa (điểm cần chốt 3)

**Đề xuất:** **khóa dòng `customer` `FOR UPDATE`** là khóa duy nhất bảo vệ phân bổ của một nhà thầu. Mọi lệnh đổi phân bổ (ghi / hủy phiếu thu, `settleCredits`, thanh lý) lấy khóa này **trước khi đọc** khoản và phân bổ.

Thứ tự toàn cục: **hợp đồng (theo id tăng) → chứng từ → khóa sổ kho / advisory → nhà thầu.**

| Lệnh | Khóa theo thứ tự |
|---|---|
| Ghi phiếu Trả nợ | nhà thầu |
| Ghi phiếu Nộp cọc | hợp đồng `FOR SHARE` → nhà thầu |
| Hủy phiếu thu | nhà thầu |
| Chốt kỳ | hợp đồng → advisory chia sẻ ngày nghỉ → nhà thầu (`settleCredits`) |
| Duyệt đền bù | (khóa hiện có: phiếu) → nhà thầu |
| Duyệt mua lại | hợp đồng → phiếu → sổ kho → nhà thầu |
| Ghi sổ xuất bán | hợp đồng → phiếu → sổ kho → nhà thầu |
| Thanh lý | hợp đồng → nhà thầu |

- Không lệnh nào giữ khóa nhà thầu rồi mới khóa hợp đồng / chứng từ, nên không có vòng chờ (deadlock).
- **Khác với gợi ý "khóa nhà thầu trước"** trong issue: các lệnh chốt kỳ, duyệt, ghi sổ đã khóa hợp đồng trước từ các change trước; đảo lại phải sửa năm đường ghi và đọc nhà thầu không khóa để biết khóa gì. Khóa nhà thầu **cuối** cho cùng hiệu quả (mọi đọc/ghi phân bổ của nhà thầu nằm sau khóa đó) với ít thay đổi hơn. Phiếu thu không đụng hợp đồng nên với nó nhà thầu vẫn là khóa đầu tiên.
- Không khóa dòng `receipt` (bảng chỉ ghi thêm, role app không `FOR UPDATE` được); chống hủy hai lần bằng `unique(receipt_id)` của `receipt_cancellation` + kiểm sau khóa nhà thầu.
- `overdueDebt` chỉ **đọc** (không khóa nhà thầu): duyệt hợp đồng chỉ cần số cảnh báo tại lúc duyệt; một phiếu thu chen vào cùng lúc chỉ làm số nhỏ đi.
- Test `src/lib/receivables/concurrency.int.test.ts`: hai phiếu thu song song; phiếu thu song song chốt kỳ; hủy song song ghi; thanh lý song song phiếu thu; mỗi ca kiểm "không khoản nào bị trừ quá phát sinh, không phiếu nào trừ quá số tiền" và không deadlock (timeout).

### D6. Quyền (điểm cần chốt 5)

| Quyền | Vai trò | Ghi chú |
|---|---|---|
| `receivables.view` (đã có) | Giám đốc, Kế toán | D14, D14b xem, Excel, API đọc |
| `receipts.manage` (mới) | Giám đốc, Kế toán | ghi, hủy phiếu thu |
| `contracts.close` (mới) | Giám đốc, Kế toán | thanh lý |

- **Kinh doanh không xem D14** (Q2): 0.4 giao công nợ cho Kế toán; Kinh doanh đã thấy nợ quá hạn của nhà thầu trên ô kiểm tra hợp đồng (spec `contracts`). Mở cho Kinh doanh theo `canContract` sẽ phải lọc từng khoản theo loại hợp đồng và ẩn tổng của nhà thầu; để Bản 2 nếu cần.
- Thủ kho, Xưởng: không. M5 / `/api/m/deliveries` không trả tiền nợ.

### D7. D14: đọc, lọc, phân trang, Excel (điểm cần chốt 6)

- **Tính toàn bộ rồi lọc trong bộ nhớ:** `customerBalances(db, today)` đọc mọi khoản + phân bổ còn hiệu lực + nguồn trả trước của **mọi nhà thầu có chứng từ** (theo lô, ~6 truy vấn), gộp theo nhà thầu. Bốn ô tổng, số đếm của bốn lọc, sắp xếp, tìm, phân trang 50 đều làm trên kết quả này. Với vài chục – vài trăm nhà thầu và vài nghìn khoản, đây là vài chục ms, đơn giản hơn nhiều so với SQL tổng hợp có VAT bán tính bằng TS.
  - Phương án khác: view SQL / bảng tổng hợp. Phải viết VAT bán và thứ tự phân bổ hai lần (SQL và TS), dễ lệch. Để sau nếu đo thấy chậm (Risks).
- **URL:** `/receivables?filter=owing|overdue|prepaid|all&q=&page=&customer=<id>&paid=1`. Trang server component đọc `searchParams`, `await connection()` trước khi lấy hôm nay.
- **Khối nhà thầu đang chọn:** các khoản (ẩn đã thu đủ mặc định), form ghi phiếu thu (client component, xem trước bằng gọi `POST /api/receivables/receipts/preview` chạy `allocate` không ghi), cọc và bảo lãnh, phiếu thu (mới nhất trước, 20 dòng + "Xem thêm").
- **Excel** `GET /api/receivables/export?filter=&q=`: dùng cùng `customerBalances` + cùng lọc, **bỏ phân trang**; `buildXlsxBook` ba sheet theo spec. Cột tiền là số, ngày là `XlsxDate`. Giới hạn an toàn `EXPORT_MAX_ROWS` (10.000 dòng khoản), quá thì 422 "Bạn lọc hẹp lại rồi xuất".
- **API:**
  - `GET /api/receivables/customers` (danh sách + ô tổng), `GET /api/receivables/customers/[id]` (khoản, cọc, phiếu thu);
  - `POST /api/receivables/receipts` (ghi), `POST /api/receivables/receipts/preview`, `POST /api/receivables/receipts/[id]/cancel`;
  - `GET /api/receivables/contracts/[id]/settlement` (điều kiện + số), `POST …/settlement` (thanh lý);
  - đều bọc `withAuth`, kiểm đầu vào bằng schema có sẵn của dự án.

### D8. `overdueDebt` thật

- Giữ chữ ký `overdueDebt(tx, customerId): Promise<OverdueDebt>`; thêm tham số tùy chọn thứ ba `today?: BusinessDate` cho test (mặc định `toBusinessDate(new Date())`). Thân: `readDebts` của nhà thầu + phân bổ còn hiệu lực → `overdueOf(debts, today)` (hàm thuần: tổng còn lại của khoản hạn < hôm nay, số ngày = hôm nay − hạn sớm nhất trong số đó).
- Các trang gọi nó đã `await connection()` (dùng giờ hiện tại); kiểm lại trong task.

### D9. Nhật ký

- `DOCUMENT_TYPES` thêm `RECEIPT` ("Phiếu thu"); thao tác: ghi phiếu = `CREATE`, hủy = `CANCEL`, thanh lý = thao tác mới `SETTLE` ("Thanh lý", nhóm "Duyệt, ghi sổ", ô Duyệt / ghi sổ) trên loại `CONTRACT`. Không dùng `CLOSE` vì nhãn hiện có là "Đóng đơn" (đơn thu mua) và thuộc nhóm "Trả lại, hủy, xóa".
- Check DB của `activity_log` thêm `RECEIPT`, `SETTLE` trong migration; `enums.test.ts` bắt lệch.
- `settleCredits` trả số đã trừ; chốt kỳ, duyệt đền bù / mua lại, ghi sổ xuất bán nối "· trừ tiền trả trước x ₫" vào tóm tắt của dòng nhật ký sẵn có.
- `src/lib/activity/coverage.test.ts` tự bắt hàm ghi mới quên `logActivity`.

### D10. Seed và E2E

- **Seed dev:** cho Minh Phát (hợp đồng mẫu An Phú – Block B): một phiếu cọc khớp cọc tiền của hợp đồng mẫu, một phiếu Trả nợ trừ một phần khoản đền bù mẫu (nếu đã duyệt) hoặc thành tiền trả trước; chạy lại không trùng (tìm theo `request_id` cố định).
- **E2E** (`tests/e2e/receivables.spec.ts`), không làm bẩn số của ảnh mốc:
  - Kế toán mở D14, lọc, chọn nhà thầu E2E (nhà thầu mẫu của hợp đồng E2E), ghi phiếu Trả nợ **1.000 ₫** rồi hủy với lý do; kiểm theo chênh lệch (tiền trả trước / đã trừ về như cũ). Phiếu thu và hủy ở lại DB dev (chỉ ghi thêm).
  - Kinh doanh mở `/receivables` bị chặn.
  - D14b của hợp đồng thuê E2E (`E2EXUAT`, còn hàng ở công trình): điều kiện "Hàng ở công trình" chưa đạt, nút tắt. **Không thanh lý trên DB dev** (không mở lại được); thanh lý kiểm bằng integration test.
  - Xuất Excel tải file.
  - Ảnh mốc `@visual`: D14 với ô phụ thuộc ngày và số gắn `data-mask` (số đổi theo dữ liệu dev); D14b trạng thái chưa đủ điều kiện.

## Risks / Trade-offs

- [Đọc toàn bộ khoản mỗi lần mở D14] → đủ nhanh ở quy mô hiện tại; nếu > 300 ms thì thêm cache theo request hoặc view SQL; đo trong task kiểm hiệu năng với 200 nhà thầu × 30 khoản.
- [Hủy phiếu Trả nợ sau khi hợp đồng đã thanh lý làm hợp đồng còn nợ dù đã hoàn cọc] → cho phép (không chặn sửa sai), D14b / D5 hiện nợ còn lại sau thanh lý; Kế toán xử lý với khách. Ghi rõ ở hướng dẫn.
- [Dữ liệu cũ: mọi khoản phát sinh trước deploy đều thành nợ, có thể quá hạn giả] → Migration Plan: Kế toán nhập phiếu thu cũ trước khi Giám đốc dùng cảnh báo; giai đoạn đầu cảnh báo vẫn chỉ cảnh báo (0.2 #15).
- [Nhiều đường ghi gọi `settleCredits`, quên một chỗ thì bất biến D3 gãy] → test integration của từng đường (chốt kỳ, duyệt đền bù, duyệt mua lại, xuất bán) kiểm bất biến; thêm vào `coverage.test.ts` danh sách hàm tạo khoản phải gọi `settleCredits`.
- [Khóa nhà thầu `FOR UPDATE` chặn sửa thông tin nhà thầu trong lúc ghi phiếu] → khóa giữ trong một transaction ngắn; chấp nhận.
- [Phụ lục hợp đồng bán bị chặn lùi ngày] → hợp lý về nghiệp vụ; thông báo nêu ngày giao gần nhất.

## Migration Plan

1. Migration `0019_receivables.sql`: 4 bảng, check, khóa ngoại `ON DELETE RESTRICT`, trigger chỉ ghi thêm, check `activity_log`; `grants.ts` cập nhật `APPEND_ONLY_TABLES`. Không đổi bảng cũ, không điền dữ liệu.
2. Deploy: D14 hiện mọi khoản đã có, chưa trừ gì. Kế toán nhập phiếu thu các khoản đã thu (ngày thu thật), phiếu cọc đã nhận.
3. Lùi bản: bảng mới không được bảng cũ tham chiếu; bản cũ bỏ qua chúng (`overdueDebt` cũ trả 0). Không cần gỡ migration.

## Open Questions

- Không có câu hỏi kỹ thuật treo. Câu hỏi nghiệp vụ (Q1–Q5) nằm trong mô tả PR; trả lời xong ghi vào `docs/requirements.md` 0.2 trong PR này, không đổi cách làm ở trên trừ khi anh chọn phương án khác.
