# fleet-metrics Specification

## Purpose
Chỉ số hàng cho thuê theo kỳ, tính từ sổ kho: hàng cho thuê bình quân theo ngày, hao hụt (tấn mất, thành phế, phải sửa khi thu hồi trên 100 tấn) và tỷ lệ khai thác (hàng ở công trình trên tổng hàng Mới, Tốt).

## Requirements

### Requirement: Hàng cho thuê bình quân theo ngày
Hàng cho thuê của một ngày SHALL là tồn **cuối ngày** (ngày Việt Nam, theo ngày ghi sổ) của tình trạng Mới và Tốt ở mọi vị trí: bãi, xưởng, công trình. Bình quân của kỳ SHALL bằng tổng tồn cuối ngày các ngày của kỳ (đến hôm nay) chia số ngày đó. Số SHALL tính lại từ sổ kho mỗi lần xem, không lưu.

#### Scenario: Hàng nhập giữa kỳ
- **WHEN** tháng 09/2026 `PK-KU` (5 kg/cái) có 8.000 cái Mới, Tốt cuối mỗi ngày 01/09 – 15/09 và 12.000 cái cuối mỗi ngày 16/09 – 30/09
- **THEN** bình quân tháng 09/2026 của `PK-KU` là 10.000 cái = 50,0 tấn

#### Scenario: Chờ sửa, Phế liệu không tính
- **WHEN** suốt tháng 09/2026 `GG-K17` có 1.000 cái Tốt, 200 Chờ sửa, 46 Phế liệu
- **THEN** bình quân hàng cho thuê của `GG-K17` là 1.000 cái

### Requirement: Cách đổi ra tấn
Tấn SHALL cộng mọi mã: mã đơn vị kg lấy kg, mã khác lấy số lượng × trọng lượng chuẩn, như D1. Mã chưa có trọng lượng chuẩn SHALL được tính 0 tấn, và báo cáo SHALL ghi số mã như vậy.

#### Scenario: Mã chưa có trọng lượng chuẩn
- **WHEN** `ONG-LE` có 300 cây Tốt nhưng chưa có trọng lượng chuẩn
- **THEN** `ONG-LE` góp 0 tấn **AND** báo cáo ghi "1 mã chưa có trọng lượng chuẩn, chưa tính vào tấn"

### Requirement: Hao hụt trên 100 tấn
Hao hụt của kỳ SHALL bằng (tấn hàng mất + tấn trả về Phế liệu + tấn trả về Chờ sửa) của phiếu thu hồi ghi sổ trong kỳ, chia tấn hàng cho thuê bình quân của kỳ, nhân 100. Hiện 2 chữ số lẻ. Tính cho cả kho và theo từng mã. Bình quân bằng 0 thì hiện "—". Phế liệu sinh ra từ phiếu sửa SHALL không tính thêm.

#### Scenario: Một tháng của một mã
- **WHEN** tháng 09/2026 phiếu thu hồi của `PK-KU` ghi mất 10 cái, Phế liệu 4, Chờ sửa 16 (5 kg/cái), bình quân 50,0 tấn
- **THEN** `PK-KU` mất 0,05 tấn, phế 0,02 tấn, phải sửa 0,08 tấn **AND** hao hụt 0,30 tấn trên 100 tấn

#### Scenario: Phế liệu từ phiếu sửa
- **WHEN** tháng 10/2026 phiếu sửa đưa 5 `GG-M16` Chờ sửa thành Phế liệu
- **THEN** tấn thành phế của tháng 10/2026 không đổi

#### Scenario: Năm lũy kế
- **WHEN** chọn tháng 10/2026, từ 01/01 đến 31/10/2026 hàng mất, phế, phải sửa cộng 40,2 tấn và bình quân hàng cho thuê 412,7 tấn
- **THEN** báo cáo ghi "Năm 2026: 9,74 tấn / 100 tấn"

### Requirement: Tỷ lệ khai thác
Tỷ lệ khai thác SHALL bằng tổng hàng Mới, Tốt ở vị trí công trình cuối mỗi ngày ÷ tổng hàng Mới, Tốt cuối mỗi ngày, cộng các ngày của kỳ, × 100, làm tròn 1 chữ số. Tổng cả kho SHALL tính theo tấn. Bảng theo mã SHALL chỉ gồm mã đơn vị cái, tính theo cái, xếp từ cao xuống thấp.

#### Scenario: Hàng ra công trình giữa kỳ
- **WHEN** tháng 09/2026 `PK-KU` có 10.000 cái Mới, Tốt mỗi ngày; ở công trình 6.000 cái cuối mỗi ngày 01/09 – 10/09 và 8.000 cái 11/09 – 30/09
- **THEN** khai thác của `PK-KU` tháng 09/2026 là (10 × 6.000 + 20 × 8.000) ÷ (30 × 10.000) = 73,3 %

#### Scenario: Tổng theo tấn gộp mã cái và mã mét
- **WHEN** tháng 09/2026 ngoài `PK-KU` trên còn `ONG-TH` (3 kg/mét) 2.000 mét mỗi ngày, ở công trình 1.000 mét mỗi ngày
- **THEN** khai thác cả kho = (36,67 + 3,0) ÷ (50,0 + 6,0) = 70,8 % **AND** bảng theo mã có `PK-KU` 73,3 %, không có dòng `ONG-TH`

#### Scenario: Không có hàng
- **WHEN** tháng 01/2025 tồn Mới, Tốt mọi ngày bằng 0
- **THEN** khai thác hiện "—"

### Requirement: Ranh giới ngày theo giờ Việt Nam
Biến động SHALL thuộc ngày ghi sổ theo giờ Việt Nam, không theo giờ UTC.

#### Scenario: Thu hồi gần nửa đêm
- **WHEN** phiếu thu hồi có hàng mất ghi sổ lúc 23:30 ngày 30/09/2026 giờ Việt Nam (16:30 UTC)
- **THEN** hàng mất tính vào tháng 09/2026 và tồn cuối ngày 30/09/2026 đã trừ hàng mất

#### Scenario: Sau nửa đêm
- **WHEN** phiếu xuất thuê ghi sổ lúc 00:30 ngày 01/10/2026 giờ Việt Nam (17:30 UTC ngày 30/09)
- **THEN** hàng đó ở công trình từ cuối ngày 01/10/2026, không làm đổi khai thác tháng 09/2026

### Requirement: Dòng điều chỉnh giá trị không đổi số lượng
Dòng sổ `REVALUE` (số lượng 0, không có vị trí, 0.2 #35) SHALL không làm đổi tồn của bất kỳ vị trí nào, hàng cho thuê bình quân, hao hụt hay tỷ lệ khai thác.

#### Scenario: Có phiếu ĐCG trong kỳ
- **WHEN** tháng 10/2026 có dòng `REVALUE` của `PK-KU` Tốt +1.200.000 ₫
- **THEN** bình quân, hao hụt và khai thác tháng 10/2026 của `PK-KU` giống hệt khi không có dòng đó
