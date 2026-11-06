# Design: payables — Công nợ phải trả người bán

## Context

- Phiếu nhập (`goods-receipt`) đã tính tiền hàng mỗi chuyến bằng `receiptGoodsAmount` (`src/domain/receipt-cost.ts`): số thực nhận theo đơn vị dòng đơn (dòng kg lấy kg cân) × đơn giá dòng đơn, làm tròn từng dòng. D3b cộng cùng số đó thành "Phải trả người bán" (`orderReceivingSummary`, `src/domain/receiving-summary.ts`). Không lưu tiền trên phiếu.
- Phải thu (`receivables`) đã có khuôn: khoản nợ tính ra, phiếu thu / phân bổ / dòng hủy chỉ ghi thêm, tiền trả trước tính ra và tự trừ trong transaction tạo khoản (`settleCredits`), khóa nhà thầu `FOR UPDATE` cuối cùng (`lockCustomer`), hàm thuần ở `src/domain/receivables.ts`.
- 0.2 #98–#106 (chốt 06/11/2026; #102–#106 khi review PR #152) và bản vẽ D14c đã duyệt. Nhà cung cấp chưa có số ngày được nợ; nhà thầu có `payment_terms_days` (0–365).
- Phiếu nhập ghi sổ bởi Thủ kho trên M3 (`postReceipt`): khóa đơn `FOR UPDATE` → bãi `FOR SHARE` → khóa của `postMovements`.

## Goals / Non-Goals

**Goals**

- Khoản phải trả = phiếu nhập đã ghi sổ, số tiền tính ra bằng đúng hàm tiền hàng đang có.
- Phiếu chi chỉ ghi thêm, trừ khoản theo thứ tự cố định, ứng trước tính ra và tự trừ khi nhập.
- Không đường nào đổi được tiền của khoản đã phát sinh.
- D14c, Excel, quyền, nhật ký như D14.
- Phải thu không đổi hành vi.

**Non-Goals**

- VAT đầu vào, phải trả nhà xe / bốc xếp, đề nghị chi, duyệt chi, in phiếu chi, bù trừ phải thu – phải trả, trả lại hàng mua, nhập nợ cũ (xem proposal "Ngoài phạm vi").

## Decisions

### D1. Phần lõi phân bổ dùng chung với phải thu (điểm cần chốt 1)

**Đề xuất:** tách phần không phụ thuộc loại khoản ra `src/domain/allocation.ts`, `receivables.ts` gọi lại nó và **giữ nguyên mọi chữ ký, thông báo, mã lỗi**.

`src/domain/allocation.ts` (hàm thuần, generic):

- `allocateOrdered<D extends { key; remaining; label }>({ amount, debts, manual, seen, messages, fail })` → `{ allocations: { debtKey, amount, mode: "AUTO" | "MANUAL" }[], unapplied }`. `debts` **đã sắp** theo thứ tự cố định của bên gọi. Phần chỉ định trước (kiểm thuộc người, ≤ còn lại, tổng ≤ số tiền, 409 khi `seen` cho thấy bị phiếu khác lấy), rồi FIFO. `messages` và `fail(message, status)` do bên gọi đưa vào, nên phải thu vẫn ném `ReceivableRuleError` với đúng chữ cũ.
- `applyCreditsOrdered({ credits, debts })`: nguồn theo `orderSources` (ngày, mã), khoản theo thứ tự đã sắp.
- `orderSources`, `overdueOf`, `dueSoonOf`, `dueStatus(remaining, due, today, paidLabel)` (chuyển nguyên từ `receivables.ts`, thêm tham số nhãn "Đã thu đủ" / "Đã trả đủ"), `holderStatus({ debts, credit, today, labels })` (luật cột Tình hình của D14 với `DUE_SOON_DAYS` = 7; `customerStatus` của phải thu và `supplierStatus` của phải trả cùng gọi, chỉ khác nhãn "Trả trước" / "Đã ứng trước").

