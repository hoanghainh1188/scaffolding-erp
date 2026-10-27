# Spec Delta

## MODIFIED Requirements

### Requirement: Ngừng dùng và xóa vật tư, bộ
Vật tư, bộ và nhóm SHALL ngừng dùng và dùng lại được. Bản ghi đã được tham chiếu (vật tư trong bộ, nhóm có vật tư, vật tư có dòng sổ kho hoặc nằm trong đơn thu mua, và sau này chứng từ khác) SHALL chỉ ngừng dùng, không xóa. Vật tư SHALL không ngừng dùng được khi nằm trong bộ đang dùng, khi **còn tồn** (khác 0 ở bất kỳ tình trạng, vị trí nào, kể cả công trình), hoặc khi nằm trong đơn thu mua đang xử lý (`IN_PROGRESS`). Bản ghi ngừng dùng SHALL không chọn được cho bộ hay chứng từ mới.

#### Scenario: Xóa vật tư chưa dùng
- **WHEN** Kinh doanh xóa vật tư `TEST-01` vừa tạo nhầm, chưa ở bộ nào
- **THEN** vật tư bị xóa hẳn

#### Scenario: Xóa vật tư đang ở trong bộ
- **WHEN** người dùng xóa `GG-CH` đang nằm trong bộ `BO-17`
- **THEN** hệ thống từ chối với "Vật tư đã được dùng nên chỉ ngừng dùng được" và `GG-CH` vẫn còn

#### Scenario: Ngừng dùng vật tư đang trong bộ đang dùng
- **WHEN** người dùng ngừng dùng `GG-CH` trong khi bộ `BO-17` đang dùng
- **THEN** hệ thống từ chối với "Bỏ vật tư này khỏi bộ BO-17 hoặc ngừng dùng bộ trước"

#### Scenario: Ngừng dùng vật tư còn tồn
- **WHEN** người dùng ngừng dùng `OT-06` khi còn 12 cái Tốt tại bãi và 30 cái tại công trình `CT-0003`
- **THEN** hệ thống từ chối với "OT-06 còn tồn 42 cái, chỉ ngừng dùng được khi tồn về 0" **AND** `OT-06` vẫn đang dùng

#### Scenario: Ngừng dùng vật tư đã hết tồn
- **WHEN** `OT-06` đã có dòng sổ kho nhưng tổng tồn ở mọi tình trạng và vị trí là 0
- **THEN** ngừng dùng thành công **AND** thẻ kho của `OT-06` vẫn xem được

#### Scenario: Vật tư ngừng dùng không vào bộ mới
- **WHEN** `KK-01` đã ngừng dùng và người dùng tạo bộ có dòng `KK-01`
- **THEN** hệ thống từ chối với "Vật tư KK-01 đã ngừng dùng"

#### Scenario: Dùng lại
- **WHEN** người dùng chọn "Dùng lại" cho `KK-01`
- **THEN** `KK-01` trở lại trạng thái đang dùng và chọn được ở bộ mới

#### Scenario: Ngừng dùng vật tư trong đơn thu mua đang xử lý
- **WHEN** ngừng dùng `GG-M16` khi đơn `PO-2026-051` còn đang nhận và có dòng `GG-M16`
- **THEN** hệ thống từ chối với "GG-M16 còn trong đơn thu mua đang xử lý: PO-2026-051" **AND** `GG-M16` vẫn đang dùng

#### Scenario: Xóa vật tư đã có trong đơn thu mua
- **WHEN** xóa `TEST-02` chỉ nằm trong một đơn nháp
- **THEN** hệ thống từ chối với "Vật tư đã được dùng nên chỉ ngừng dùng được"
