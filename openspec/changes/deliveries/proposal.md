# Proposal: deliveries

## Why

Hợp đồng đã duyệt (`contracts`) nhưng chưa có cách đưa hàng ra công trình. Hiện kế toán ghi số xuất từng đợt trong Excel, thủ kho nhặt theo giấy, và sổ kho không biết hàng nào đang ở công trình. Tiền thuê (`rental-billing`) và thu hồi (`returns-and-compensation`) đều cần **ngày giao và số thực giao** của từng đợt. Change này thêm **phiếu xuất theo đợt** (issue #10, roadmap dòng 11).

- Giai đoạn: **[MVP]**, issue #10, phụ thuộc `contracts` (đã xong).
- Màn hình: **D6** Tiến độ cấp hàng (theo hợp đồng / công trình), **M5** Nhặt hàng xuất kho. Thiết kế ở `docs/design/screens/D6-SiteDeliveries.dc.html`, `M5-Picking.dc.html`. Bản vẽ còn số kiểu `HĐ-2026-031` và nhãn "Bán & Thuê": khi code dùng số theo 0.2 #40 (VD `112026/ANPHAT-MINHPHAT`) và nhãn "Cho thuê & Bán" (0.2 #43).
- Quyết định đã chốt dùng: `docs/requirements.md` 0.2 #4, #5, #11, #17, #24, #33, #35, #38, #41, #43, #45, #47, #50, #51, và **#54–#60** chốt 03/11/2026 khi review PR #130, ghi trong PR này (trạng thái phiếu, ngày giao = ngày ghi sổ, còn phải giao, dung sai cân 10 %, rã bộ, xuất bán và phế liệu, cước và mẫu in).

## What Changes

- **Phiếu xuất** (`PX-2026-001`, đếm bằng `document_counter`) cho hợp đồng **Đã duyệt** hoặc **Đang thực hiện**, mỗi phiếu là **một đợt / một chuyến xe**, đánh số "Đợt 1, 2, 3…" theo hợp đồng. **Một phiếu lấy hàng từ một bãi.**
- **Văn phòng lập đợt trên D6**: chọn bộ (tự **rã thành linh kiện**) hoặc mã + số lượng. Gợi ý số từ **còn phải giao** và từ kế hoạch giao của hợp đồng (chỉ gợi ý, không ràng buộc). Mã phải có trên **bản hợp đồng đang áp dụng** tại ngày lập và ngày ghi sổ (`contractTermsAt`).
- **Thủ kho nhặt trên M5**: bấm "Bắt đầu nhặt", nhập số thực nhặt từng mã, **chọn Mới hoặc Tốt** (một mã chia được hai tình trạng), ghi biển số xe, bấm **"Xác nhận xe rời bãi"** thì ghi sổ kho. M5 **không hiện giá**. Nháp lưu trên máy như phiếu nhập; gửi lại cùng mã nháp không ghi sổ hai lần.
- **Trạng thái phiếu**: Chờ nhặt → Đang nhặt → Đã xuất; Đang nhặt → Chờ nhặt (thủ kho trả lại hoặc văn phòng rút về để sửa, kèm lý do); Chờ nhặt / Đang nhặt → Đã hủy. Phiếu đã xuất bị khóa.
- **Ngày giao = ngày ghi sổ** (ngày xe rời bãi, giờ Việt Nam). Không nhập tay, không ghi lùi. Đây là ngày tính thuê: không tính ngày giao, tính từ hôm sau (0.2 #4).
- **Ghi sổ trong một transaction** (phiếu + sổ kho + trạng thái hợp đồng + nhật ký) qua `postMovements`, khóa theo `lockForPosting`:
  - Thuê: `DELIVERY_OUT` ở bãi + `DELIVERY_IN` ở vị trí công trình, theo **giá BQ hiện tại**, không đổi giá BQ (0.2 #11, #24).
  - Bán: `SALE_OUT` ở bãi, theo tình trạng và cách tính của dòng hợp đồng bán; bán theo kg ghi **số cái theo đơn vị của mã** và **số kg cân** trên dòng sổ.
  - Phiếu xuất đầu tiên ghi sổ chuyển hợp đồng **Đã duyệt → Đang thực hiện**.
- **Xuất thiếu** (0.2 #17): thủ kho xác nhận số thực nhặt; phần thiếu không mất mà nằm trong **"Còn phải giao"** của hợp đồng để lập đợt sau. Không tự tạo phiếu mới.
- **Còn phải giao** (0.2 #56): thuê = số trên hợp đồng − **số đang ở công trình** (đọc từ sổ kho), nên trả rồi lấy lại không bị coi là vượt; bán = số trên hợp đồng − tổng đã giao.
- **Xuất vượt số trên hợp đồng**: hợp đồng thuê chỉ cảnh báo, người lập phải xác nhận (nhật ký gắn cờ "Có xác nhận bất thường"); hợp đồng bán bị chặn (cần phụ lục).
- **Bán theo kg** (0.2 #57): số cần là **kg**, so bằng kg cân; cân được vượt tới **10 %** (giống nhận dư hàng kg), hơn mới chặn. Hằng số dung sai một chỗ trong `src/domain`.
- **Thuê chỉ xuất Mới hoặc Tốt.** Bán theo đúng tình trạng của dòng hợp đồng (có thể là Phế liệu, bán theo kg).
- **Cước chiều đi**: "công ty gọi xe" và cước một chiều lấy từ hợp đồng làm mặc định, văn phòng sửa được trên phiếu; biển số xe gõ tay. Phiếu lưu số cước và đơn giá bán từng dòng để `receivables` đọc, không lưu số cộng dồn.
- **`hasDeliveries` thật**: hủy hợp đồng đã có phiếu xuất ghi sổ bị chặn; hủy hợp đồng còn phiếu xuất chưa xong cũng bị chặn (hủy phiếu trước).
- **D6**: hàng đang ở công trình (đã xuất, đã trả, đang ở công trình, tiền 1 ngày), còn phải giao, dòng thời gian các đợt; hợp đồng bán hiện đã giao / còn phải giao. Mở từ D5.
- **In phiếu xuất** (thông tin công ty từ Cài đặt, không viết cứng); phiếu chưa xuất in ra **phiếu nhặt hàng** không có giá.
- **M1, M7**: thẻ "Xuất hàng" trên Việc hôm nay; lịch sử có loại "Xuất".
- **Quyền**: lập, sửa, hủy, rút về theo `canContract(loại, "manage")` (vai trò + phạm vi hợp đồng của Kinh doanh, 0.2 #51); nhặt, trả lại, xác nhận theo quyền mới `deliveries.pick` (Giám đốc, Thủ kho). Kiểm ở server.
- Mọi lệnh ghi gọi `logActivity` trong transaction; sửa gửi kèm `updatedAt`, lệch thì 409; khóa `FOR UPDATE` trước khi kiểm tra. Ô ngày dùng `DateInput`. Chữ theo 0.2 #45.

## Ảnh hưởng tới sổ kho và giá vốn

- **Thêm dòng sổ mới**, không đụng dòng cũ. Xuất thuê chỉ **chuyển chỗ** bãi → công trình: tổng tồn và giá BQ của (mã + tình trạng) **không đổi**, tồn bãi giảm, tồn công trình tăng (0.2 #24). Xuất bán làm tổng tồn giảm, giá BQ không đổi.
- Tồn bãi không âm: xuất quá số tồn bị từ chối toàn phiếu.
- Số liệu đã có (tồn đầu kỳ, nhập, sửa, kiểm kê) không đổi. `npm run inventory:check` vẫn khớp sau khi xuất.

## Ngoài phạm vi

- Chuyển thẳng giữa công trình, mua lại, đổi hàng (0.2 #38) và thu hồi: change `returns-and-compensation`. D6 chỉ hiện cột "Đã trả" = 0 và chỗ cho dòng thu hồi.
- Tính tiền thuê theo kỳ (`rental-billing`): phiếu chỉ lưu ngày giao và số giao.
- Ghi công nợ cước và tiền bán, hạn thanh toán của hàng bán (`receivables`): phiếu chỉ lưu số để change đó đọc.
- Danh mục xe, tài xế (`truck-management`): biển số gõ tay.
- Xuất từ xưởng, xuất từ nhiều bãi trong một phiếu, giữ hàng (reserve) khi lập đợt.
- Quét QR trên M5 (dùng lại sau nếu cần); chụp ảnh khi xuất.

## Capabilities

### New Capabilities

- `deliveries`: phiếu xuất theo đợt của hợp đồng: lập đợt và rã bộ, trạng thái, điều kiện hợp đồng và mã, còn phải giao, xuất thiếu, xuất vượt, ngày giao, ghi sổ thuê/bán, bán theo kg, cước và biển số, đồng thời và chống ghi trùng, quyền, nhật ký, D6, in phiếu.
- `delivery-picking`: nhặt hàng trên điện thoại (M5): danh sách đã rã bộ, chọn Mới/Tốt, nhập số thực nhặt và kg cân, không hiện giá, nháp trên máy, xác nhận xe rời bãi, trả lại văn phòng.

### Modified Capabilities

- `contracts`: Đã duyệt → Đang thực hiện khi phiếu xuất đầu tiên ghi sổ; không hủy hợp đồng còn phiếu xuất chưa xong.
- `auth`: bảng quyền thêm `deliveries.pick`.
- `activity-log`: phiếu xuất nằm trong danh sách chứng từ được ghi nhật ký (thêm thao tác "Bắt đầu nhặt").
- `mobile-home`: khối "Xuất hàng" trên Việc hôm nay.
- `mobile-history`: Lịch sử có phiếu xuất và bộ lọc "Xuất".

## Impact

- **DB:** migration `drizzle/0015_deliveries.sql`: bảng `delivery_note`, `delivery_note_kit`, `delivery_note_line`, `delivery_note_pick`; trigger khóa phiếu đã xuất, đã hủy; tạo lại check `activity_log` cho loại `DELIVERY_NOTE` và thao tác `START`. Bảng thường (CRUD) cho `erp_app`.
- **Code:** `src/domain/delivery-note.ts` (trạng thái, rã bộ, còn phải giao, tiền dòng bán, tóm tắt nhật ký), `src/domain/tolerance.ts` (dung sai 10 % dùng chung với nhận hàng `receipt-anomalies.ts`), `src/lib/deliveries/` (service, ghi sổ, truy vấn D6/M5), thân thật của `src/lib/contracts/deliveries.ts` (`hasDeliveries`), `src/lib/contracts/approval.ts` (chặn hủy khi còn phiếu mở), `src/lib/drafts/` (loại nháp `DELIVERY`), `src/domain/permissions.ts` (`deliveries.pick`), `src/domain/activity.ts`.
- **API:** `/api/deliveries` (lập, sửa, hủy, rút về, bắt đầu nhặt, trả lại, ghi sổ), `/api/contracts/[id]/deliveries` (D6).
- **Trang:** `/sales/contracts/[id]/deliveries` (D6), `/sales/deliveries/[code]` (chi tiết + in), `/m/deliveries/[code]` (M5); khối mới trên `/m` và `/m/history`.
- **Seed dev:** một phiếu đã xuất và một phiếu Chờ nhặt cho hợp đồng thuê mẫu đã duyệt.
- **Change sau đọc:** `rental-billing` (ngày giao, số giao theo mã ở công trình), `receivables` (cước, tiền bán), `returns-and-compensation` (đang ở công trình).
