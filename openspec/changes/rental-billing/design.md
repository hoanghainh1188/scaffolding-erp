# Design: rental-billing

## Context

- Sổ kho đã có đủ dòng "giao" và "trả" của hợp đồng thuê, mỗi dòng có `business_date` (0.2 #55): phiếu xuất (`DELIVERY_IN`), phiếu thu hồi (`RETURN_OUT`, `LOSS_OUT`), phiếu chuyển công trình (`TRANSFER_OUT/IN`, thuộc hợp đồng theo **dấu dòng**), phiếu mua lại đã duyệt (`SALE_OUT`). Nghĩa từng loại với tiền thuê đã chốt ở design D11 của `site-operations`.
- `siteMovements(tx, contractId)` (`src/lib/deliveries/records.ts`) cộng các dòng đó theo (mã + tình trạng + loại dòng) nhưng **không có ngày**, nên tiền thuê cần một hàm đọc dòng có ngày, cùng điều kiện nối.
- Hàm thuần đã có ở `src/domain/rental.ts`: `rentAmount` (làm tròn nửa lên tới 1 ₫), `DEFAULT_MIN_RENTAL_DAYS`. `contractTermsAt` (`src/lib/contracts/terms.ts`) cho giá ngày, VAT, tối thiểu, hạn thanh toán của bản đang áp dụng tại một ngày; `readRevisions` + `revisionAt` cho mọi bản đã duyệt.
- `lastClosedPeriodEnd` (`src/lib/contracts/billing-lock.ts`) đang trả `null`; `amendments.ts` gọi nó **sau khi khóa hợp đồng `FOR UPDATE`** để chặn ngày hiệu lực trong kỳ đã chốt.
- Ngày nghiệp vụ không ghi lùi được: mọi chứng từ của hợp đồng mang ngày ghi sổ (hôm nay). Vì vậy khi kỳ đã hết thì sổ kho của kỳ đó **không còn đổi**.
- Excel dùng `buildXlsx` (`src/lib/export/xlsx.ts`) như D18. Mẫu in theo trang in phiếu xuất (`/sales/deliveries/[code]/print`).
- Bản vẽ D7 nằm dưới menu **Công nợ** (`aria-current`). Menu Công nợ chỉ Giám đốc, Kế toán thấy (`receivables.view`).

## Goals / Non-Goals

**Goals:**

- Một hàm thuần duy nhất tính bảng kê của (hợp đồng, kỳ) từ: dòng sổ có ngày, các bản hợp đồng đã duyệt, bảng ngày nghỉ, hôm nay. Dùng cho D7, in, Excel, chốt.
- Kỳ đã chốt chụp lại đầy đủ để in lại đúng và để `receivables` đọc, không tính lại.
- Không ghi gì vào sổ kho.

**Non-Goals:**

- Công nợ, thanh toán, cấn cọc, quá hạn (`receivables`).
- Tối ưu cho hàng nghìn hợp đồng: công ty có vài chục hợp đồng thuê đang chạy (Risks).

## Decisions

### D1. Lượng hàng, thứ tự rút và phân đoạn (nền của mọi điểm sau)

- **Đọc dòng có ngày.** Thêm `siteLedgerLines(tx, contractId)` cạnh `siteMovements` trong `src/lib/deliveries/records.ts`, **dùng chung điều kiện nối** của bốn nhánh (tách thành hàm dựng điều kiện chung), trả từng dòng: `itemId`, `movement`, `milli`, `businessDate`, `ledgerId`, `documentType`, `documentId`, `documentCode`, và với phiếu chuyển thêm `sameCustomer`, `otherContractId`. `siteMovements` giữ nguyên kết quả (test hồi quy của `returns`, `deliveries`, `site-operations` vẫn xanh).
- **Lượng hàng** = các dòng "giao" của cùng (chứng từ + mã), gộp mọi tình trạng (Mới, Tốt cùng giá, 0.2 #4b). Có `startDate` (ngày giao) và `originDate` (ngày giao gốc để tính tối thiểu, D3).
- **Rút khi trả: FIFO** theo (ngày giao, mã chứng từ, `ledgerId`). Các sự kiện xử lý theo (`businessDate`, `ledgerId`). Kết quả là danh sách **phần lượng hàng** `{ itemId, milli, startDate, originDate, endDate | null, endKind, inDoc, outDoc, minimumApplies }`.
  - `endKind`: `RETURN` (`RETURN_OUT`), `LOSS` (`LOSS_OUT`), `BUY_BACK` (`SALE_OUT`), `TRANSFER` (`TRANSFER_OUT`).
  - Cân nhắc **LIFO** (rút lượng mới nhất): bất lợi cho khách vì lượng mới dễ chưa đủ 45 ngày, sinh dòng bù; khó giải thích. Cân nhắc **theo tỷ lệ**: ra số lẻ, không khớp cách kế toán đếm. Chọn FIFO: giống cách kế toán trừ trong Excel (trả thì trừ đợt cũ trước), có lợi cho khách, xác định duy nhất. Câu hỏi Q3 trong PR.
- **Phân đoạn trong kỳ** (hàm thuần `src/domain/rental-billing.ts`): với kỳ [đầu, cuối], phần lượng hàng cho Từ = max(đầu, start + 1), Đến = min(cuối, end ?? cuối, hôm nay nếu kỳ đang chạy). Từ > Đến thì bỏ. Rồi **tách tại ngày hiệu lực** của mỗi bản hợp đồng đã duyệt nằm trong (Từ, Đến] (0.2 #16). Mỗi đoạn: ngày lịch, trừ nghỉ (D2), ngày tính, giá ngày của bản tại ngày Từ của đoạn, `rentAmount`.
- **Cùng ngày giao và trả** tự đúng nhờ quy ước "Từ = hôm sau ngày giao": ngày D chỉ thuộc bên trả.
- Tất cả là hàm thuần có test (bảng ca ở tasks 2.x); phần đọc DB chỉ dựng đầu vào.

### D2. Ngày nghỉ và tối thiểu 45 ngày (điểm cần chốt 1)

**Đề xuất:**

- **Ngày nghỉ không tính vào tối thiểu.** Tối thiểu so với **tổng ngày tính** (đã trừ nghỉ) của phần lượng hàng qua mọi kỳ: bù = tối thiểu − Σ ngày tính, nếu dương.
  - Lý do: 0.2 #4 nói "trả sớm vẫn tính đủ 45 ngày", tức khách trả ít nhất 45 ngày tiền. Nếu ngày nghỉ được đếm vào 45 thì khách thuê 01/02 – 20/02/2027 (có Tết) chỉ trả 10 + 26 = 36 ngày, nhỏ hơn tối thiểu.
  - Phương án khác: đếm theo **ngày lịch** (ngày trả − ngày giao, gồm cả ngày nghỉ), bù = 45 − ngày lịch. Có lợi cho khách thuê ngắn qua Tết; nhưng "tối thiểu" mất nghĩa "ít nhất 45 ngày tiền". Câu hỏi Q1 trong PR.
- **Dòng bù ghi ở kỳ có ngày trả** (hoặc mất, mua lại, chuyển khác nhà thầu), vì chỉ lúc đó mới biết lượng hàng thuê bao lâu. Hàng còn ở công trình không bù, kể cả ở kỳ đang chạy.
- **Dòng bù không trừ ngày nghỉ**: số ngày bù là ngày "ảo" sau ngày trả, không có Từ / Đến. Giá = giá ngày của bản tại **ngày trả**; tối thiểu = `min_rental_days` của bản tại ngày trả, trống thì `DEFAULT_MIN_RENTAL_DAYS`.
- Σ ngày tính tính lại từ `originDate` tới ngày trả (cùng hàm ngày nghỉ), không cộng số đã lưu ở kỳ đã chốt. Khớp nhau vì: sổ kho của kỳ đã hết không đổi; phụ lục không hiệu lực trong kỳ đã chốt; **ngày nghỉ trong kỳ đã chốt bị khóa** (spec `rental-holidays`). Đổi ngày nghỉ không ảnh hưởng tối thiểu vì tối thiểu chỉ dùng số ngày, không dùng giá.
- **Bảng ngày nghỉ** `rental_holiday`: khoảng ngày gồm hai đầu, không chồng nhau (`EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)`, không cần `btree_gist`), tối đa 31 ngày một dòng để bắt gõ nhầm năm. Hàm thuần `holidayDaysIn(from, to, holidays)` đếm ngày trong giao.

### D3. Chuyển công trình: chuỗi thuê nối tiếp (0.2 #70, liên quan Q2)

- Phiếu chuyển rút lượng hàng ở hợp đồng đi theo FIFO (D1) như một lần trả, `endKind = TRANSFER`.
- **Cùng nhà thầu** (`site_transfer.same_customer = true`): phần đó ở hợp đồng đi `minimumApplies = false`. Ở hợp đồng nhận, dòng `TRANSFER_IN` tạo lượng hàng **mang theo `originDate`** của từng phần đã rút ở hợp đồng đi (một dòng vào có thể thành nhiều lượng nếu rút từ nhiều lượng gốc). Khi rời hợp đồng nhận: bù = tối thiểu (bản của hợp đồng nhận tại ngày trả) − ngày tính từ `originDate` tới ngày trả (cả đoạn ở hợp đồng đi và hợp đồng nhận, vì liền nhau: hết ngày chuyển rồi từ hôm sau), giá của hợp đồng nhận.
- **Khác nhà thầu**: hợp đồng đi bù như trả; hợp đồng nhận `originDate = startDate = ngày chuyển`.
- **Cách đọc**: tính lượng hàng của hợp đồng nhận cần lượng hàng của hợp đồng đi **tới ngay trước dòng chuyển** (so `(businessDate, ledgerId)`). Hàm đệ quy có ghi nhớ theo (hợp đồng, mốc); chuỗi A → B → A dừng vì mốc giảm dần.
- Phương án khác: lưu `originDate` lên phiếu chuyển lúc ghi sổ. Bỏ: phải sửa `site-operations` đã merge và vẫn cần FIFO ở hợp đồng đi; đọc lại từ sổ đúng với quy tắc "tính từ sổ kho".

### D4. Lưu gì khi chốt và vì sao không tính lại (điểm cần chốt 2)

- **Chốt chụp lại toàn bộ kết quả**: bảng `billing_period` (đầu kỳ + tổng tách loại + hạn trả) và `billing_period_line`, `billing_period_freight` (mọi dòng như đang hiện). D7, in, Excel của kỳ đã chốt đọc từ đây.
- **Vì sao không tính lại từ sổ** dù về lý thuyết ra cùng số (D2):
  - code tính có thể sửa lỗi về sau; kỳ đã gửi khách không được đổi theo (0.2 #22);
  - tên hàng, tên nhà thầu, thông tin trên phiếu có thể đổi; bản in lại phải đúng bản đã gửi;
  - `receivables` cần số cố định và hạn trả để ghi thanh toán, không phải tính lại cả lịch sử mỗi lần mở sổ công nợ;
  - tính lại vẫn hữu ích để **đối chiếu** (Open Questions: lệnh `billing:check`).
- **Số tiền tách loại** để `receivables` tách công nợ (roadmap dòng 14): `rent_amount` (gồm dòng bù), `adjustment_amount`, `freight_amount`, `vat_amount`, `total_amount`; check `total = rent + adjustment + freight + vat`.
- **Hạn trả** `due_date` = `period_end` + `payment_terms_days` của bản tại cuối kỳ (0.2 #18: "ngày chốt kỳ" = ngày cuối tháng theo `billing_cycle = MONTH_END`, đúng số D7: 28/02 + 30 = 30/03/2027). Phương án "ngày bấm chốt + số ngày" làm hạn trả phụ thuộc lúc kế toán bấm (chốt muộn thì khách được nợ lâu hơn), không chọn. Câu hỏi Q4.
- **Khóa**: ba bảng vào `APPEND_ONLY_TABLES` (role app chỉ `SELECT, INSERT`) **và** trigger `billing_period_frozen` chặn `UPDATE/DELETE`; dòng con chỉ chèn khi `parent.created_xact = pg_current_xact_id()` (cùng cách `return_note`, `drizzle/0016_returns.sql`). Không có "mở lại kỳ".
- **Thông tin công ty** trên bản in đọc `company_profile` hiện tại như mọi phiếu in khác; không chụp lại (đổi tên công ty là việc hiếm, và in phiếu xuất cũ cũng theo cách này).

### D5. Dòng điều chỉnh (điểm cần chốt 3)

- **Ai tạo:** Kế toán, Giám đốc (`billing.manage`). Kinh doanh không.
- **Không cần Giám đốc duyệt.** Lý do: chốt kỳ đã là bước kiểm; dòng điều chỉnh luôn hiện riêng trên D7 / bản in kèm lý do, người lập; nhật ký ghi lại (D18). Thêm bước duyệt làm chậm chốt kỳ mỗi tháng. Câu hỏi Q5 (nếu anh muốn Giám đốc duyệt khoản giảm).
- **Âm được** (tính thừa thì trả lại khách), khác 0, tiền nguyên ₫, giới hạn |số tiền| ≤ 10 tỷ ₫ để bắt gõ nhầm.
- **Gắn vào kỳ nào:** một kỳ **chưa chốt** của cùng hợp đồng, **sau** kỳ được điều chỉnh; kỳ được điều chỉnh phải **đã chốt** (chưa chốt thì sửa nguồn rồi tính lại, không cần điều chỉnh). Mặc định D7 gợi ý kỳ đang xem. Hợp đồng đã trả hết hàng vẫn ghi được vào tháng sau: tháng đó có dòng điều chỉnh nên vào danh sách kỳ.
- Bảng `billing_adjustment`: `contract_id`, `month`, `ref_month`, `amount`, `reason`, `closed_period_id` (null tới khi kỳ ghi được chốt), `created_by`, `updated_by`, `created_at`, `updated_at`. Sửa / xóa khi `closed_period_id` null (`updatedAt` → 409). Trigger: chặn `INSERT` khi (hợp đồng, `month`) đã có `billing_period`; chặn `UPDATE/DELETE` khi `closed_period_id` đã có; chỉ cho đặt `closed_period_id` trong transaction tạo kỳ đó.
- VAT của dòng điều chỉnh theo bản tại cuối kỳ ghi (D6). Dòng điều chỉnh chụp lại vào `billing_period_line` (`kind = ADJUSTMENT`) lúc chốt.

### D6. Thứ tự chốt, phiếu chưa xong, khóa (điểm cần chốt 4)

- **Phải chốt kỳ trước rồi mới chốt kỳ sau.** Lý do: `lastClosedPeriodEnd` là một ngày duy nhất chặn phụ lục; dòng điều chỉnh chỉ có nghĩa khi kỳ cũ đã khóa; công nợ không có lỗ. Kỳ "trước" chỉ tính tháng có tiền (tháng không có dòng, cước, điều chỉnh thì bỏ qua).
- **Chỉ chốt khi kỳ đã hết** (cuối kỳ < hôm nay, giờ VN). Vì ngày nghiệp vụ = ngày ghi sổ, sau đó không chứng từ nào rơi vào kỳ nữa.
- **Phiếu chưa xong không chặn** (Chờ nhặt, Đang nhặt, phiếu chuyển Chờ xác nhận, mua lại Chờ duyệt, nháp trên máy): khi ghi sổ chúng mang ngày ghi sổ, tức thuộc kỳ sau. D7 liệt kê chứng từ chưa xong của hợp đồng để kế toán biết. Phương án chặn đến khi xong: một phiếu xuất treo làm kẹt chốt cả kỳ, không có lợi gì cho số liệu. Nháp trên điện thoại server không thấy được; D7 ghi một câu nhắc như D6 đã nhắc (0.2 #55).
- **Khóa khi chốt:** khóa **hợp đồng `FOR UPDATE`** đầu tiên (cùng thứ tự `postDelivery`, `postReturn`, duyệt phụ lục), rồi `pg_advisory_xact_lock_shared(hashtext('rental-holidays'))`; tính lại trong transaction; so `expectedTotal` (khác → 409); ghi kỳ + dòng + đặt `closed_period_id` cho dòng điều chỉnh + `logActivity`. Unique (`contract_id`, `month`) chặn chốt đôi; lỗi trùng trả "đã được chốt lúc … bởi …".
- **Sửa ngày nghỉ** lấy `pg_advisory_xact_lock(hashtext('rental-holidays'))` (độc quyền), đọc `max(period_end)` của mọi kỳ đã chốt rồi kiểm. Nhờ vậy không có kỳ nào chốt bằng bảng ngày nghỉ cũ trong lúc bảng đang đổi.
- **Phụ lục duyệt cùng lúc chốt**: cả hai khóa hợp đồng nên tuần tự; `lastClosedPeriodEnd` đọc sau khóa (đã có ở `amendments.ts`).
- **`lastClosedPeriodEnd` thật:** `select max(period_end) from billing_period where contract_id = $1`. Chỉ thay thân hàm (đúng ghi chú trong file).

### D7. VAT và cước (điểm cần chốt 5)

- **VAT áp cả cước và điều chỉnh.** Lý do: hóa đơn của khách gồm tiền thuê và cước chuyên chở do công ty cung cấp; số D7 bản vẽ (539.504 ₫ = 8 % × 6.743.800 ₫) đã gồm cước và điều chỉnh. Cước tính VAT theo bản hợp đồng tại ngày giao.
- **VAT đổi giữa kỳ bằng phụ lục:** mỗi dòng mang thuế suất của bản tại ngày Từ (đã tách dòng tại ngày hiệu lực, D1), dòng bù theo ngày trả, cước theo ngày giao, điều chỉnh theo cuối kỳ. VAT = Σ theo từng thuế suất của round(tổng cùng thuế suất × thuế suất), làm tròn nửa lên. Dòng tắt VAT có thuế suất trống, không vào VAT. Phương án "một thuế suất cho cả kỳ theo bản cuối kỳ": sai với 0.2 #16 (giá mới chỉ từ ngày hiệu lực). Làm tròn theo từng dòng: cộng nhiều sai số, không khớp cách kế toán lập hóa đơn trên tổng.
- **Cước** đọc qua `deliveredAmounts` (`src/lib/deliveries/amounts.ts`), lọc phiếu có `businessDate` trong kỳ và `freight` khác null. Không đọc phiếu chuyển (không có cước) hay thu hồi.

### D8. Nhóm dòng trên bảng kê (điểm cần chốt 6)

- Sắp xếp: **theo mã hàng** (thứ tự mã như danh mục), trong một mã theo **ngày giao** (cũ trước), trong một lượng theo ngày trả (đã trả trước, còn ở công trình sau), rồi đoạn đổi giá theo ngày, dòng bù ngay sau dòng cuối của phần đó. Dòng điều chỉnh ở cuối bảng, trước "Cộng tiền thuê".
- Mỗi dòng có dòng phụ: chứng từ giao (`PX-…`, `CCT-…`, "Đợt n"), ngày giao, chứng từ trả (`PTH-…`, `MLA-…`, `CCT-…`), mã bản giá (`/01`), nhãn: Đổi giá, Mất, Mua lại, Chuyển đi, Tối thiểu N ngày.
- Gộp: các phần cùng lượng hàng, cùng ngày trả, cùng đoạn giá thì một dòng (cộng số lượng). Không gộp giữa hai lượng hàng khác ngày giao, để kế toán dò được từng đợt giao như Excel.
- Lý do: kế toán đối chiếu theo **đợt giao** (Excel hiện tại là mỗi đợt một khối, mỗi mã một dòng); nhóm theo mã trước giúp nhìn tổng một mã. Phương án nhóm theo chứng từ trước: một mã rải nhiều chỗ, khó cộng.
- Excel sheet "Chi tiết" giữ đúng thứ tự này, thêm cột hợp đồng và loại dòng để lọc / pivot.

### D9. Mẫu in bảng kê và file Excel (điểm cần chốt 7)

- **In** `/receivables/billing/[month]/[contractId]/print`: A4 dọc, khung như trang in phiếu xuất. Đầu: logo, tên, MST, địa chỉ, hotline từ `company_profile`; tiêu đề "BẢNG KÊ TIỀN THUÊ VẬT TƯ · KỲ 02/2027"; số hợp đồng, nhà thầu (tên, MST, địa chỉ), công trình; băng ngày nghỉ. Thân: bảng như D7, đủ 9 cột, chữ nhỏ hơn màn hình. Cuối: cước, khối phải thu, hạn trả, hai ô ký "Bên cho thuê", "Bên thuê". Không có dòng "bằng chữ" ở MVP (chưa có hàm đọc số; thêm khi kế toán cần). Kỳ chưa chốt: dấu chìm "TẠM TÍNH – CHƯA CHỐT".
- **Excel** `GET /api/billing/periods/[month]/export` → `tien-thue-2027-02.xlsx`, ba sheet:
  - "Tổng hợp": Số hợp đồng, Nhà thầu, Công trình, Tiền thuê, Điều chỉnh, Cước, VAT, Phải thu, Hạn trả, Trạng thái, Người chốt, Giờ chốt;
  - "Chi tiết": Số hợp đồng, Mã hàng, Tên hàng, Loại dòng (Thuê / Đổi giá / Bù tối thiểu / Mất / Mua lại / Chuyển đi / Điều chỉnh), Chứng từ giao, Ngày giao, Chứng từ trả, Ngày trả, Số lượng, Từ, Đến, Ngày lịch, Trừ nghỉ, Ngày tính, Giá / ngày, Thành tiền, Thuế suất, Ghi chú;
  - "Cước": Số hợp đồng, Phiếu xuất, Đợt, Biển số, Ngày, Cước, Thuế suất.
  - Tiền, số lượng là số; ngày là ngày Excel (`buildXlsx` cần nhận kiểu ngày nếu chưa có). Kinh doanh chỉ có hợp đồng mình được xem.
- Chưa có bản vẽ mẫu in: làm theo mô tả này, ảnh mốc tạo trên CI.

### D10. Quyền

- `billing.view`: `OFFICE` (Giám đốc, Kế toán, Kinh doanh); với Kinh doanh thêm `canContract(user, "RENTAL", "view")` (0.2 #51) ở mọi route và trang.
- `billing.manage`: Giám đốc, Kế toán (chốt, dòng điều chỉnh).
- `holidays.manage`: Giám đốc. Đọc ngày nghỉ: `billing.view`.
- Trang `/receivables/billing` gọi `requirePermission("billing.view")` (không cần `receivables.view` để Kinh doanh mở được từ D5); menu không đổi. `/receivables` (đang là trang chờ D14) thêm thẻ liên kết "Tính tiền thuê". API bọc `withAuth`; `route-guards.test.ts` tự bắt chỗ quên.

### D11. Dữ liệu (migration `drizzle/0018_rental_billing.sql`)

- `rental_holiday`: `id`, `name` (1–100), `start_date`, `end_date` (check `end_date >= start_date and end_date - start_date <= 30`), exclusion không chồng, `created_by`, `updated_by`, `created_at`, `updated_at`.
- `billing_period`: `id`, `contract_id` (FK `RESTRICT`), `month` (date, check ngày 1), `period_end`, `revision_id` (bản tại cuối kỳ), `rent_amount`, `adjustment_amount`, `freight_amount`, `vat_amount`, `total_amount` (bigint; check tổng), `payment_terms_days`, `due_date` (check = `period_end + payment_terms_days`), `holiday_days`, `line_count`, `created_xact xid8 default pg_current_xact_id()`, `closed_by`, `closed_at`; unique (`contract_id`, `month`); index `contract_id, period_end`.
- `billing_period_line`: `period_id`, `line_no`, `kind` (`RENT`, `MINIMUM`, `ADJUSTMENT`), `item_id` (null cho điều chỉnh), `item_code`, `item_name`, `quantity numeric(14,3)`, `from_date`, `to_date`, `calendar_days`, `holiday_days`, `charged_days`, `daily_price`, `amount` (bigint, âm chỉ cho `ADJUSTMENT`), `vat_rate numeric(5,2)`, `revision_code`, `price_changed`, `in_document_type`, `in_document_code`, `in_date`, `origin_date`, `out_kind` (`RETURN`, `LOSS`, `BUY_BACK`, `TRANSFER`), `out_document_type`, `out_document_code`, `out_date`, `adjustment_id`, `ref_month`, `note`; check theo `kind` (VD `RENT` có `from_date <= to_date`, `charged_days = calendar_days - holiday_days`; `MINIMUM` không có ngày).
- `billing_period_freight`: `period_id`, `delivery_note_id` (FK), `delivery_code`, `batch_no`, `vehicle_plate`, `business_date`, `amount`, `vat_rate`.
- `billing_adjustment`: như D5; check `amount <> 0`, `ref_month < month`, `reason` không trống.
- Trigger: `billing_period_frozen`, `billing_period_child_insert` (so `created_xact`), `billing_adjustment_guard`.
- `activity_log`: check `document_type` thêm `BILLING_PERIOD`, `BILLING_ADJUSTMENT`, `RENTAL_HOLIDAY`; check `action` thêm `CLOSE_PERIOD` ("Chốt kỳ", nhóm "Duyệt, ghi sổ", tính vào ô Duyệt / ghi sổ). Không dùng lại `CLOSE` vì nhãn "Đóng đơn" thuộc nhóm "Trả lại, hủy, xóa".
- `src/db/grants.ts`: `APPEND_ONLY_TABLES` thêm `billing_period`, `billing_period_line`, `billing_period_freight` (test chống lệch). Bảng khác CRUD.
- Không có mã tự sinh mới (kỳ gọi theo hợp đồng + tháng), không `CREATE SEQUENCE` (0.2 #33).

### D12. API và trang

| Route | Việc |
|---|---|
| `GET /api/billing/periods/[month]` | danh sách hợp đồng của kỳ (`YYYY-MM`): số, nhà thầu, công trình, phải thu, trạng thái, đếm đã chốt; ngày nghỉ trong kỳ |
| `GET /api/billing/periods/[month]/contracts/[id]` | bảng kê một hợp đồng: dòng, cước, VAT theo thuế suất, phải thu, hạn trả, chứng từ chưa xong; kỳ đã chốt đọc từ bảng chụp |
| `POST /api/billing/periods/[month]/contracts/[id]/close` | chốt; body `{ expectedTotal }` |
| `GET /api/billing/periods/[month]/export` | `.xlsx` |
| `POST /api/billing/adjustments` · `PUT/DELETE /api/billing/adjustments/[id]` | dòng điều chỉnh (`updatedAt`) |
| `GET /api/holidays?year=` · `POST /api/holidays` · `PUT/DELETE /api/holidays/[id]` | ngày nghỉ (`updatedAt`) |

- Trang: `/receivables/billing?month=2027-02&contract=<id>` (D7), `/receivables/billing/[month]/[contractId]/print`, `/settings/holidays`. Thẻ "Ngày nghỉ không tính thuê" trên `/settings`. D5 hợp đồng thuê thêm liên kết "Tiền thuê theo kỳ".
- Service `src/lib/billing/`: `ledger.ts` (dựng đầu vào), `compute.ts` (gọi hàm thuần), `close.ts`, `adjustments.ts`, `export.ts`, `queries.ts`. `src/lib/holidays/`. Mọi hàm ghi: khóa `FOR UPDATE` trước khi kiểm, `logActivity` trong transaction.
- Chọn tháng trên D7 dùng ô chọn tháng (không phải ô ngày); mọi ô ngày (ngày nghỉ) dùng `DateInput`.

### D13. Nhật ký

- Chốt kỳ: `CLOSE_PERIOD`, `document_type = BILLING_PERIOD`, mã hiện "102026/ANPHAT-MINHPHAT · 02/2027", tóm tắt "kỳ 02/2027 · 8 dòng · phải thu 7.283.304 ₫".
- Dòng điều chỉnh: `CREATE`, `UPDATE` (`diffFields`), `DELETE`, `document_type = BILLING_ADJUSTMENT`.
- Ngày nghỉ: `CREATE`, `UPDATE`, `DELETE`, `document_type = RENTAL_HOLIDAY`.
- `src/lib/activity/coverage.test.ts` bắt hàm ghi quên `logActivity`.

### D14. Seed dev và E2E

- Seed: ngày nghỉ 2027 (Tết Dương lịch 01/01, Tết Nguyên đán 05/02 – 13/02, Giỗ Tổ 16/04, 30/04 – 01/05, 02/09). Không seed kỳ đã chốt hay dòng điều chỉnh (cần kỳ cũ đã hết). D7 dùng hợp đồng mẫu An Phú – Block B ở kỳ đang chạy (tạm tính).
- Ảnh mốc D7 phải ổn định qua ngày chạy (kỳ đang chạy phụ thuộc hôm nay): E2E chọn kỳ đã hết cố định trên hợp đồng E2E, hoặc che số phụ thuộc ngày như D8 (#136). Chọn khi apply, ghi vào `CLAUDE.md`.
- E2E: Kế toán mở D7 kỳ đang chạy (nút chốt tắt kèm lý do), Giám đốc thêm / sửa / xóa ngày nghỉ năm xa (VD 2099, không chạm kỳ nào), Kinh doanh xem không có nút chốt, Xuất Excel. **Chốt kỳ không chạy trong E2E** trên DB dev: kỳ phải đã hết và kỳ đã chốt không xóa được, mỗi lần chạy sẽ để lại kỳ khóa. Chốt, khóa, 409, dòng điều chỉnh kiểm bằng integration test (DB test dọn bằng owner).

## Risks / Trade-offs

- [Tính lại cả lịch sử hợp đồng mỗi lần mở D7] → vài chục hợp đồng, mỗi hợp đồng vài trăm dòng sổ: đủ nhanh. Sổ đã có index `inventory_ledger_document_idx (document_type, document_id)` cho các phép nối. Đo ở seed; quá 1 s thì chỉ đọc dòng tới cuối kỳ đang xem. Không cache ở biến cấp module (0.2 #33).
- [FIFO khác cách khách hiểu "trả đợt nào"] → bảng kê ghi rõ chứng từ giao của từng phần; Q3 trong PR.
- [Dòng bù hiện bất ngờ ở kỳ có ngày trả] → nhãn "Bù đủ 45 ngày: lượng này mới thuê M ngày".
- [Sửa ngày nghỉ bị khóa sau khi chốt] → đúng 0.2 #22; sai sót sửa bằng dòng điều chỉnh. Giám đốc nên khai ngày nghỉ của năm từ đầu năm.
- [Kỳ đã chốt không mở lại được nếu chốt nhầm] → chốt hỏi lại với số phải thu; sửa bằng dòng điều chỉnh ở kỳ sau (có thể âm).
- [Ngày nghiệp vụ có thể bị ghi lùi bởi change sau] → mọi change ghi sổ phải giữ "không ghi lùi" (CLAUDE.md đã ghi); thêm test: chốt xong, chứng từ mới không bao giờ có ngày ≤ cuối kỳ đã chốt của hợp đồng.

## Migration Plan

1. `npm run db:migrate` chạy `0018_rental_billing.sql`: chỉ thêm bảng, trigger, mở rộng check `activity_log`. Không sửa dữ liệu cũ. `db:migrate` cấp lại quyền, ba bảng kỳ vào nhóm chỉ ghi thêm.
2. Seed dev thêm ngày nghỉ 2027.
3. Rollback: bỏ deploy; code cũ không đọc bảng mới. Đã có kỳ chốt thì không rollback DB (kỳ chỉ ghi thêm), sửa tiến. `lastClosedPeriodEnd` cũ trả `null` nên rollback code sẽ bỏ chặn phụ lục: không rollback code sau khi đã chốt kỳ.

## Open Questions

- Lệnh `npm run billing:check` đối chiếu kỳ đã chốt với tính lại từ sổ (như `inventory:check`): hữu ích để phát hiện sai sót, không đổi spec; làm khi `receivables` cần hoặc khi anh muốn.
- Chốt nhiều hợp đồng một lần ("Chốt tất cả hợp đồng đã kiểm"): thêm sau nếu kế toán thấy mất thời gian.
