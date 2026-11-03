# Proposal: returns-and-compensation

## Why

Hàng đã ra công trình (`deliveries`) nhưng chưa có cách đưa về. Hiện thủ kho đếm hàng trả về trên giấy, kế toán tính đền bù hỏng / mất bằng Excel theo bảng giá trong hợp đồng, và sổ kho không biết hàng nào đã về bãi. Vì vậy "đang ở công trình", "còn phải giao" và cột "Đã trả" của D6 chưa đúng sau khi khách trả hàng. Tiền thuê (`rental-billing`) cần **ngày trả**, công nợ (`receivables`) cần **tiền đền bù đã duyệt**. Change này thêm **phiếu thu hồi** và **phiếu đền bù** (issue #11, roadmap dòng 12).

- Giai đoạn: **[MVP]**, issue #11, phụ thuộc `deliveries` (đã archive, PR #130, #131).
- Màn hình:
  - **M4** Nhập thu hồi trên điện thoại.
  - **D8** Phiếu đền bù (Giám đốc duyệt).
  - Sửa **D6** (cột "Đã trả", dòng thu hồi trong dòng thời gian), **M1**, **M7**.
- Thiết kế: `docs/design/screens/M4-ReturnNote.dc.html`, `D8-Compensation.dc.html`. Hai bản vẽ còn dùng số kiểu `HĐ-2026-031` và nhãn menu "Bán & Thuê". Khi code dùng số theo 0.2 #40 (VD `112026/ANPHAT-MINHPHAT`) và nhãn "Cho thuê & Bán" (0.2 #43).
- Quyết định đã chốt dùng: `docs/requirements.md` 0.2 #4, #6, #11, #15, #18, #20, #21, #22, #23, #24, #27, #33, #35, #45, #51, #55, #56.
- Các điểm cần chốt của issue có phương án trong `design.md` (D1–D6). Anh đã chốt khi review PR #134 (03/11/2026), ghi ở 0.2 **#61–#65** trong PR này.

## What Changes

- **Phiếu thu hồi** (`PTH-2026-001`, đếm bằng `document_counter`). Mỗi phiếu thuộc đúng **một hợp đồng thuê Đang thực hiện** và về đúng **một bãi**.
- **Thủ kho nhập trên M4** khi xe hạ tải ở bãi:
  - chọn công trình / hợp đồng, rồi chọn bãi nhận;
  - đếm từng mã (chỉ những mã đang ở công trình của hợp đồng);
  - chia số trả về thành **Tốt / Chờ sửa / Phế liệu**, và nhập số **Mất**;
  - nhập biển số xe, chụp ảnh hiện trạng, bấm "Lưu phiếu thu hồi" thì ghi sổ.
  - M4 **không hiện giá đền bù**.
- **Không trả quá** số đang ở công trình của hợp đồng (Tốt + Chờ sửa + Phế liệu + Mất). **Mã không có ở công trình của hợp đồng thì chặn**, kể cả hàng của hợp đồng khác (lập phiếu riêng cho hợp đồng đó).
- **Ngày trả = ngày ghi sổ** (giờ Việt Nam), như ngày giao (0.2 #55). Không ghi lùi. Thuê tính tới hết ngày trả (0.2 #4). Hàng Mất coi như trả cùng ngày đó (0.2 #21).
- **Ghi sổ trong một transaction** (phiếu + sổ kho + phiếu đền bù + nhật ký) qua `postMovements`. Khóa hợp đồng rồi phiếu, như `postDelivery`.
  - Hàng trả về: `RETURN_OUT` ở vị trí công trình, `RETURN_IN` ở bãi. Ghi theo **giá BQ hiện tại**, không đổi giá BQ (0.2 #11, #24).
  - Ở công trình hàng là Mới hoặc Tốt; về bãi thành Tốt / Chờ sửa / Phế liệu. Hệ thống tự rút **Mới trước, rồi Tốt** (design D1).
  - Phế liệu chưa từng có giá: đơn giá = min(kg × giá sắt vụn, giá dòng ra), như 0.2 #23, #27 (0.2 #62).
  - Hàng Mất: loại dòng sổ mới **`LOSS_OUT`** ở vị trí công trình, giá trị = số × giá BQ. Hàng ra khỏi sổ công ty (design D2).
- **"Đang ở công trình" tính cả thu hồi và hàng mất.** `onSiteByItem` đọc thêm dòng sổ của phiếu thu hồi. Nhờ đó "còn phải giao" (0.2 #56) đúng. D6 có cột "Đã trả" (hàng về bãi) và cột "Mất" riêng. Dòng thời gian D6 có thêm phiếu thu hồi.
- **Phiếu đền bù** (`ĐB-2026-001`) **tự sinh cùng lúc ghi sổ** khi phiếu có hàng Chờ sửa, Phế liệu hoặc Mất. Không có dòng nào như vậy thì không có phiếu đền bù.
  - Đơn giá theo 0.2 #20: Chờ sửa = giá "hỏng, sửa được"; **Phế liệu = giá mất**; Mất = giá mất.
  - Giá lấy từ **bản hợp đồng đang áp dụng tại ngày trả** (`contractTermsAt`).
  - Hợp đồng chưa có giá cho một mã thì dòng đó "Chưa có giá"; Giám đốc nhập giá trước khi duyệt.
- **Chỉ Giám đốc duyệt hoặc từ chối** phiếu đền bù (D8):
  - giảm trừ **bắt buộc lý do**;
  - nhà thầu đang nợ quá hạn thì chỉ cảnh báo, duyệt **bắt buộc lý do** (như 0.2 #15, dùng `overdueDebt`);
  - từ chối bắt buộc lý do, phiếu thành Đã từ chối và không phải thu;
  - duyệt hai lần cùng lúc chỉ ghi một lần.
- **Phiếu đã duyệt lưu số để `receivables` đọc**:
  - tiền phải thu (sau giảm trừ);
  - ngày duyệt;
  - **hạn trả** = ngày duyệt + số ngày được nợ của hợp đồng (0.2 #18).
  - Không lưu số cộng dồn. Phiếu đã duyệt hoặc từ chối bị trigger khóa.
- **Ảnh hiện trạng** theo yêu cầu bảo mật của issue #11 (design D4):
  - kiểm loại file theo nội dung (magic bytes JPEG / PNG / WebP);
  - xóa EXIF, nén lại ở server;
  - lưu riêng tư trong Postgres, xem qua route bọc `withAuth`;
  - tên do server sinh; giới hạn **4 MB / ảnh gửi lên**, **6 ảnh / phiếu**, lưu WebP 1.280 px chất lượng 70 (khoảng 100 KB);
  - cảnh báo trên `/api/health` và Cài đặt khi tổng ảnh vượt **200 MB** (Neon Free 0,5 GB cho cả DB); mốc chuyển sang kho đối tượng ghi ở `docs/ops/demo.md`;
  - ảnh nháp đã bị dọn (sau 7 ngày) thì server trả 422, máy gửi lại ảnh từ nháp.
  - Ảnh của phiếu đã ghi sổ chỉ ghi thêm.
- **Nháp điện thoại** như phiếu xuất:
  - nháp loại mới `RETURN` trong IndexedDB (`src/lib/drafts/`);
  - `client_draft_id` chống ghi sổ hai lần;
  - ảnh chờ gửi khi mất sóng, gửi lại cùng nháp.
- **Quyền** (kiểm ở server):
  - quyền mới `returns.receive` (Giám đốc, Thủ kho) để nhập thu hồi và gửi ảnh;
  - xem phiếu thu hồi, D8 và ảnh theo `canContract("RENTAL", "view")` (0.2 #51); Thủ kho xem lại phiếu và ảnh của mình trên M7;
  - quyền mới `compensations.approve` chỉ Giám đốc.
- **M1** có khối "Thu hồi" với nút "Nhập thu hồi". **M7** có phiếu thu hồi và bộ lọc "Thu hồi".
- Desktop:
  - chi tiết phiếu thu hồi `/sales/returns/[code]`;
  - danh sách phiếu đền bù `/sales/compensations` (lọc Chờ duyệt);
  - D8 `/sales/compensations/[code]`.
- Mọi lệnh ghi gọi `logActivity` trong transaction. Sửa gửi kèm `updatedAt`, lệch thì 409. Khóa `FOR UPDATE` trước khi kiểm tra. Ô ngày dùng `DateInput`. Chữ theo 0.2 #45.

## Ảnh hưởng tới sổ kho và giá vốn

- **Chỉ thêm dòng sổ mới**, không đụng dòng cũ. Số liệu đã có (nhập, xuất, sửa, kiểm kê) không đổi.
- **Trả về đúng tình trạng** (Tốt → Tốt) chỉ là chuyển chỗ công trình → bãi. Tổng tồn và giá BQ không đổi.
- **Trả về khác tình trạng** (Mới / Tốt → Chờ sửa / Phế liệu):
  - hàng ra ở giá BQ cũ và vào ở giá BQ của tình trạng mới;
  - giá BQ của mọi (mã + tình trạng) không đổi; tồn × giá BQ của từng nhóm vẫn khớp (0.2 #24);
  - tổng giá trị kho giảm đúng phần chênh. Phần chênh hiện trên phiếu là "Giá trị giảm do hư hỏng".
- **Hàng Mất** làm tổng tồn và tổng giá trị kho giảm (số × giá BQ). Giá BQ không đổi.
- `npm run inventory:check` vẫn khớp sau khi thu hồi.
- Thêm loại biến động `LOSS_OUT`: tạo lại check `inventory_ledger_movement_check`. Dòng cũ không đổi.

## Ngoài phạm vi

- Chuyển thẳng giữa công trình, mua lại, đổi hàng (0.2 #5, #38): change `site-operations` (#132).
- Cấn trừ cọc và ghi công nợ (0.2 #40): change `receivables`. Phiếu đền bù chỉ lưu số và hạn trả để change đó đọc.
- Tính tiền thuê theo kỳ: change `rental-billing`. Phiếu thu hồi chỉ lưu ngày trả và số trả.
- Thanh lý hợp đồng khi trả hết hàng (Đang thực hiện → Thanh lý).
- Sửa hay hủy phiếu thu hồi đã ghi sổ. Đếm sai thì sửa bằng phiếu điều chỉnh tồn (`stock-adjustments`) và giảm trừ trên phiếu đền bù.
- Cước xe chiều về, in phiếu thu hồi, quét QR trên M4.
- Thu hồi cho hợp đồng bán (không có hàng ở công trình).

## Capabilities

### New Capabilities

- `returns`: phiếu thu hồi của hợp đồng thuê. Gồm:
  - chọn công trình và bãi; đếm và chia Tốt / Chờ sửa / Phế liệu / Mất;
  - giới hạn theo hàng đang ở công trình, chặn mã lạ;
  - ngày trả, ghi sổ (thứ tự rút Mới / Tốt, hàng mất);
  - chống ghi trùng, nháp điện thoại, M4 không giá;
  - quyền, nhật ký, chi tiết phiếu trên desktop.
- `compensations`: phiếu đền bù. Gồm:
  - tự sinh khi ghi sổ thu hồi; đơn giá theo tình trạng và bản hợp đồng tại ngày trả; dòng chưa có giá;
  - giảm trừ có lý do; duyệt, từ chối; cảnh báo nợ quá hạn;
  - số lưu cho công nợ, hạn trả, khóa sau duyệt;
  - quyền, nhật ký, D8 và danh sách.
- `return-photos`: ảnh hiện trạng của phiếu thu hồi. Gồm:
  - kiểm loại file theo nội dung, giới hạn dung lượng và số ảnh;
  - xóa EXIF, nén lại; lưu riêng tư, tên do server sinh;
  - xem qua `withAuth`, ảnh chờ gửi từ nháp, chỉ ghi thêm sau ghi sổ.

### Modified Capabilities

- `inventory-ledger`: thêm loại biến động `LOSS_OUT` (hàng mất ở công trình); thu hồi về Phế liệu chưa từng có giá lấy giá theo giá sắt vụn.
- `system-health`: cảnh báo dung lượng ảnh thu hồi.
- `deliveries`: "đang ở công trình", "còn phải giao" tính cả phiếu thu hồi và hàng mất; D6 có cột "Đã trả" và "Mất"; dòng thời gian D6 có phiếu thu hồi.
- `auth`: bảng quyền thêm `returns.receive`, `compensations.approve`.
- `activity-log`: phiếu thu hồi và phiếu đền bù được ghi nhật ký, lọc được trên D18.
- `mobile-home`: khối "Thu hồi" trên Việc hôm nay.
- `mobile-history`: Lịch sử có phiếu thu hồi và bộ lọc "Thu hồi".

## Impact

- **DB:** migration `drizzle/0016_returns.sql`.
  - Bảng phiếu thu hồi: `return_note`, `return_note_line`.
  - Bảng phiếu đền bù: `compensation_note`, `compensation_note_line`.
  - Bảng ảnh: `return_photo` (`bytea`).
  - Trigger khóa phiếu đền bù đã duyệt / từ chối và phiếu thu hồi đã ghi sổ.
  - Tạo lại check `inventory_ledger` cho `LOSS_OUT`, check `activity_log` cho loại `RETURN_NOTE`, `COMPENSATION_NOTE` và thao tác `REJECT`.
  - Bảng thường (CRUD) cho `erp_app`.
- **Thư viện mới:** `sharp` (xóa EXIF, nén ảnh ở server). Anh đã đồng ý khi review PR #134.
- **Code:**
  - `src/domain/return-note.ts`: chia tình trạng, thứ tự rút Mới / Tốt, giới hạn đang ở công trình.
  - `src/domain/compensation.ts`: đơn giá theo tình trạng, tổng, giảm trừ, hạn trả.
  - `src/domain/image-type.ts`: magic bytes.
  - `src/lib/returns/`, `src/lib/compensations/`.
  - `src/lib/deliveries/records.ts`: `onSiteByItem` cộng thêm phiếu thu hồi.
  - `src/lib/drafts/`: loại nháp `RETURN` và ảnh chờ gửi.
  - `src/domain/permissions.ts`, `src/domain/activity.ts`, `src/domain/movement.ts`.
- **API:**
  - `/api/m/returns`: danh sách hợp đồng, mở hợp đồng, gửi ảnh, ghi sổ.
  - `/api/returns/[code]` và `/api/returns/photos/[id]`.
  - `/api/compensations`: danh sách, sửa giá / giảm trừ, duyệt, từ chối.
- **Trang:**
  - `/m/returns/new` (M4), `/m/returns/[code]` (chỉ xem);
  - `/sales/returns/[code]`, `/sales/compensations`, `/sales/compensations/[code]` (D8);
  - sửa `/sales/contracts/[id]/deliveries` (D6), `/m`, `/m/history`, Cài đặt (cảnh báo dung lượng ảnh);
  - `/api/health` thêm `photoStorage`.
- **Tài liệu:** `docs/requirements.md` 0.2 #61–#65, `docs/ops/demo.md` (dung lượng ảnh và mốc chuyển kho) trong PR propose này.
- **Seed dev:** một phiếu thu hồi của hợp đồng An Phú – Block B có hàng Chờ sửa, Phế liệu, Mất và phiếu đền bù Chờ duyệt như D8.
- **Change sau đọc:** `rental-billing` (ngày trả, số trả và hàng mất ở công trình), `receivables` (tiền đền bù đã duyệt, hạn trả), `site-operations` (đang ở công trình theo tình trạng).
