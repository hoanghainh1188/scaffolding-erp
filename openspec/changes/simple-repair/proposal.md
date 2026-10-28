# Proposal: simple-repair

## Why

Hàng Chờ sửa đang nằm im trong sổ kho: chưa có cách ghi "sửa xong về Tốt" hay "hỏng hẳn sang Phế liệu", và chi phí sửa chưa vào giá vốn. Change này thêm **phiếu sửa chữa đơn giản** (D12): văn phòng ghi một lần khi xưởng sửa xong, hệ thống chuyển tình trạng và cộng chi phí sửa vào giá vốn Tốt.

- Giai đoạn: **[MVP]**, change số 07 trong `docs/roadmap.md`, issue #12.
- Màn hình: **D12** Phiếu sửa chữa (`docs/design/screens/D12-Repair.dc.html`, đã duyệt) và danh sách phiếu ở mục menu **Sửa chữa** (thay trang chờ hiện có).
- Quyết định đã chốt dùng: `docs/requirements.md` mục 0.2 số 1, 3, 10, 11, 23, 24, 30 (cách hỏi lại).

## What Changes

- **Phiếu sửa chữa** mã `PSC-<năm>-<3 số>` (VD `PSC-2026-024`), bộ đếm `document_counter` có sẵn. Trạng thái **Nháp → Đã ghi sổ**. Nháp sửa, xóa được; đã ghi sổ thì khóa.
- **Thông tin chung**: ngày sửa xong (ngày nghiệp vụ, mặc định hôm nay), người/tổ sửa, ghi chú, **lấy hàng tại** và **nhập về** (bãi hoặc xưởng, mặc định `BAI-01`).
- **Mỗi dòng một mã hàng tính theo cái**: số lấy ra, sửa xong → Tốt, hỏng hẳn → Phế liệu, chi phí sửa (₫, gộp tiền công, sơn, que hàn…). Luật: **sửa xong + phế liệu = số lấy ra**; chi phí chỉ có khi có hàng sửa xong.
- **Ghi sổ kho** trong một transaction với việc chuyển phiếu sang Đã ghi sổ, qua `postMovements`:
  - `REPAIR_OUT` −(số lấy ra) Chờ sửa tại chỗ lấy, theo giá BQ Chờ sửa;
  - `REPAIR_IN` +(sửa xong) Tốt tại chỗ nhập, giá trị = sửa xong × giá BQ Chờ sửa + chi phí sửa (**đổi giá BQ Tốt**);
  - `REPAIR_IN` +(phế liệu) Phế liệu tại chỗ nhập, giá trị = phế liệu × giá BQ Chờ sửa (không gánh chi phí sửa, 0.2 #23).
- **Giá vốn khi vào Tốt** = giá BQ Chờ sửa + chi phí ÷ số sửa xong, làm tròn 1 ₫ (0.2 #10). Giá trị dòng sổ giữ đúng từng đồng chi phí đã nhập.
- **Phế liệu đếm theo cái** (0.2 #3), hiện kèm kg quy đổi; không đổi sang kg.
- **Hỏi lại khi bất thường** (theo cách 0.2 #30): chi phí sửa mỗi cái **lớn hơn giá BQ Tốt hiện tại** thì phải xác nhận trước khi ghi sổ. Server tự kiểm lại; phần đã xác nhận lưu trên phiếu.
- **D12** như bản vẽ: bảng hàng đem sửa, khối "Giá vốn sau sửa" (giá Chờ sửa + chi phí = giá vào Tốt, giá BQ Tốt trước → sau), danh sách "Đang chờ sửa tại …" để thêm mã, nút "Lưu nháp" và "Ghi sổ kho".
- **Danh sách phiếu** `/repairs`: mã, ngày sửa xong, lấy tại → nhập về, số mã, sửa xong, phế liệu, tổng chi phí, trạng thái.
- **Quyền mới** `repairs.manage` (Giám đốc, Kế toán): lập, sửa, xóa nháp, ghi sổ. Xem dùng `repairs.view` có sẵn (Giám đốc, Kế toán, Kinh doanh).
- **Lưu vết rẻ** (theo hướng #47): phiếu lưu người lập, người ghi sổ, thời điểm và phần bất thường đã xác nhận. Không làm bảng nhật ký chung.

## Capabilities

### New Capabilities

- `repair-orders`: phiếu sửa chữa đơn giản: dòng hàng và luật số lượng, chi phí theo mã, vị trí lấy và nhập, ghi sổ kho và giá vốn, hỏi lại khi chi phí cao, trạng thái, quyền, màn D12 và danh sách phiếu.

### Modified Capabilities

- `auth`: bảng quyền thêm `repairs.manage`.

## Impact

- **Sổ kho và giá vốn**: chỉ thêm dòng mới (`REPAIR_OUT`, `REPAIR_IN`), loại biến động đã có trong `inventory-ledger`. Không đổi số liệu đã ghi. Mỗi phiếu ghi sổ làm đổi giá BQ Tốt và Phế liệu của mã liên quan, tính trên toàn bộ hàng công ty (0.2 #24). Tổng giá trị trong sổ tăng đúng bằng tổng chi phí sửa của phiếu.
- **Code**: bảng `repair_order`, `repair_order_line` (migration mới); `src/domain/repair-order.ts` (luật dòng, giá vào Tốt, bất thường); `src/lib/repairs/` (service, truy vấn); `src/lib/inventory/post.ts` xuất thêm hàm khóa và đọc giá BQ để tính giá trong cùng transaction; route `/api/repairs/*`; trang `(desktop)/repairs`.
- **Quyền**: `src/domain/permissions.ts` thêm `repairs.manage`; `route-guards.test.ts` bắt route mới.
- **Dữ liệu mẫu**: bộ đếm `PSC` 2026 bắt đầu sau `PSC-2026-021` (dòng mẫu đã có trong sổ kho), thêm một phiếu nháp như D12.
- Không thêm thư viện.

## Ngoài phạm vi

- **Lệnh sửa chữa đầy đủ** (đưa hàng vào xưởng, vật tư phụ, công thợ, nghiệm thu, Xưởng dùng điện thoại M8): `repair-work-orders`, Bản 2.
- Ghi riêng việc chuyển hàng bãi ↔ xưởng trước khi sửa: phiếu chỉ ghi kết quả sau sửa.
- Sửa mã tính theo kg (VD `PL-SAT`) hay hàng ở công trình.
- Giám đốc duyệt phiếu sửa (0.2 #6 chỉ yêu cầu duyệt hợp đồng và đền bù).
- Hủy hay sửa phiếu đã ghi sổ: sai thì lập phiếu điều chỉnh (`stock-adjustments`); sửa giá trị chờ #42.
- Bảng nhật ký thao tác chung và màn xem (#47).
- Công nợ phải trả cho thợ ngoài (`payables`, Bản 2).
