# Spec Delta

## MODIFIED Requirements

### Requirement: Ngừng dùng và xóa công trình, vị trí
Công trình và bãi/xưởng SHALL ngừng dùng và dùng lại được. Công trình hoặc vị trí đã được tham chiếu (sổ kho, sau này là hợp đồng) SHALL không xóa được, chỉ ngừng dùng. Công trình, bãi hoặc xưởng **còn hàng** (tổng tồn tại vị trí đó khác 0 ở bất kỳ mã hàng, tình trạng nào) SHALL không ngừng dùng được. Hàng ở công trình là tồn tại vị trí `SITE` đi kèm công trình đó. Dùng lại công trình của nhà thầu đã ngừng dùng SHALL bị từ chối.

#### Scenario: Xóa công trình tạo nhầm
- **WHEN** xóa `CT-0009` chưa có hợp đồng hay giao dịch kho
- **THEN** công trình và vị trí đi kèm bị xóa hẳn

#### Scenario: Xóa công trình đã có giao dịch kho
- **WHEN** xóa `CT-0003` đã có dòng sổ kho (kể cả khi tồn đã về 0)
- **THEN** hệ thống từ chối với "Công trình đã được dùng nên chỉ ngừng dùng được"

#### Scenario: Ngừng dùng công trình còn hàng
- **WHEN** ngừng dùng `CT-0003` khi tại đó còn 1.540 cái `GG-K17` và 300 cái `GG-CH`
- **THEN** hệ thống từ chối với "Công trình CT-0003 còn 1.840 cái hàng, thu hồi hết trước khi ngừng dùng" **AND** công trình vẫn đang dùng

#### Scenario: Ngừng dùng xưởng còn hàng
- **WHEN** Giám đốc ngừng dùng `XUONG-01` khi tại đó còn 60 cái `GG-K17` Chờ sửa
- **THEN** hệ thống từ chối với "XUONG-01 còn 60 cái hàng, chuyển hết đi trước khi ngừng dùng"

#### Scenario: Ngừng dùng công trình đã thu hồi hết
- **WHEN** mọi hàng tại `CT-0003` đã thu hồi về bãi (tồn tại `CT-0003` bằng 0)
- **THEN** ngừng dùng `CT-0003` thành công **AND** vị trí đi kèm cũng ngừng dùng

#### Scenario: Dùng lại công trình của nhà thầu ngừng dùng
- **WHEN** dùng lại công trình `CT-0004` trong khi nhà thầu của nó đã ngừng dùng
- **THEN** hệ thống từ chối với "Dùng lại nhà thầu của công trình này trước"