`src/domain/receivables.ts`: `allocate`, `applyCredits`, `debtStatus`, `overdueOf`, `dueSoonOf`, `orderSources` thành lớp mỏng: sắp bằng `orderDebts` rồi gọi lõi. Kiểu `OpenDebt`, `Allocation`, `CreditSource`… giữ nguyên tên và export.

`src/domain/payables.ts`: `comparePayables` (hạn, ngày nhập, mã phiếu nhập), `allocatePayment`, `applyAdvances`, `payableStatus` ("Đã trả đủ"…), `supplierStatus` (luật D14c, D2), `PAYMENT_KINDS` (`PAYMENT` Trả tiền hàng, `ADVANCE` Ứng trước), `PAYABLE_MESSAGES`, `termsLabel` ("trả ngay" / "nợ N ngày"), `goodsSummary` (cột hàng).

- **Kiểm không đổi hành vi:** mọi test `src/domain/receivables.test.ts` và integration `src/lib/receivables/*.int.test.ts` chạy **không sửa một dòng**; thêm `allocation.test.ts` cho lõi. PR apply không được sửa file test phải thu cũ (task kiểm bằng `git diff --stat`).
- **Phương án đã cân nhắc:**
  - *Chép riêng một bản cho phải trả:* nhanh, không đụng phải thu, nhưng hai bản FIFO / chỉ định / 409 sẽ lệch dần khi sửa lỗi một bên. Bỏ.
  - *Tổng quát hóa thẳng `receivables.ts` (kiểu `DebtKind` thành generic):* đổi kiểu mà hơn 20 file phải thu đang import; rủi ro đổi hành vi cao hơn. Bỏ.
  - *Gộp bảng phân bổ chung cho thu và chi:* khóa ngoại "đúng một trong sáu cột", quyền và trigger phức tạp, vẫn phải tách ở mọi truy vấn. Bỏ: chỉ dùng chung hàm thuần, bảng tách riêng.

### D2. Khoản phải trả và hạn trả

- **Khoản = phiếu nhập đã ghi sổ** có số phát sinh > 0. Khóa của khoản = `goods_receipt.id`.
- **Số phát sinh:** hàm thuần mới `receiptPayable(lines)` trong `src/domain/receipt-cost.ts` = Σ `receiptGoodsAmount(line, line, unitPrice)` của các dòng. Không có công thức thứ hai:
  - `costTrip(...).goods` lúc ghi sổ và `receiptPayable` của phiếu đọc lại phải bằng nhau (test);
  - Σ `receiptPayable` các phiếu của đơn = `orderReceivingSummary(...).payable` của D3b (test, cả dòng kg và dòng chia tình trạng).
- **Đọc:** `readPayables(db, { supplierId? })` (`src/lib/payables/debts.ts`): một truy vấn lấy dòng phiếu nhập + `purchase_order_line.unit_price`, `unit` + đơn vị vật tư, gộp bằng `receiptPayable` trong TS. Phân bổ còn hiệu lực = dòng `supplier_payment_allocation` có phiếu chi **không** có dòng hủy.
- **Hạn trả lưu trên phiếu nhập** (điểm "lưu hay đọc lại" trong issue): cột mới `goods_receipt.due_date`, `postReceipt` điền = ngày nhập + `supplier.payment_terms_days` lúc ghi sổ.
  - Lý do: 0.2 #99 "đổi số ngày chỉ áp cho phiếu nhập sau" cần biết số ngày **tại lúc nhập**; đọc lại từ nhà cung cấp làm hạn của mọi phiếu cũ đổi theo. Giống kỳ tiền thuê lưu `due_date` khi chốt.
  - Phương án khác: lưu lịch sử số ngày được nợ của nhà cung cấp rồi tra theo ngày nhập. Thêm một bảng và một phép tra cho mỗi khoản, không lợi gì hơn. Bỏ.
  - Hạn không phải tiền nên không trái quy ước "không lưu tiền trên phiếu nhập".
