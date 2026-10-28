# Proposal: stocktake

## Why

Sổ kho đã có, nhưng chưa có cách đếm lại hàng thật ở bãi, xưởng rồi cân sổ. Hiện muốn sửa phải lập tay phiếu điều chỉnh cho từng mã. Change này thêm **phiên kiểm kê** trên điện thoại (M6a, M6): Thủ kho đếm mù, văn phòng xem chênh lệch (D13), Giám đốc duyệt thì sổ kho tự ghi dòng điều chỉnh.

- Giai đoạn: **[MVP]** (đã lên MVP trong `docs/roadmap.md`), change số 08, issue #17.
- Màn hình: **M6a** Bắt đầu kiểm kê, **M6** Đếm hàng, **D13** Kết quả kiểm kê (`docs/design/screens/M6a-StocktakeStart.dc.html`, `M6-Stocktake.dc.html`, `D13-Stocktake.dc.html`, đã duyệt ở PR #51). Thêm một khối "Kiểm kê" nhỏ trên **M1** (chưa vẽ, theo kiểu thẻ có sẵn của M1).
- Quyết định đã chốt dùng: `docs/requirements.md` 0.2 #1, #10, #11, #24 (giá BQ toàn công ty), #7 (lưu nháp, không offline), **#31** (chỉ kiểm bãi và xưởng).

## What Changes

- **Phiên kiểm kê** mã `KK-<năm>-<3 số>` (VD `KK-2026-003`), bộ đếm `document_counter` có sẵn. Mỗi phiên = **1 vị trí bãi hoặc xưởng** + phạm vi chọn lúc bắt đầu (tất cả mã có tồn, hoặc một số nhóm hàng). Vị trí công trình bị từ chối. Một vị trí chỉ có **một phiên chưa xong** tại một lúc.
- **Trạng thái**: Đang đếm → Chờ duyệt → Đã ghi sổ; Giám đốc **trả lại** (kèm lý do) hoặc **yêu cầu đếm lại** một số dòng thì phiên về Đang đếm. Phiên chưa ghi sổ **hủy được** kèm lý do.
- **Dòng đếm** = (mã hàng + tình trạng). Lúc bắt đầu, hệ thống liệt kê các dòng có tồn tại vị trí trong phạm vi. Thủ kho **thêm được** tình trạng khác của một mã và **mã không có trong danh sách**.
- **Không khóa xuất nhập** trong lúc kiểm kê. **Đếm mù**: điện thoại không bao giờ nhận số sổ. Mỗi mã có giờ "Đếm mã này" và giờ **"Xong mã này"**; **số sổ lúc đếm** của từng dòng = tồn trong sổ kho tại vị trí đúng giờ "Xong mã này". **Chênh lệch = đếm − sổ lúc đếm**, nên phiếu nhập, xuất trong lúc đếm không làm sai kết quả.
- **Nháp đếm** lưu trên máy (IndexedDB, như M3), mất sóng vẫn đếm. Gửi văn phòng mang **mã lần gửi**: gửi lại cùng mã không tạo hai lần gửi.
- **Cờ cảnh báo** trên D13: có biến động của dòng đó trong lúc đang đếm mã; lệch **quá 1 %** số sổ (hoặc sổ 0 mà đếm có hàng); **nghi nhầm tình trạng** (cùng mã, một tình trạng thiếu, tình trạng khác thừa).
- **Dòng chưa đếm** không điều chỉnh. Dòng khớp không ghi gì.
- **Giám đốc duyệt = ghi sổ**, trong một transaction: dòng thiếu ghi `ADJUST_OUT`, dòng thừa ghi `ADJUST_IN`, tại vị trí của phiên, theo **giá BQ lúc duyệt**; **giá BQ không đổi**. Ngày nghiệp vụ = ngày duyệt. Kiểm tồn lại lúc duyệt. Duyệt hai lần chỉ ghi một bộ dòng. Dòng thừa của (mã + tình trạng) chưa từng có giá thì Giám đốc nhập đơn giá trước khi duyệt.
- **D13**: danh sách phiên, chi tiết phiên (thông tin, bốn ô tóm tắt Thiếu / Thừa / Khớp / Cần xem kỹ, bảng kết quả lọc Dòng lệch / Khớp / Tất cả, thanh duyệt). Nằm trong menu **Kho** ở `/inventory/stocktakes`.
- **Quyền mới** `stocktake.count` (Giám đốc, Thủ kho): bắt đầu, đếm, gửi, hủy phiên đang đếm. Xem D13 dùng `inventory.view` (văn phòng). Duyệt, trả lại, yêu cầu đếm lại dùng `inventory.approve` (Giám đốc).
- **Sửa `docs/ui.md` mục 3.3**: chuyển D13, M6 (và M6a) từ "Bản 2" sang "MVP" cho khớp roadmap.

## Ảnh hưởng tới sổ kho và giá vốn

- Chỉ thêm dòng `ADJUST_OUT` / `ADJUST_IN` mới (loại biến động đã có), qua `postMovements`. Không sửa dòng cũ.
- Giá BQ không đổi (#11): điều chỉnh ghi theo giá BQ hiện tại. Tổng giá trị trong sổ đổi đúng bằng chênh lệch × giá BQ.
- Số liệu đã có không bị ảnh hưởng; `npm run inventory:check` vẫn phải khớp sau khi duyệt.

## Ngoài phạm vi

- Kiểm kê hàng ở công trình (0.2 #31; đối chiếu khi thu hồi).
- Khóa xuất nhập trong lúc kiểm kê.
- Nhiều người đếm chung một phiên trên nhiều máy (mỗi phiên một người đếm; chia nhỏ bằng nhóm hàng).
- Đếm theo kệ, ô, khu vực trong bãi; quét mã QR từng chiếc.
- Lịch kiểm kê định kỳ, nhắc việc, báo cáo tỷ lệ hao hụt theo thời gian.
- Phiếu kiểm kê in giấy; xuất Excel kết quả.
- Đổi giá trị (không đổi số lượng) của hàng trong sổ (#42).
- Chạy hoàn toàn offline: bắt đầu phiên và gửi kết quả cần mạng (0.2 #7).

## Capabilities

### New Capabilities

- `stocktakes`: phiên kiểm kê bãi, xưởng: phạm vi, dòng đếm, đếm mù, số sổ lúc đếm, chênh lệch, cờ cảnh báo, gửi chống trùng, trả lại, đếm lại, hủy, duyệt ghi sổ điều chỉnh, quyền, màn M6a, M6, D13.

### Modified Capabilities

- `auth`: bảng quyền thêm `stocktake.count`.
- `mobile-home`: M1 có khối "Kiểm kê" (phiên đang đếm, cần đếm lại, nút bắt đầu).

## Impact

- **DB**: migration kế tiếp (dự kiến `drizzle/0007_stocktakes.sql`): bảng `stocktake`, `stocktake_group`, `stocktake_line`, trigger khóa phiên đã ghi sổ.
- **Code mới**: `src/domain/stocktake.ts` (logic thuần: chênh lệch, cờ, chỉnh giờ máy, dòng sổ), `src/lib/stocktakes/` (service, truy vấn), API `src/app/api/stocktakes/**`, trang `/m/stocktake/**` và `/inventory/stocktakes/**`.
- **Dùng lại**: `postMovements`, `lockForPosting`, `nextDocumentCode`, `adjustmentMovements` (dòng kiểu số lượng) của sổ kho; `src/lib/drafts/` (thêm loại nháp `STOCKTAKE`); `withAuth`, `requirePermission`.
- **Sửa nhỏ**: `src/domain/permissions.ts`, trang `/inventory` (thêm lối vào Kiểm kê), M1, seed dev (một phiên mẫu như D13), `docs/ui.md` mục 3.3.
- Không thêm thư viện.
