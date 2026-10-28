# Proposal: simple-repair

## Why

Hàng Chờ sửa đang nằm im trong sổ kho: chưa có cách ghi "sửa xong về Tốt" hay "hỏng hẳn sang Phế liệu", và chi phí sửa chưa vào giá vốn. Change này thêm **phiếu sửa chữa đơn giản** (D12): văn phòng ghi một lần khi xưởng sửa xong, hệ thống chuyển tình trạng và cộng chi phí sửa vào giá vốn Tốt.

- Giai đoạn: **[MVP]**, change số 07 trong `docs/roadmap.md`, issue #12.
- Màn hình: **D12** Phiếu sửa chữa (`docs/design/screens/D12-Repair.dc.html`, đã duyệt) và danh sách phiếu ở mục menu **Sửa chữa** (thay trang chờ hiện có).
- Quyết định đã chốt dùng: `docs/requirements.md` mục 0.2 số 1, 3, 10, 11, 24, 27 (giá sắt vụn), 30 (cách hỏi lại), và **#23 sửa 28/10/2026** (chốt khi review PR #53: phế liệu từ phiếu sửa tính theo giá sắt vụn).

## What Changes

- **Phiếu sửa chữa** mã `PSC-<năm>-<3 số>` (VD `PSC-2026-024`), bộ đếm `document_counter` có sẵn. Trạng thái **Nháp → Đã ghi sổ**. Nháp sửa, xóa được; đã ghi sổ thì khóa.
- **Thông tin chung**: ngày sửa xong (thông tin trên phiếu, mặc định hôm nay), người/tổ sửa, ghi chú, **lấy hàng tại** và **nhập về** (bãi hoặc xưởng, mặc định bãi đang dùng đầu tiên). Sổ kho ghi theo **ngày ghi sổ**, không theo ngày sửa xong.
- **Mỗi dòng một mã hàng tính theo cái**: số lấy ra, sửa xong → Tốt, hỏng hẳn → Phế liệu, chi phí sửa (₫, gộp tiền công, sơn, que hàn…). Luật: **sửa xong + phế liệu = số lấy ra**; chi phí chỉ có khi có hàng sửa xong.
- **Ghi sổ kho** trong một transaction với việc chuyển phiếu sang Đã ghi sổ, qua `postMovements`:
  - `REPAIR_OUT` −(số lấy ra) Chờ sửa tại chỗ lấy, theo giá BQ Chờ sửa (B);
  - `REPAIR_IN` +(phế liệu) Phế liệu tại chỗ nhập, giá trị = min(kg quy đổi × giá sắt vụn, phế liệu × B) (0.2 #23 sửa, như #27);
  - `REPAIR_IN` +(sửa xong) Tốt tại chỗ nhập, giá trị = sửa xong × B + chi phí sửa + **phần hỏng** (phế liệu × B − giá trị phế liệu) (**đổi giá BQ Tốt**).
- **Cả dòng hỏng hết** (sửa xong 0): phần hỏng thành **lỗ hỏng hàng**, sổ giảm đúng số đó; phiếu lưu và D12 hiện.
- **Giá vốn khi vào Tốt** = B + (chi phí + phần hỏng) ÷ số sửa xong, làm tròn 1 ₫ (0.2 #10). Giá trị dòng sổ giữ đúng từng đồng.
- **Phế liệu đếm theo cái** (0.2 #3), hiện kèm kg quy đổi; không đổi sang kg, chỉ giá theo giá sắt vụn. Có phế liệu mà chưa có giá sắt vụn thì không ghi sổ được.
- **Hỏi lại khi bất thường** (theo cách 0.2 #30): chi phí sửa mỗi cái **lớn hơn giá BQ Tốt hiện tại** thì phải xác nhận trước khi ghi sổ. Server tự kiểm lại; phần đã xác nhận lưu trên phiếu.
- **D12** như bản vẽ: bảng hàng đem sửa, khối "Giá vốn sau sửa" (giá Chờ sửa + chi phí + phần hỏng = giá vào Tốt, giá BQ Tốt trước → sau, giá phế liệu theo giá sắt vụn), danh sách "Đang chờ sửa tại …" để thêm mã, nút "Lưu nháp" và "Ghi sổ kho".
- **Danh sách phiếu** `/repairs`: mã, ngày sửa xong, lấy tại → nhập về, số mã, sửa xong, phế liệu, tổng chi phí, trạng thái.
- **Quyền mới** `repairs.manage` (Giám đốc, Kế toán): lập, sửa, xóa nháp, ghi sổ. Xem dùng `repairs.view` có sẵn (Giám đốc, Kế toán, Kinh doanh).
- **Lưu vết rẻ** (theo hướng #47): phiếu lưu người lập, người ghi sổ, thời điểm và phần bất thường đã xác nhận. Không làm bảng nhật ký chung.

## Capabilities

### New Capabilities

- `repair-orders`: phiếu sửa chữa đơn giản: dòng hàng và luật số lượng, chi phí theo mã, vị trí lấy và nhập, ghi sổ kho và giá vốn, hỏi lại khi chi phí cao, trạng thái, quyền, màn D12 và danh sách phiếu.

### Modified Capabilities

- `auth`: bảng quyền thêm `repairs.manage`.

## Impact

- **Sổ kho và giá vốn**: chỉ thêm dòng mới (`REPAIR_OUT`, `REPAIR_IN`), loại biến động đã có trong `inventory-ledger`. Không đổi số liệu đã ghi. Mỗi phiếu ghi sổ làm đổi giá BQ Tốt và Phế liệu của mã liên quan, tính trên toàn bộ hàng công ty (0.2 #24). Tổng giá trị trong sổ thay đổi đúng bằng tổng chi phí sửa trừ lỗ hỏng hàng của phiếu. Phế liệu từ phiếu sửa pha vào giá BQ Phế liệu theo giá sắt vụn, cùng cách với phế liệu mua về.
- **Code**: bảng `repair_order`, `repair_order_line` (migration mới); `src/domain/repair-order.ts` (luật dòng, giá vào Tốt, bất thường); `src/lib/repairs/` (service, truy vấn); `src/lib/inventory/post.ts` gom phần khóa (vật tư → vị trí → giá) thành một hàm xuất ra để tính giá trong cùng transaction, giữ thứ tự khóa chung; route `/api/repairs/*`; trang `(desktop)/repairs`.
- **Quyền**: `src/domain/permissions.ts` thêm `repairs.manage`; `route-guards.test.ts` bắt route mới.
- **Tài liệu**: `docs/requirements.md` 0.2 #23 viết lại theo luật mới (sửa 28/10/2026).
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
