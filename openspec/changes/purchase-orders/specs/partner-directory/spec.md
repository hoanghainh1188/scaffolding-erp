# Spec Delta

## MODIFIED Requirements

### Requirement: Ngừng dùng và xóa đối tác
Nhà thầu và nhà cung cấp SHALL ngừng dùng và dùng lại được. Đối tác đang được tham chiếu (nhà thầu có công trình, nhà cung cấp có đơn thu mua kể cả đơn nháp hay đơn đã hủy, và sau này hợp đồng) SHALL không xóa được. Nhà thầu còn công trình đang dùng SHALL không ngừng dùng được. Nhà cung cấp còn đơn thu mua đang xử lý (`IN_PROGRESS`) SHALL không ngừng dùng được; đơn nháp không chặn ngừng dùng nhưng sẽ không đặt được cho tới khi nhà cung cấp được dùng lại. Đối tác ngừng dùng SHALL không chọn được cho chứng từ hay công trình mới.

#### Scenario: Xóa nhà thầu đã có công trình
- **WHEN** xóa `NT-0001` đang có công trình (kể cả công trình đã ngừng dùng)
- **THEN** hệ thống từ chối với "Nhà thầu đã được dùng nên chỉ ngừng dùng được"

#### Scenario: Ngừng dùng nhà thầu còn công trình đang dùng
- **WHEN** ngừng dùng `NT-0001` khi công trình `CT-0001` của họ đang dùng
- **THEN** hệ thống từ chối với "Ngừng dùng các công trình của nhà thầu này trước"

#### Scenario: Xóa nhà cung cấp tạo nhầm
- **WHEN** xóa `NCC-0005` chưa được dùng ở đâu
- **THEN** nhà cung cấp bị xóa hẳn

#### Scenario: Xóa nhà cung cấp đã có đơn thu mua
- **WHEN** xóa `NCC-0002` đã có đơn `PO-2026-049` (đã xong)
- **THEN** hệ thống từ chối với "Nhà cung cấp đã được dùng nên chỉ ngừng dùng được"

#### Scenario: Ngừng dùng nhà cung cấp còn đơn đang xử lý
- **WHEN** ngừng dùng `NCC-0001` khi đơn `PO-2026-055` của họ đang chờ xe về
- **THEN** hệ thống từ chối với "NCC-0001 còn đơn thu mua đang xử lý: PO-2026-055. Đóng hoặc hủy đơn trước"

#### Scenario: Ngừng dùng nhà cung cấp chỉ có đơn đã xong
- **WHEN** ngừng dùng `NCC-0002` khi mọi đơn của họ đã xong hoặc còn nháp
- **THEN** ngừng dùng thành công
