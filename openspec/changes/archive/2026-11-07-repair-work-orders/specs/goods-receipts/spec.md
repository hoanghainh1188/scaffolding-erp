## ADDED Requirements

### Requirement: Phiếu nhập vật tư vào xưởng
Phiếu nhập SHALL chọn được vị trí nhập là **xưởng** đang dùng khi **mọi dòng** của đơn là mã nhóm Vật tư; đơn có ít nhất một mã nhóm Thiết bị SHALL chỉ nhập vào bãi. Server SHALL kiểm luật này lúc xác nhận nhập kho, không chỉ ẩn ô trên M3. Dòng `PURCHASE_IN` SHALL ghi tại xưởng đã chọn. M3 SHALL hiện các xưởng đang dùng trong danh sách vị trí nhập chỉ khi đơn toàn vật tư.

#### Scenario: Đơn toàn vật tư nhập vào xưởng
- **WHEN** đơn `PO-2026-060` chỉ có `VT-QH` 20 kg và `VT-SON` 10 lít, và Thủ kho chọn nhập vào `XUONG-01`
- **THEN** phiếu nhập ghi sổ được **AND** sổ có `PURCHASE_IN` +20 kg `VT-QH` và +10 lít `VT-SON` tại `XUONG-01`

#### Scenario: Đơn có mã thiết bị nhập vào xưởng
- **WHEN** đơn `PO-2026-061` có `VT-QH` và `GG-K17`, và yêu cầu xác nhận gửi vị trí `XUONG-01`
- **THEN** server từ chối với "Chỉ đơn toàn vật tư phụ mới nhập vào xưởng, chọn một bãi" **AND** không ghi gì

#### Scenario: Danh sách vị trí trên M3
- **WHEN** Thủ kho mở M3 của `PO-2026-060` (toàn vật tư) rồi của `PO-2026-052` (có giàn giáo)
- **THEN** M3 của `PO-2026-060` có `BAI-01` và `XUONG-01` trong ô vị trí nhập **AND** M3 của `PO-2026-052` chỉ có bãi
