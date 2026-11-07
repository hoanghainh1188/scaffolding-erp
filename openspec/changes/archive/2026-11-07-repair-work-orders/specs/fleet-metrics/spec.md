## MODIFIED Requirements

### Requirement: Hàng cho thuê bình quân theo ngày
Hàng cho thuê của một ngày SHALL là tồn **cuối ngày** (ngày Việt Nam, theo ngày ghi sổ) của tình trạng Mới và Tốt ở mọi vị trí: bãi, xưởng, công trình, chỉ của mã nhóm **Thiết bị**; mã nhóm Vật tư (que hàn, sơn, bu lông…) SHALL không tính, ở cả bình quân, hao hụt và tỷ lệ khai thác. Bình quân của kỳ SHALL bằng tổng tồn cuối ngày các ngày của kỳ (đến hôm nay) chia số ngày đó. Số SHALL tính lại từ sổ kho mỗi lần xem, không lưu.

#### Scenario: Hàng nhập giữa kỳ
- **WHEN** tháng 09/2026 `PK-KU` (5 kg/cái) có 8.000 cái Mới, Tốt cuối mỗi ngày 01/09 – 15/09 và 12.000 cái cuối mỗi ngày 16/09 – 30/09
- **THEN** bình quân tháng 09/2026 của `PK-KU` là 10.000 cái = 50,0 tấn

#### Scenario: Chờ sửa, Phế liệu không tính
- **WHEN** suốt tháng 09/2026 `GG-K17` có 1.000 cái Tốt, 200 Chờ sửa, 46 Phế liệu
- **THEN** bình quân hàng cho thuê của `GG-K17` là 1.000 cái

#### Scenario: Vật tư ở xưởng không tính
- **WHEN** suốt tháng 11/2026 `XUONG-01` có 18 kg `VT-QH` Mới (nhóm Vật tư)
- **THEN** `VT-QH` không có dòng trong bảng hao hụt, tỷ lệ khai thác **AND** tấn hàng cho thuê bình quân không gồm 18 kg đó