- **Tình hình người bán** (D14c, 0.2 #104): **cùng luật D14** qua `holderStatus` của lõi chung: "Quá hạn N ngày" → khoản hạn sớm nhất trong 7 ngày tới (hạn ≤ hôm nay + 7): "Hạn dd/mm" → còn nợ, hạn xa hơn: "Chưa đến hạn" → chỉ có ứng trước: "Đã ứng trước" → "Hết nợ". Bản vẽ D14c đã sửa dòng Hưng Thịnh (hạn 20/11, hôm nay 06/11) thành "Chưa đến hạn".

### D3. Phiếu chi, phân bổ, ứng trước

**Bảng mới, đều chỉ ghi thêm** (trigger `*_append_only` + `APPEND_ONLY_TABLES`):

- `supplier_payment`: `id`, `code` (`PC-YYYY-NNN`, unique, `nextDocumentCode(tx, "PC", năm)` qua `document_counter`), `supplier_id` (FK restrict), `kind` (`PAYMENT` | `ADVANCE`), `amount > 0`, `method` (`CASH` | `TRANSFER`), `paid_date`, `note` (1–500 hoặc null), `request_id` (uuid unique, chống gửi lặp), `created_by`, `created_at`. Index (`supplier_id`, `paid_date`).
- `supplier_payment_allocation`: `id`, `payment_id` (FK), `goods_receipt_id` (FK), `amount > 0`, `mode` (`AUTO` | `MANUAL` | `ADVANCE`), `created_by`, `created_at`. Index theo `payment_id`, `goods_receipt_id`. Trigger `supplier_payment_allocation_same_supplier`: nhà cung cấp của phiếu chi = nhà cung cấp của đơn của phiếu nhập.
- `supplier_payment_cancellation`: `payment_id` (PK → hủy hai lần bị chặn ở DB), `reason` (1–500), `cancelled_by`, `cancelled_at`.

**Luật:**

- **Trả tiền hàng:** `allocatePayment` (chỉ định trước, rồi FIFO theo `comparePayables`); phần dư = ứng trước.
- **Ứng trước:** chỉ nhận khi người bán **không còn khoản còn phải trả** (0.2 #102). Nhờ vậy bất biến giống phải thu: *người bán có ứng trước > 0 thì không còn khoản nào còn nợ*, và loại phiếu chỉ khác ở cách ghi (không có phần chỉ định, nhãn "Ứng trước" trên danh sách, nhật ký).
  - Phương án khác: cho ứng khi còn nợ, tiền ứng chỉ trừ vào phiếu nhập **ghi sổ sau ngày ứng**. Phải gắn nguồn với khoản theo ngày, bất biến gãy (vừa nợ quá hạn vừa có ứng trước), D14c khó đọc. Bỏ (0.2 #102).
- **Tiền ứng trước tính ra** = Σ phiếu chi còn hiệu lực − Σ phân bổ còn hiệu lực từ chúng. Không lưu số dư.
- **`settleAdvances(tx, supplierId, actor, today)`** (`src/lib/payables/advances.ts`), như `settleCredits`: khóa nhà cung cấp (D4), đọc khoản còn nợ + nguồn còn dư, `applyAdvances`, chèn dòng `mode = ADVANCE`, trả số đã trừ.
  - Gọi trong `postReceipt` (sau ghi phiếu, sổ kho, trạng thái đơn, trước `logActivity` để nối "· trừ tiền ứng trước x ₫") và trong `cancelPayment` (sau khi chèn dòng hủy).
  - Test tĩnh `src/lib/payables/settle-coverage.test.ts`: `receiving/post.ts` (`postReceipt`) và `payables/payments.ts` (`cancelPayment`) phải import và `await settleAdvances(`. Đường tạo khoản phải trả mới sau này thêm vào danh sách.
- **Hủy:** chèn `supplier_payment_cancellation`; phân bổ cũ giữ, hết hiệu lực; rồi `settleAdvances`. Kiểm hủy hai lần sau khóa nhà cung cấp (thông báo có giờ và người hủy) và nhờ PK.
- **Xem trước** `POST /api/payables/payments/preview`: chạy `allocatePayment` trên số đọc được, không ghi. Form gửi kèm `seen` (còn lại đã thấy của khoản chỉ định) để phân biệt 409 (bị phiếu khác lấy) với 422 (nhập quá).

### D4. Thứ tự khóa (điểm cần chốt 2)

**Đề xuất:** khóa dòng `supplier` `FOR UPDATE` là khóa duy nhất bảo vệ phân bổ của một người bán, và luôn là **khóa cuối** (`lockSupplier`, `src/lib/payables/common.ts`; `insertAllocations` nhận kết quả của `lockSupplier` nên không gọi được khi chưa khóa, như `insertAllocations` của phải thu).

| Lệnh | Khóa theo thứ tự |
|---|---|
| Ghi phiếu chi | nhà cung cấp |
| Hủy phiếu chi | nhà cung cấp |
| Ghi sổ phiếu nhập | đơn `FOR UPDATE` → bãi `FOR SHARE` → khóa sổ kho (`postMovements`) → nhà cung cấp (`settleAdvances`) |
| Sửa nhà cung cấp (D16) | nhà cung cấp (như hiện nay) |

- Không lệnh nào giữ khóa nhà cung cấp rồi khóa đơn / sổ kho, nên không có vòng chờ. Tạo / sửa đơn đã khóa đơn rồi mới `FOR SHARE` nhà cung cấp, cùng chiều.
- `postReceipt` đọc `payment_terms_days` **không khóa** ở đầu lệnh để tính hạn. Một lần sửa số ngày chen vào cùng lúc chỉ quyết định phiếu này lấy số cũ hay mới; cả hai đều đúng với 0.2 #99.
- Không `FOR UPDATE` trên bảng chỉ ghi thêm (role app không có `UPDATE`); đọc phân bổ sau khóa nhà cung cấp là đủ (READ COMMITTED đọc dữ liệu mới nhất sau khi có khóa).
- Test `src/lib/payables/concurrency.int.test.ts` (chạy bằng `erp_app`): hai phiếu chi song song; phiếu chi song song ghi sổ phiếu nhập có ứng trước; hủy song song ghi; mỗi ca kiểm "không khoản nào bị trừ quá phát sinh, không phiếu nào trừ quá số tiền", bất biến ứng trước, và không deadlock (timeout).

### D5. Không đường nào đổi tiền của khoản đã phát sinh (điểm cần chốt 3)

Số phát sinh phụ thuộc: dòng phiếu nhập (số, kg cân, trạng thái), đơn giá / đơn vị / vật tư của dòng đơn, đơn vị vật tư. Rà các đường:

| Đường | Hiện nay | Change này |
|---|---|---|
| Sửa đơn khi đã có phiếu nhập | `editableFields` = `SCHEDULE` (chỉ ngày, giờ, xe, ghi chú); thay dòng chỉ có ở chế độ `ALL` (xóa rồi chèn), và FK `goods_receipt_line → purchase_order_line` chặn xóa dòng đã nhận | **thêm trigger** `purchase_order_line_received_locked`: `BEFORE UPDATE` đổi `unit_price`, `unit`, `item_id` khi có `goods_receipt_line` tham chiếu → lỗi (chặn cả lỗi code sau này) |
| Sửa phiếu nhập | không có đường sửa; bảng vẫn cho role app `UPDATE`/`DELETE` | **thêm `goods_receipt`, `goods_receipt_line`, `goods_receipt_cost` vào `APPEND_ONLY_TABLES`** + trigger chỉ ghi thêm. Không có code nào `UPDATE`/`DELETE` các bảng này (đã rà); dọn test đã dùng owner (`src/test/catalog.ts`) |
| Điều chỉnh giá trị `ĐCG` (sửa chi phí chuyến) | chỉ ghi dòng `REVALUE` vào sổ kho | không đổi: phải trả không đọc sổ kho, không đọc chi phí chuyến (test) |
| Đổi đơn vị / trọng lượng chuẩn vật tư | đơn vị vật tư không đổi khi đã có sổ (spec `item-catalog`) | không đổi; `needsWeighing` dùng đơn vị dòng đơn + đơn vị vật tư |
| Giá sắt vụn mới | chỉ chia giá trị theo tình trạng (giá vốn) | không vào phải trả |

- Phương án khác: chụp số phát sinh vào cột `goods_receipt.payable_amount` lúc ghi sổ. Trái yêu cầu "không lưu bản sao", và vẫn phải khóa phiếu để cột đó không bị sửa. Bỏ.

### D6. Quyền (điểm cần chốt 4)

| Quyền | Vai trò | Dùng cho |
|---|---|---|
| `payables.view` (mới) | Giám đốc, Kế toán | D14c, API đọc, Excel |
| `payments.manage` (mới) | Giám đốc, Kế toán | ghi, xem trước, hủy phiếu chi |

- Kinh doanh, Thủ kho, Xưởng: không (ui.md "Kinh doanh không thấy Công nợ phải trả"). Menu Công nợ hiện khi có `receivables.view` **hoặc** `payables.view`, mở tab đầu tiên được xem; thanh tab chỉ hiện tab có quyền.
- **Thủ kho trả tiền mặt lúc nhận hàng:** Thủ kho **không** ghi phiếu chi. Thủ kho báo Kế toán; Kế toán ghi phiếu chi Tiền mặt với **ngày chi = ngày trả thật** (cho phép ngày quá khứ), chỉ định phiếu nhập đó. Lý do: phiếu chi là tiền ra của công ty, một người giữ sổ quỹ; M3 không hiện tiền (spec `goods-receipts`). Phương án khác: thêm ô "Đã trả tiền mặt x ₫" trên M3 tạo phiếu chi tự động: lộ tiền ở mobile, thủ kho phải nhập số tiền khớp tiền hàng mà không thấy tiền hàng. Bỏ (0.2 #103).
- Giám đốc có cả hai quyền (như `receipts.manage`): đứng thay khi Kế toán nghỉ.

### D7. CCCD và số tài khoản (điểm cần chốt 5)

- API D14c và Excel chỉ chọn số đã che, dùng lại hàm che của danh mục (`src/lib/catalog/partners.ts`, dạng `•••• •••• 2345`, `•••• 5678`). Không có route nào của `payables` trả số đầy đủ; form sửa D16 vẫn là chỗ duy nhất.
- Hiện "STK •••• 5678 · <ngân hàng>" ở đầu khối người bán (Kế toán chuyển khoản cần biết đúng tài khoản; số đầy đủ xem ở form sửa D16).
- Test: phản hồi `GET /api/payables/suppliers/[id]` và nội dung file Excel (giải nén, tìm chuỗi) không chứa số đầy đủ.

### D8. D14c, API, Excel

- **Tính toàn bộ rồi lọc trong bộ nhớ**, như D14 (`customerBalances`): `supplierBalances(db, today)` đọc mọi khoản + phân bổ + phiếu chi theo lô, gộp theo người bán; ô tổng, số đếm lọc, sắp xếp, tìm (cột `search_text` sẵn có), phân trang 50 làm trên kết quả.
- **URL:** `/payables?filter=owing|overdue|advance|all&q=&page=&supplier=<id>&paid=1`. Server component, `requirePermission("payables.view")`, `await connection()` trước khi lấy hôm nay.
- **Thanh tab** `src/components/finance/ledger-tabs.tsx` dùng cho D14 và D14c; `navigation.ts` đánh dấu Công nợ ở `/receivables*` và `/payables*`.
- **API** (đều `withAuth`, kiểm đầu vào bằng schema sẵn có):
  - `GET /api/payables/suppliers?filter=&q=&page=` → `{ tiles, counts, rows, page, pages }`;
  - `GET /api/payables/suppliers/[id]?paid=` → `{ supplier (che), payables[], payments[] (20, cursor) }`;
  - `POST /api/payables/payments` `{ requestId, supplierId, kind, amount, method, paidDate, note?, manual?: [{ goodsReceiptId, amount, seen }] }` → `{ code, allocations, advance }`;
  - `POST /api/payables/payments/preview` (cùng body, không ghi);
  - `POST /api/payables/payments/[id]/cancel` `{ reason }`;
  - `GET /api/payables/export?filter=&q=` → xlsx.
- **Excel** `cong-no-phai-tra-<YYYY-MM-DD>.xlsx` bằng `buildXlsxBook`, cùng lọc, bỏ phân trang, giới hạn `EXPORT_MAX_ROWS` như D14:
  - "Theo người bán": mã, tên, loại, CCCD (che), số tài khoản (che), ngân hàng, số ngày được nợ, còn phải trả, quá hạn, số ngày quá hạn, đã ứng trước.
  - "Các khoản": người bán, phiếu nhập, đơn mua, chuyến, ngày nhập, tiền hàng, đã trả, còn lại, hạn, số ngày quá hạn.
  - "Phiếu chi": mã, ngày chi, người bán, loại, hình thức, số tiền, đã trừ vào, còn giữ ứng trước, trạng thái, lý do hủy, người ghi.
  - Tiền là ô số nguyên, ngày là `XlsxDate`.

### D9. Nhật ký

- `DOCUMENT_TYPES` thêm `SUPPLIER_PAYMENT` ("Phiếu chi"); ghi = `CREATE`, hủy = `CANCEL`. Check DB của `activity_log` thêm loại trong migration; `enums.test.ts` bắt lệch.
- `postReceipt` nối `prepaymentSuffix`-kiểu "· trừ tiền ứng trước x ₫" vào tóm tắt sẵn có.
- Sửa số ngày được nợ đi qua `diffFields` của nhà cung cấp như các trường khác.
- `src/lib/activity/coverage.test.ts` tự bắt `recordPayment`, `cancelPayment` nếu quên `logActivity`.

### D10. Seed, ảnh mốc và E2E (điểm cần chốt 6)

- **Seed dev** (mã yêu cầu cố định, chạy lại không thêm): đặt số ngày được nợ 30 cho một nhà cung cấp công ty mẫu; một phiếu chi Trả tiền hàng trả một phần chuyến 1 của đơn D3b mẫu; một phiếu Ứng trước cho một nhà cung cấp cá nhân mẫu chưa có khoản. **Không thêm nhà cung cấp** (ảnh mốc D16 đếm số).
- **E2E** `tests/e2e/payables.spec.ts`, không làm bẩn ảnh mốc:
  - Kế toán mở D14 → bấm tab Phải trả → D14c; chọn nhà cung cấp Hòa Phát mẫu (của đơn E2E); ghi phiếu Trả tiền hàng **1.000 ₫** rồi hủy với lý do. Phiếu và dòng hủy ở lại DB dev (chỉ ghi thêm).
  - Kiểm **trên dòng của chính phiếu đó** ("Đã trừ vào …", rồi "Đã hủy · <lý do>"), không kiểm tổng của Hòa Phát: `receiving.spec.ts` chạy song song có thể ghi sổ phiếu nhập mới cho Hòa Phát.
  - Kinh doanh mở `/payables` bị chặn, không thấy tab.
  - Xuất Excel tải file.
  - Sửa số ngày được nợ trên D16: **không** (đổi hạn phiếu nhập E2E sau đó); kiểm bằng integration test.
- **Ảnh mốc `@visual`:** D14c với `q=khong-ai-ca-e2e` (bảng trống, không phụ thuộc dữ liệu), ô tổng và ngày gắn `data-mask`; D14 chụp lại (có thanh tab); D16 chụp lại (thêm dòng số ngày được nợ). Gắn nhãn `update-snapshots` khi apply.

### D11. Migration `0021_payables.sql`

1. `supplier.payment_terms_days integer not null default 0` + check 0–365.
2. `goods_receipt.due_date date`: thêm cột, `update … set due_date = business_date`, `set not null`. **Trước** khi tạo trigger chỉ ghi thêm.
3. Ba bảng phiếu chi, check, FK `ON DELETE RESTRICT`, index, trigger `*_append_only` (UPDATE / DELETE / TRUNCATE), trigger cùng nhà cung cấp.
4. Trigger chỉ ghi thêm cho `goods_receipt`, `goods_receipt_line`, `goods_receipt_cost`; trigger khóa giá `purchase_order_line`.
   - **TRUNCATE khi dọn test:** hàm trigger của cả **sáu** bảng theo đúng mẫu `scrap_price_append_only` (`0005_goods_receipts.sql`) / `0003_inventory_ledger.sql`: `TG_OP = 'TRUNCATE'` và `inventory_truncate_allowed(current_database(), current_setting('inventory.allow_truncate', true))` thì `RETURN NULL` (cho qua); còn lại `RAISE`. UPDATE / DELETE luôn bị chặn. Nhờ vậy `src/test/catalog.ts` (truncate `goods_receipt_cost`, `goods_receipt_line`, `goods_receipt` trong `truncateWithLedger`, có `set local inventory.allow_truncate = 'on'`) và dọn bảng phiếu chi trong test vẫn chạy; DB thật không bật cờ nên TRUNCATE bị chặn.
5. Check `activity_log.document_type` thêm `SUPPLIER_PAYMENT`.
6. `src/db/grants.ts`: thêm 6 bảng vào `APPEND_ONLY_TABLES` (test chống lệch bắt quên).

## Risks / Trade-offs

- [Phiếu nhập cũ thành nợ quá hạn ngay khi deploy] → hiện chỉ có dữ liệu demo; Migration Plan bước 2 (0.2 #105). Nợ đầu kỳ thật nhập ở `data-migration` (#48).
- [Khóa phiếu nhập ở DB chặn sửa tay dữ liệu sai] → đúng ý: sai số tiền sửa bằng `ĐCG` (giá vốn) hoặc phiếu chi; sửa tay chỉ owner làm được sau khi tắt trigger, có ghi chép.
- [Ghi sổ phiếu nhập thêm một khóa nhà cung cấp] → transaction ngắn; chỉ chạm người bán của đơn; hai thủ kho nhập hai đơn của cùng người bán sẽ chạy lần lượt ở bước cuối, chấp nhận.
- [Tách lõi phân bổ làm đổi phải thu ngoài ý muốn] → test phải thu cũ không sửa và phải xanh; review diff `receivables.ts` chỉ còn lớp mỏng.
- [Đọc toàn bộ khoản mỗi lần mở D14c] → như D14; đo với 200 người bán × 50 phiếu nhập trong task hiệu năng.
- [Người vừa là nhà thầu vừa là người bán] → hai sổ tách; bù trừ để sau (Ngoài phạm vi).

## Migration Plan

1. Chạy `0021_payables.sql` bằng owner; `db:migrate` cấp lại quyền (6 bảng mất `UPDATE`/`DELETE`).
2. Deploy: D14c hiện mọi phiếu nhập đã ghi sổ là khoản còn nợ, hạn = ngày nhập. Kế toán đặt số ngày được nợ cho người bán (chỉ áp phiếu sau), rồi ghi phiếu chi cho các khoản đã trả (ngày chi thật).
3. Lùi bản: bảng mới không được bảng cũ tham chiếu; cột mới có mặc định. Bản cũ chạy được; trigger chỉ ghi thêm trên phiếu nhập không cản bản cũ (bản cũ không sửa phiếu nhập).

## Open Questions

Không còn câu hỏi treo. Q1–Q5 của PR #152 đã chốt ngày 06/11/2026, ghi ở `docs/requirements.md` 0.2 #102–#106 (Q1 theo đề xuất, Q2 theo đề xuất, Q3 **theo luật D14**, không theo bản vẽ cũ; Q4 theo đề xuất; Q5 đồng ý).
