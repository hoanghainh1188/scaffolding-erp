# sales-revenue Specification

## Purpose
Cách tính doanh số theo phát sinh (theo ngày và theo tháng) từ sổ kho, bảng kê tiền thuê và phiếu xuất bán, dùng cho Tổng quan D1 và báo cáo sau này; không lưu số cộng dồn.

## Requirements

### Requirement: Doanh số thuê theo ngày từ bảng kê tiền thuê
Doanh số thuê của một hợp đồng trong một tháng SHALL lấy từ bảng kê của kỳ đó: kỳ đã chốt đọc bảng chụp; kỳ chưa chốt tính lại như D7 (tạm tính): tháng đang chạy đến hôm nay, tháng đã qua đến hết tháng. Tiền một dòng thuê SHALL chia đều cho các ngày tính của dòng (bỏ ngày nghỉ), phần lẻ chia theo phần dư lớn nhất; dòng bù tối thiểu tính vào ngày trả.

#### Scenario: Chia dòng thuê theo ngày
- **WHEN** hợp đồng `082026/ANPHAT-MINHPHAT` có dòng thuê 40 `PK-KU` × 1.000 ₫/ngày từ 01/11/2026 đến 06/11/2026, không ngày nghỉ, hôm nay 06/11/2026
- **THEN** doanh số thuê mỗi ngày 01/11 … 06/11 là 40.000 ₫ và tổng 6 ngày là 240.000 ₫

#### Scenario: Bỏ ngày nghỉ
- **WHEN** dòng thuê 10 cái × 2.000 ₫/ngày từ 04/02/2027 đến 15/02/2027, ngày nghỉ 05/02 – 13/02/2027
- **THEN** chỉ các ngày 04/02, 14/02, 15/02 có doanh số, mỗi ngày 20.000 ₫; các ngày nghỉ 0 ₫

#### Scenario: Phần lẻ chia theo phần dư lớn nhất
- **WHEN** một dòng thuê tiền 100.000 ₫ có 3 ngày tính
- **THEN** ba ngày nhận 33.334 ₫, 33.333 ₫, 33.333 ₫ (ngày sớm nhất nhận phần dư) và tổng đúng 100.000 ₫

#### Scenario: Dòng bù tối thiểu vào ngày trả
- **WHEN** 20 cái giao 01/10/2026, trả hết 21/10/2026 (20 ngày), giá 1.000 ₫/ngày, tối thiểu 45 ngày, không ngày nghỉ
- **THEN** ngày 21/10/2026 có thêm dòng bù 25 ngày × 20 × 1.000 ₫ = 500.000 ₫ tính vào doanh số ngày đó

#### Scenario: Trả giữa tháng
- **WHEN** 50 cái giá 1.500 ₫/ngày giao trước tháng 11, trả 30 cái ngày 10/11/2026, hôm nay 20/11/2026
- **THEN** mỗi ngày 01/11 … 10/11 có 75.000 ₫, mỗi ngày 11/11 … 20/11 có 30.000 ₫

#### Scenario: Đổi giá giữa tháng
- **WHEN** phụ lục `/01` hiệu lực 16/11/2026 đổi giá `PK-KU` từ 1.000 ₫ lên 1.200 ₫/ngày, 10 cái ở công trình cả tháng
- **THEN** mỗi ngày 01/11 … 15/11 có 10.000 ₫, mỗi ngày 16/11 … 30/11 có 12.000 ₫

#### Scenario: Tháng đã qua chưa chốt
- **WHEN** hôm nay 06/11/2026, kỳ 09/2026 của hợp đồng chưa chốt, 10 cái × 1.000 ₫/ngày ở công trình cả tháng 9, không ngày nghỉ
- **THEN** doanh số thuê mỗi ngày 01/09 … 30/09/2026 là 10.000 ₫, tổng tháng 9 là 300.000 ₫ (tính đến hết 30/09, không đến hôm nay) và tháng 9 được đánh dấu tạm tính

