# Proposal: rental-billing

## Why

Hàng thuê đã ra công trình, về bãi, chuyển công trình, mất và được mua lại, tất cả đều nằm trên sổ kho. Nhưng tiền thuê hằng tháng kế toán vẫn tính tay trong Excel: đếm ngày từng lượng hàng, gõ tay −9 ngày Tết, bù tối thiểu 45 ngày, cộng cước, VAT. Dễ sai và không ai kiểm lại được. `receivables` (change sau) cần **số phải thu của từng kỳ đã chốt** cùng hạn trả. Change này thêm **tính tiền thuê theo kỳ** và **chốt kỳ** (issue #13, roadmap dòng 13).

- Giai đoạn: **[MVP]**, issue #13, phụ thuộc `site-operations` (đã merge, PR #138).
- Màn hình:
  - **D7** Tính tiền thuê (dưới menu **Công nợ**), bản vẽ `docs/design/screens/D7-RentalBilling.dc.html` (vẽ lại 04/11/2026, PR #139).
  - **Cài đặt → Ngày nghỉ không tính thuê** (chưa có bản vẽ, làm theo mẫu trang Giá sắt vụn).
  - Mẫu in **bảng kê tiền thuê** và file **Excel** của kỳ.
  - Sửa **D5** (liên kết "Tiền thuê theo kỳ"), **D5b** (ngày cuối kỳ đã chốt thật).
- Quyết định đã chốt dùng: `docs/requirements.md` 0.2 #4, #16, #18, #21, #22, #33, #39, #45, #51, #55, #61, #62, #63, #66, #70, #71, #73, #74.
- Các điểm cần chốt của issue có phương án trong `design.md` (D1–D7). Câu hỏi để anh chốt nằm trong mô tả PR.

## What Changes

- **Kỳ = tháng dương lịch** (`billing_cycle = MONTH_END`). Kế toán chọn kỳ (VD 02/2027 = 01/02 – 28/02) trên D7, thấy danh sách hợp đồng thuê có tiền trong kỳ kèm trạng thái Chưa chốt / Đã chốt.
- **Tính từ sổ kho, không lưu số cộng dồn.** Đọc dòng sổ của hợp đồng qua cùng nguồn với `siteMovements` (phiếu xuất, thu hồi, chuyển công trình, mua lại):
  - "giao" = `DELIVERY_IN`, `TRANSFER_IN`; "trả" = `RETURN_OUT`, `LOSS_OUT` (hàng mất, 0.2 #21), `TRANSFER_OUT`, `SALE_OUT` của phiếu mua lại (0.2 #71);
  - ngày = **ngày nghiệp vụ** của chứng từ (0.2 #55), không lấy giờ bấm trên máy.
- **Lượng hàng** (design D1): mỗi dòng "giao" của một mã là một lượng hàng. Hàng trả rút từ **lượng giao sớm nhất trước** (FIFO). Bảng kê có một dòng cho mỗi phần lượng hàng trong kỳ.
- **Luật ngày (0.2 #4):** trong kỳ, Từ = max(đầu kỳ, **hôm sau** ngày giao), Đến = min(cuối kỳ, **ngày trả**, gồm). Giao và trả cùng ngày không tính trùng: ngày đó thuộc bên trả.
- **Ngày nghỉ chung (0.2 #73):** bảng mới, Giám đốc sửa ở Cài đặt. Ngày nghỉ nằm trong [Từ, Đến] bị trừ khỏi số ngày tính của mọi hợp đồng thuê. Bảng kê hiện cột "Trừ nghỉ".
- **Đổi giá giữa kỳ (0.2 #16):** giá ngày đọc qua `contractTermsAt`. Phụ lục có ngày hiệu lực trong kỳ thì **tách dòng tại ngày hiệu lực**.
- **Tối thiểu 45 ngày theo từng lượng hàng (0.2 #39, #74):** lượng nào trả (mất, mua lại, chuyển sang nhà thầu khác) mà tổng số ngày tính chưa đủ tối thiểu thì có **dòng bù** ở kỳ có ngày trả. Số ngày tối thiểu lấy từ bản hợp đồng tại ngày trả, mặc định `DEFAULT_MIN_RENTAL_DAYS`.
- **Chuyển công trình (0.2 #70):** cùng nhà thầu thì hợp đồng đi **không bù**; lượng hàng sang hợp đồng nhận **giữ ngày giao gốc** để tính tối thiểu tiếp. Khác nhà thầu thì hợp đồng đi bù như trả, hợp đồng nhận tính như giao mới.
- **Cước vận chuyển trong kỳ** đọc qua `src/lib/deliveries/amounts.ts` (phiếu xuất ghi sổ trong kỳ, công ty gọi xe).
- **VAT** theo cờ và thuế suất của bản hợp đồng; áp lên tiền thuê, điều chỉnh và cước (design D5).
- **Dòng điều chỉnh kỳ trước (0.2 #22):** Kế toán ghi sai sót của kỳ đã chốt thành một dòng tiền (dương hoặc âm) kèm lý do ở một kỳ chưa chốt; không sửa kỳ cũ.
- **Chốt kỳ** (Kế toán, Giám đốc): chỉ chốt khi kỳ đã hết và các kỳ trước của hợp đồng đã chốt. Một transaction lưu:
  - kỳ đã chốt + **các dòng bảng kê chụp lại** + cước + VAT;
  - số phải thu tách loại: tiền thuê, điều chỉnh, cước, VAT, tổng;
  - **hạn trả** = ngày cuối kỳ + số ngày được nợ của hợp đồng (0.2 #18) để `receivables` đọc.
  - Kỳ đã chốt **bị trigger khóa** (bảng chỉ ghi thêm), không mở lại.
- **`lastClosedPeriodEnd` thật:** thay hàm chờ ở `src/lib/contracts/billing-lock.ts` bằng truy vấn kỳ đã chốt. Phụ lục có ngày hiệu lực trong kỳ đã chốt bị từ chối (đã có ở `contract-amendments`, nay có hiệu lực thật).
- **In bảng kê** (thông tin công ty từ `company_profile`) và **Xuất Excel** của kỳ (sheet tổng hợp, chi tiết, cước).
- **Quyền** (kiểm ở server, bảng `src/domain/permissions.ts`):
  - `billing.view`: Giám đốc, Kế toán, Kinh doanh; Kinh doanh chỉ xem hợp đồng thuê theo `canContract` (0.2 #51);
  - `billing.manage`: Giám đốc, Kế toán (chốt kỳ, dòng điều chỉnh);
  - `holidays.manage`: Giám đốc.
- **Nhật ký:** chốt kỳ, tạo / sửa / xóa dòng điều chỉnh, tạo / sửa / xóa ngày nghỉ, mỗi lệnh đúng một dòng `logActivity`.
- **Ảnh hưởng tới số liệu đã có:** không ghi gì vào sổ kho, không đổi giá vốn. Chỉ đọc sổ. Bảng mới không sửa dữ liệu cũ.

## Capabilities

### New Capabilities

- `rental-billing`: tính tiền thuê theo kỳ từ sổ kho (lượng hàng, luật ngày, đổi giá, tối thiểu, chuyển công trình), dòng điều chỉnh, cước, VAT, chốt kỳ và khóa, số phải thu + hạn trả, D7, in bảng kê, Excel, quyền.
- `rental-holidays`: bảng ngày nghỉ chung không tính thuê, Giám đốc sửa ở Cài đặt, khóa khi đã có kỳ chốt chứa ngày đó.

### Modified Capabilities

- `contracts`: "Cách tính tiền thuê theo hợp đồng" thêm trừ ngày nghỉ chung, tối thiểu theo từng lượng hàng, chuyển công trình cùng nhà thầu.
- `database-access`: thêm bảng kỳ đã chốt vào danh sách bảng chỉ ghi thêm.
- `activity-log`: ghi thao tác chốt kỳ, dòng điều chỉnh, ngày nghỉ; lọc D18 có ba loại chứng từ mới.

## Ngoài phạm vi

- Sổ công nợ, ghi thanh toán, cấn trừ cọc, bảo lãnh, nợ quá hạn, `overdueDebt` thật: change `receivables` (#14).
- Chuyển hợp đồng sang **Thanh lý**: change sau (khi có công nợ).
- Mở lại kỳ đã chốt (0.2 #22 không cho).
- Chốt nhiều hợp đồng một lần; kỳ khác tháng dương lịch (chỉ có `MONTH_END`).
- Tiền đền bù (đã ở phiếu đền bù), tiền bán hàng, cước của hợp đồng bán.
- Xuất hóa đơn VAT (0.2 #8).
- Ngày nghỉ riêng từng hợp đồng hoặc từng công trình.

## Impact

- **DB** (migration `drizzle/0018_rental_billing.sql`): bảng `rental_holiday`, `billing_period`, `billing_period_line`, `billing_period_freight`, `billing_adjustment`; trigger khóa; check `activity_log` thêm loại chứng từ; `src/db/grants.ts` thêm ba bảng kỳ đã chốt vào `APPEND_ONLY_TABLES`.
- **Code mới:** `src/domain/rental-billing.ts` (hàm thuần: lượng hàng, phân đoạn, ngày nghỉ, tối thiểu, VAT), `src/lib/billing/` (đọc sổ, tính, chốt, điều chỉnh, Excel), `src/lib/holidays/`.
- **Code sửa:** `src/lib/deliveries/records.ts` (hàm đọc dòng sổ có ngày dùng chung với `siteMovements`), `src/lib/contracts/billing-lock.ts`, `src/domain/permissions.ts`, `src/domain/activity.ts`, Cài đặt, D5, `/receivables` (liên kết D7), seed dev.
- **API:** `GET /api/billing/periods/[month]`, `GET /api/billing/periods/[month]/contracts/[id]`, `POST …/close`, `GET /api/billing/periods/[month]/export`, `POST/PUT/DELETE /api/billing/adjustments`, `GET/POST/PUT/DELETE /api/holidays`.
- **Phụ thuộc:** không thêm thư viện (Excel dùng `src/lib/export/xlsx.ts` sẵn có).
