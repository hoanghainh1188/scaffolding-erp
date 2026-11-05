# Proposal: receivables

## Why

Kỳ tiền thuê đã chốt, hàng bán đã giao, phiếu đền bù và phiếu mua lại đã duyệt đều có số tiền và hạn trả trên hệ thống. Nhưng kế toán vẫn theo dõi nhà thầu đã trả bao nhiêu, còn nợ khoản nào, ai quá hạn bằng Excel. Màn duyệt hợp đồng, đền bù, mua lại cũng chưa có số nợ quá hạn thật (hàm `overdueDebt` đang trả 0). Change này thêm **công nợ phải thu**: khoản nợ, phiếu thu, tiền trả trước, cọc và bảo lãnh, **thanh lý hợp đồng**, xuất Excel (issue #14, roadmap dòng 14).

- Giai đoạn: **[MVP]**, issue #14, phụ thuộc `rental-billing` (đã archive, PR #141) và PR tài liệu #144 (đã merge).
- Màn hình:
  - **D14** Công nợ phải thu, bản vẽ `docs/design/screens/D14-Receivables.dc.html` (vẽ lại 05/11/2026).
  - **D14b** Thanh lý hợp đồng, bản vẽ `docs/design/screens/D14b-ContractClose.dc.html`.
  - Sửa **D5** (nút "Thanh lý hợp đồng" khi đủ quyền), thanh duyệt hợp đồng / phụ lục, **D8**, **D6c** (số nợ quá hạn thật).
- Quyết định đã chốt dùng: `docs/requirements.md` 0.2 #8, #15, #18, #19, #22, #39, #40, #48, #50, #71, #78, #79, #80, #81, #82, #83, #84, và #85–#89 (chốt khi review PR #145).
- Các điểm cần chốt của issue có phương án trong `design.md`: điểm 1 → D2, điểm 2 → D3, điểm 3 → D5, điểm 4 → D4, điểm 5 → D6, điểm 6 → D7. Câu hỏi Q1–Q5 của PR anh chốt theo đề xuất (05/11/2026), ghi ở 0.2 #85–#89.

## What Changes

- **Khoản nợ tính ra, không lưu bản sao số tiền.** Một nhà thầu có bốn loại khoản nợ, đọc từ chứng từ gốc:
  - kỳ tiền thuê đã chốt (`billing_period`: thuê + điều chỉnh, cước, VAT, hạn đã lưu);
  - phiếu xuất bán đã ghi sổ: tiền hàng + cước (`src/lib/deliveries/amounts.ts`), cộng VAT theo bản hợp đồng tại **ngày giao** (0.2 #84); hạn = ngày giao + số ngày được nợ của bản đó;
  - phiếu đền bù đã duyệt, phiếu mua lại đã duyệt (`amount_due`, `due_date` đã lưu), **không VAT** (0.2 #84).
- **Quá hạn tính ra** theo ngày Việt Nam: khoản còn nợ có hạn **trước** hôm nay; số ngày quá hạn = hôm nay − hạn. Không lưu (0.2 #18, spec `domain-values`).
- **Phiếu thu** (`PT-YYYY-NNN`, bảng đếm `document_counter`), hai loại:
  - **Trả nợ**: tự trừ khoản đến hạn sớm nhất trước; trùng hạn thì thứ tự cố định; Kế toán chỉ định khoản khác được (0.2 #19). Phân bổ lưu thành **dòng phân bổ chỉ ghi thêm**.
  - **Nộp cọc tiền** của một hợp đồng: giữ riêng, không trừ nợ (0.2 #40).
  - Trả dư thành **tiền trả trước**, tính ra (phiếu thu − phân bổ), **tự trừ ngay khi khoản mới phát sinh** (chốt kỳ, duyệt đền bù / mua lại, ghi sổ xuất bán) (0.2 #82).
  - **Không sửa.** Hủy bắt buộc lý do: ghi một dòng hủy, phân bổ của phiếu hết hiệu lực, các khoản mở lại, tiền trả trước còn lại tự trừ lại (0.2 #83).
- **Cọc và bảo lãnh** trên D14: cọc tiền thỏa thuận (bản hợp đồng đang áp dụng) và đã nhận (phiếu thu cọc); nhắc bảo lãnh còn ≤ 30 ngày (0.2 #50, đã có luật ở spec `contracts`).
- **Thanh lý hợp đồng** (D14b, 0.2 #81): kiểm điều kiện, cọc tiền đã nhận **cấn trừ nợ của chính hợp đồng đó** (khoản hạn sớm nhất trước), ghi **hoàn cọc thừa**; cọc thiếu thì phần còn lại là nợ thường. Hợp đồng sang **Thanh lý** (`transition("CLOSE")`) và bị khóa.
- **`overdueDebt` thật**: thay thân hàm ở `src/lib/contracts/overdue.ts`, giữ chữ ký. Màn duyệt hợp đồng, phụ lục, đền bù, mua lại có số thật (0.2 #15).
- **Phụ lục hợp đồng bán**: ngày hiệu lực phải sau ngày giao của phiếu xuất bán gần nhất, để VAT và hạn của hàng đã giao không đổi (design D1).
- **Dòng điều chỉnh tiền thuê** bị từ chối trên hợp đồng đã thanh lý.
- **D14** theo nhà thầu: 4 ô tổng (tổng phải thu, quá hạn, đến hạn trong 7 ngày, trả trước), lọc (Đang nợ, Quá hạn, Có trả trước, Tất cả) + tìm tên, phân trang 50 nhà thầu; các khoản nợ, ghi phiếu thu, cọc và bảo lãnh, danh sách phiếu thu của nhà thầu đang chọn. Trạng thái lọc nằm trên URL.
- **Xuất Excel** theo bộ lọc bằng `buildXlsx` (không thêm thư viện): sheet theo nhà thầu, sheet các khoản (cột tách thuê, cước, bán, đền bù, mua lại, VAT, phát sinh, đã thu, còn nợ, hạn, quá hạn), sheet phiếu thu. Tiền là số nguyên.
- **Quyền** (bảng `src/domain/permissions.ts`, kiểm ở server):
  - `receivables.view` (đã có): Giám đốc, Kế toán. Kinh doanh không xem D14 (0.2 #86).
  - `receipts.manage` (mới): ghi và hủy phiếu thu, Kế toán và Giám đốc.
  - `contracts.close` (mới): thanh lý, Kế toán và Giám đốc, không cần duyệt (0.2 #85).
- **`npm run billing:check`**: đối chiếu kỳ tiền thuê đã chốt với tính lại từ sổ kho (follow-up của `rental-billing`, vì công nợ đọc số đã chụp).
- **Nhật ký**: Tạo phiếu thu, Hủy phiếu thu, Thanh lý hợp đồng, mỗi lệnh một dòng; loại chứng từ mới "Phiếu thu".
- **Bảng mới chỉ ghi thêm** (`APPEND_ONLY_TABLES`): `receipt`, `receipt_allocation`, `receipt_cancellation`, `contract_settlement`.

## Capabilities

### New Capabilities

- `receivables`: khoản nợ của nhà thầu (bốn nguồn), VAT hàng bán, hạn và quá hạn, số nợ quá hạn cho màn duyệt, màn D14, Excel, quyền xem.
- `customer-receipts`: phiếu thu trả nợ và nộp cọc, phân bổ (tự động / chỉ định), tiền trả trước, hủy phiếu thu, chống trừ trùng.
- `contract-settlement`: thanh lý hợp đồng (D14b): điều kiện, cấn trừ cọc, hoàn cọc thừa, khóa hợp đồng.

### Modified Capabilities

- `contracts`: trạng thái Thanh lý có thật; nợ quá hạn khi duyệt đọc từ công nợ; cọc tiền đã nhận ghi bằng phiếu thu.
- `contract-amendments`: ngày hiệu lực phụ lục hợp đồng bán phải sau ngày giao bán gần nhất.
- `rental-billing`: chốt kỳ tự trừ tiền trả trước; không ghi điều chỉnh trên hợp đồng đã thanh lý.
- `compensations`: duyệt phiếu tự trừ tiền trả trước.
- `buy-backs`: duyệt phiếu tự trừ tiền trả trước.
- `deliveries`: ghi sổ phiếu xuất bán tự trừ tiền trả trước.
- `activity-log`: thao tác phiếu thu và thanh lý được ghi; loại chứng từ Phiếu thu.
- `database-access`: thêm bốn bảng chỉ ghi thêm.

## Ngoài phạm vi

- Công nợ phải trả (D14 phải trả, change `payables`, Bản 2).
- Hóa đơn VAT, tích hợp phần mềm kế toán (0.2 #8).
- Lãi, phạt chậm trả (0.2 #48: chỉ cảnh báo).
- Hoàn tiền trả trước cho khách bằng tiền (chỉ trừ vào khoản sau, 0.2 #82); cấn tiền trả trước với cọc.
- Mở lại hợp đồng đã thanh lý; hủy thanh lý.
- Bảo lãnh tự cấn trừ (không phải tiền, 0.2 #50); ghi ngày trả chứng thư.
- In phiếu thu, in biên bản thanh lý (làm sau nếu cần).
- Báo cáo tuổi nợ theo nhóm 30/60/90 ngày (Bản 2, D1 đầy đủ).
- Màn mobile.

## Impact

- **Sổ kho, giá vốn:** không đổi. Change không ghi dòng sổ kho nào.
- **Số liệu đã có:** kỳ đã chốt, phiếu đền bù, mua lại đã duyệt, phiếu xuất bán đã ghi sổ đều thành khoản nợ ngay khi deploy, chưa có phiếu thu nào trừ. Kế toán nhập phiếu thu của các khoản đã thu trước đó (ghi ngày thu thật) trước khi dùng cảnh báo quá hạn. Từ lúc deploy, màn duyệt hợp đồng / đền bù / mua lại hiện cảnh báo nợ quá hạn thật và đòi lý do.
- **DB:** migration `drizzle/0019_receivables.sql`: 4 bảng mới, trigger chỉ ghi thêm, check `activity_log` thêm loại `RECEIPT`, `src/db/grants.ts`.
- **Code mới:** `src/domain/receivables.ts` (hàm thuần phân bổ, quá hạn, VAT bán, cấn cọc), `src/lib/receivables/` (đọc khoản nợ, phiếu thu, tiền trả trước, thanh lý, Excel), route `/api/receivables/...`, trang `/receivables` (D14), `/receivables/contracts/[id]/close` (D14b).
- **Code sửa:** `src/lib/contracts/overdue.ts` (thân hàm), `src/lib/billing/close.ts`, `src/lib/compensations/service.ts`, `src/lib/buy-backs/service.ts`, `src/lib/deliveries/` (ghi sổ xuất bán) gọi trừ tiền trả trước trong transaction; `src/lib/contracts/amendments.ts` (ngày hiệu lực hợp đồng bán); `src/lib/billing/adjustments.ts` (chặn hợp đồng đã thanh lý); `src/domain/permissions.ts`, `src/domain/activity.ts`.
- **Seed dev:** phiếu thu mẫu của Minh Phát (trả nợ, nộp cọc) để D14 có số.
- **Thư viện:** không thêm.
