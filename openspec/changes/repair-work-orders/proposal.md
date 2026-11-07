# Proposal: Lệnh sửa chữa đầy đủ (`repair-work-orders`) [Bản 2]

## Why

- Phiếu sửa đơn giản (`simple-repair`, D12 đơn giản) chỉ có Nháp → Đã ghi sổ. Kế toán gõ tay chi phí sửa từng mã, và xưởng không ghi được gì trên hệ thống.
- Thực tế, văn phòng giao việc cho xưởng, xưởng rút hàng từ bãi, sửa, dùng que hàn, sơn, bu lông, rồi Thủ kho đếm lại. Không bước nào để lại dấu trên sổ kho. Tồn vật tư ở xưởng không ai biết, và công thợ không đối chiếu được.
- Các quyết định 0.2 số 117–120 (07/11/2026) đã chốt: công khoán theo cái, vật tư phụ xuất từ tồn kho, rút hàng sang xưởng khi xưởng nhận, nghiệm thu bởi Thủ kho. Thiết kế D12 đầy đủ và M8 đã duyệt (PR #157).

## What Changes

- **Lệnh sửa chữa** (mã `PSC-YYYY-NNN`, cùng dãy số với phiếu sửa cũ):
  - Trạng thái: Nháp → Đã giao → Đang sửa → Chờ nghiệm thu → Đã đếm → Đã ghi sổ.
  - Thêm Hủy, và "Trả lại xưởng sửa số" từ Chờ nghiệm thu / Đã đếm về Đang sửa.
- **Văn phòng** (Giám đốc, Kế toán) lập lệnh trên D12: xưởng, tổ sửa, bãi lấy hàng, các mã Chờ sửa và số lấy ra. Khi giao xưởng, đơn giá công của từng mã được chụp lại.
- **Xưởng nhận lệnh trên M8**: ghi sổ chuyển hàng Chờ sửa bãi → xưởng (`TRANSFER_OUT` / `TRANSFER_IN`, không đổi giá, 0.2 #119).
- **Xưởng ghi trên M8** số sửa xong, số hỏng → phế, và vật tư phụ đã dùng theo từng mã, rồi bấm "Báo sửa xong". M8 không hiện giá. Nháp lưu trên máy như M3.
- **Thủ kho đếm lại** trên cùng màn M8 và xác nhận số. D12 hiện số xưởng báo cạnh số Thủ kho đếm khi hai số khác nhau.
- **Kế toán ghi sổ lệnh** trong một transaction:
  - Xuất Chờ sửa ở xưởng.
  - Nhập Tốt và Phế liệu ở xưởng.
  - Xuất vật tư ở xưởng theo giá BQ.
  - Công = sửa xong × đơn giá đã chụp. Chi phí sửa = công + vật tư, tính ra, không nhập tay.
  - Phế liệu, phần hỏng, giá vào Tốt dùng đúng công thức 0.2 #23.
- **Danh mục D9**: thêm trường **đơn giá công sửa / cái**. Thêm đơn vị **lít** cho vật tư như sơn (đơn vị đo, tối đa 3 chữ số lẻ).
- **D15 (Báo cáo quản trị)**:
  - Vật tư xuất cho sửa không bị trừ hai lần. Đẳng thức đối chiếu chỉ cộng phần chi phí sửa **không đi qua sổ kho** (công khoán, chi phí gõ tay của phiếu cũ).
  - Tháng ghi sổ của lệnh lấy theo lần ghi sổ lệnh, không theo ngày xưởng nhận hàng.
  - Hàng cho thuê bình quân và tỷ lệ khai thác chỉ tính mã nhóm Thiết bị, không tính vật tư.
- **M1 (Việc hôm nay)**: khối "Sửa chữa" cho Xưởng (lệnh cần nhận, lệnh đang sửa) và cho Thủ kho (lệnh chờ nghiệm thu).
- **Quyền mới**: `repairs.work` (Xưởng, Giám đốc: nhận lệnh, ghi số, báo sửa xong) và `repairs.count` (Thủ kho, Giám đốc: đếm nghiệm thu). `repairs.manage` giữ nguyên (lập, giao, trả lại, hủy, ghi sổ).
- **Phiếu sửa đơn giản**:
  - Không lập phiếu mới nữa: nút "Phiếu mới" mở lệnh sửa.
  - Phiếu Nháp cũ vẫn sửa, xóa, ghi sổ được như trước.
  - Phiếu đã ghi sổ giữ nguyên. **BREAKING** cho cách làm của Kế toán: bỏ ô "Chi phí sửa" gõ tay cho phiếu mới.
- **Nhật ký thao tác** ghi mọi bước của lệnh.

## Capabilities

### New Capabilities

- `repair-work-orders`: lệnh sửa chữa, luồng trạng thái và ai làm bước nào, công khoán, vật tư phụ, ghi sổ lệnh, hủy, D12 lệnh đầy đủ và danh sách.
- `repair-mobile`: M8 và API `/api/m/repairs` cho Xưởng và Thủ kho: nhận lệnh, ghi số, báo sửa xong, đếm nghiệm thu, nháp trên máy, không có giá.

### Modified Capabilities

- `repair-orders`: phiếu sửa đơn giản không lập mới; danh sách `/repairs` có cả lệnh sửa; nháp cũ vẫn xử lý được.
- `item-catalog`: đơn giá công sửa / cái; đơn vị lít.
- `inventory-ledger`: xuất vật tư cho sửa (`REPAIR_OUT` trên mã vật tư); chuyển bãi → xưởng của lệnh sửa.
- `gross-profit`: sửa chữa không trừ hai lần khi có vật tư; đẳng thức đối chiếu; tháng ghi sổ của lệnh.
- `fleet-metrics`: hàng cho thuê chỉ gồm mã nhóm Thiết bị.
- `auth`: bảng quyền thêm `repairs.work`, `repairs.count`.
- `mobile-home`: khối "Sửa chữa" trên M1.
- `activity-log`: các thao tác của lệnh sửa.

## Impact

- **DB** (migration mới trong `drizzle/`):
  - `repair_order` thêm loại phiếu (`SIMPLE` / `WORK_ORDER`), trạng thái mới, xưởng, các mốc giao / nhận / báo xong / đếm / hủy, mã ghi sổ của lần nhận.
  - `repair_order_line` thêm đơn giá công đã chụp, số xưởng báo, công và vật tư lúc ghi sổ.
  - Bảng mới `repair_order_material`.
  - `item.repair_labor_rate`, đơn vị `LITER`.
  - Không đổi ràng buộc loại biến động của sổ kho.
- **Code**:
  - `src/domain/repair-order.ts` (thêm `transition()`, công, vật tư) và `src/domain/quantity.ts` (lít).
  - `src/lib/repairs/`, `src/lib/reports/costs.ts`, `src/lib/reports/fleet.ts`, `src/domain/gross-profit.ts`, `src/domain/permissions.ts`.
  - Trang `/repairs`, `/m/repairs`, API `/api/repairs/**`, `/api/m/repairs/**`, M1.
- **Số liệu đã có**:
  - Dòng sổ cũ không đổi. Phiếu sửa đã ghi sổ đọc như cũ.
  - D15 các tháng cũ không đổi, vì phiếu cũ không có vật tư (đẳng thức cho ra cùng số).
  - Hàng cho thuê bình quân trên D15 có thể **giảm nhẹ** nếu DB đã có mã nhóm Vật tư tồn Mới / Tốt. Hiện seed chưa có mã vật tư nào.
- **Seed và E2E**:
  - `db:seed:dev` thêm 3 mã vật tư (`VT-QH`, `VT-SON`, `VT-BL12`) có tồn ở `XUONG-01`, và một lệnh mẫu Đã đếm như D12.
  - Ảnh mốc D9, D10 đổi vì thêm mã. Cần gắn nhãn `update-snapshots`.

## Ngoài phạm vi

- Sửa hàng tính theo mét (0.2 #47 vẫn từ chối).
- Trả công cho thợ, bảng lương, công nợ với tổ sửa: lệnh chỉ ghi công vào giá vốn.
- Nhập vật tư bằng chứng từ riêng: vật tư nhập kho bằng đơn mua và phiếu nhập như hàng khác.
- In lệnh sửa.
- Xuất vật tư cho việc khác ngoài sửa chữa.
- Giao một lệnh cho nhiều xưởng, hoặc rút hàng từng phần.