#### Scenario: Hợp đồng không còn hàng
- **WHEN** hợp đồng đã trả hết hàng ngày 31/10/2026 và không có cước, điều chỉnh tháng 11
- **THEN** doanh số thuê tháng 11/2026 của hợp đồng là 0 ₫

### Requirement: Dòng điều chỉnh tính vào ngày lập dòng
Dòng điều chỉnh kỳ trước (0.2 #80) SHALL tính vào doanh số thuê của **ngày lập dòng** (giờ Việt Nam), kẹp vào trong kỳ: lập trước ngày đầu kỳ thì vào ngày đầu kỳ, lập sau ngày cuối kỳ thì vào ngày cuối kỳ. Ngày này SHALL giống nhau khi kỳ còn mở và sau khi chốt. Dòng điều chỉnh âm SHALL làm doanh số ngày đó giảm, kể cả xuống dưới 0.

#### Scenario: Kỳ mở và kỳ đã chốt cùng một ngày
- **WHEN** Kế toán lập dòng điều chỉnh −200.000 ₫ vào kỳ 11/2026 lúc 09:00 ngày 04/11/2026 (giờ Việt Nam), sau đó kỳ 11/2026 được chốt ngày 02/12/2026
- **THEN** khi kỳ còn mở (xem ngày 06/11 và ngày 20/11) và sau khi chốt, doanh số thuê ngày 04/11/2026 đều giảm 200.000 ₫; các ngày khác không đổi
- **AND** ô "Hôm nay · thuê" ngày 06/11/2026 không gồm dòng điều chỉnh đó

#### Scenario: Lập sau cuối kỳ khi kỳ đã qua chưa chốt
- **WHEN** ngày 03/11/2026 Kế toán lập dòng điều chỉnh +150.000 ₫ vào kỳ 10/2026 (chưa chốt)
- **THEN** doanh số thuê ngày 31/10/2026 tăng 150.000 ₫

#### Scenario: Doanh số một ngày âm
- **WHEN** ngày 04/11/2026 tiền thuê của mọi hợp đồng là 300.000 ₫, bán 0 ₫, và có dòng điều chỉnh −500.000 ₫ lập ngày đó
- **THEN** doanh số thuê ngày 04/11/2026 là −200.000 ₫ và biểu đồ theo ngày vẽ cột ngày đó dưới trục 0

### Requirement: Chia bảng chụp khớp số ngày đã chụp
Khi chia một dòng thuê của kỳ đã chốt theo ngày, số ngày đếm lại (Từ → Đến, bỏ ngày nghỉ hiện tại) SHALL bằng số ngày tính đã chụp. Nếu lệch, hệ thống SHALL chia theo số ngày tính đã chụp (các ngày lịch đầu tiên của khoảng), giữ đúng tiền dòng đã chụp, và ghi cảnh báo vào log máy chủ; không tính ra tổng khác.

#### Scenario: Khớp số ngày đã chụp
- **WHEN** dòng đã chụp 10 cái × 1.000 ₫, Từ 01/10/2026 Đến 31/10/2026, 0 ngày nghỉ, 31 ngày tính, tiền 310.000 ₫
- **THEN** mỗi ngày 01/10 … 31/10/2026 có 10.000 ₫

#### Scenario: Lệch số ngày đã chụp
- **WHEN** dòng đã chụp Từ 01/10/2026 Đến 10/10/2026 có 10 ngày tính, tiền 100.000 ₫, nhưng bảng ngày nghỉ hiện có ngày 05/10/2026
- **THEN** mỗi ngày 01/10 … 10/10/2026 vẫn có 10.000 ₫ (tổng 100.000 ₫) và log máy chủ có cảnh báo ghi kỳ, hợp đồng, dòng, 9 ngày đếm lại, 10 ngày đã chụp

### Requirement: Cước của hợp đồng thuê tính vào ngày giao
Cước vận chuyển nằm trên bảng kê kỳ tiền thuê SHALL tính vào doanh số **thuê** (không phải bán) của ngày giao trên phiếu xuất (0.2 #96).

#### Scenario: Cước một chuyến thuê
- **WHEN** phiếu xuất thuê Đợt 1 giao 03/11/2026 có cước 1.500.000 ₫
- **THEN** doanh số thuê ngày 03/11/2026 cộng thêm 1.500.000 ₫

### Requirement: Tổng doanh số thuê một tháng khớp bảng kê kỳ
Tổng doanh số thuê các ngày của một hợp đồng trong một tháng SHALL bằng số chưa VAT của bảng kê kỳ đó (tiền thuê + điều chỉnh + cước); tháng đã chốt SHALL bằng số đã chụp, kể cả khi tính lại từ sổ kho ra số khác.

#### Scenario: Tháng đã chốt
- **WHEN** kỳ 10/2026 của một hợp đồng đã chốt với tiền thuê 3.100.000 ₫, điều chỉnh 0 ₫, cước 1.000.000 ₫, VAT 328.000 ₫
- **THEN** doanh số thuê tháng 10/2026 của hợp đồng là 4.100.000 ₫ (không gồm VAT)

#### Scenario: Tháng đang chạy
- **WHEN** hôm nay 06/11/2026 và D7 tạm tính kỳ 11/2026 của hợp đồng: chưa VAT 4.560.000 ₫
- **THEN** tổng doanh số thuê 01/11 … 06/11 của hợp đồng là 4.560.000 ₫ và được đánh dấu tạm tính

### Requirement: Doanh số bán theo ngày giao
Doanh số bán SHALL là tiền hàng + cước của phiếu xuất bán đã ghi sổ, tính vào ngày giao, chưa VAT. Phiếu xuất Chờ nhặt, Đang nhặt, Đã hủy SHALL không tính.

#### Scenario: Bán theo kg
- **WHEN** phiếu xuất bán giao 05/11/2026 cân 1.250 kg phế liệu giá 7.500 ₫/kg, cước 500.000 ₫, hợp đồng VAT 8 %
- **THEN** doanh số bán ngày 05/11/2026 là 9.875.000 ₫

#### Scenario: Phiếu chưa xuất không tính
- **WHEN** hợp đồng bán có phiếu xuất Đang nhặt 100 cái
- **THEN** doanh số bán không đổi

### Requirement: Đền bù và mua lại tách khỏi doanh số
Phiếu đền bù và phiếu mua lại đã duyệt SHALL tính riêng theo ngày duyệt (số phải trả), không cộng vào doanh số thuê hay bán. Phiếu chưa duyệt hoặc bị từ chối SHALL không tính.

#### Scenario: Đền bù không vào doanh số
- **WHEN** phiếu đền bù 4.600.000 ₫ được duyệt ngày 04/11/2026
- **THEN** khoản "Đền bù, mua lại" tháng 11/2026 tăng 4.600.000 ₫ và doanh số tháng 11/2026 không đổi

### Requirement: Doanh số theo tháng
Doanh số một tháng SHALL bằng tổng doanh số thuê và bán các ngày của tháng, tách hai phần Thuê và Bán, chưa VAT, giữ dấu âm nếu có. Tháng có ít nhất một hợp đồng thuê chưa chốt kỳ SHALL được đánh dấu tạm tính; tháng đang chạy tính đến hôm nay, tháng đã qua tính đến hết tháng.

#### Scenario: Tháng đã chốt hết khớp tổng các kỳ
- **WHEN** mọi kỳ 10/2026 đã chốt, tổng (tiền thuê + điều chỉnh + cước) các kỳ là 352.000.000 ₫, bán giao trong tháng 51.300.000 ₫
- **THEN** doanh số tháng 10/2026 là 403.300.000 ₫ (thuê 352.000.000 ₫, bán 51.300.000 ₫), không đánh dấu tạm tính

#### Scenario: Tháng có kỳ chưa chốt
- **WHEN** kỳ 10/2026 của một hợp đồng chưa chốt
- **THEN** cột tháng 10/2026 có dấu tạm tính và phần thuê của hợp đồng đó tính lại từ sổ kho
