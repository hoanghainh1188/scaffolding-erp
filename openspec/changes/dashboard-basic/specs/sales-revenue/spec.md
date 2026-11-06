## Purpose

Cách tính doanh số theo phát sinh (theo ngày và theo tháng) từ sổ kho, bảng kê tiền thuê và phiếu xuất bán, dùng cho Tổng quan D1 và báo cáo sau này; không lưu số cộng dồn.

## ADDED Requirements

### Requirement: Doanh số thuê theo ngày từ bảng kê tiền thuê
Doanh số thuê của một hợp đồng trong một tháng SHALL lấy từ bảng kê của kỳ đó: kỳ đã chốt đọc bảng chụp, kỳ chưa chốt tính lại như D7 đến hôm nay (tạm tính). Tiền một dòng thuê SHALL chia đều cho các ngày tính của dòng (bỏ ngày nghỉ), phần lẻ chia theo phần dư lớn nhất; dòng bù tối thiểu tính vào ngày trả; dòng điều chỉnh tính vào ngày cuối kỳ (kỳ đang chạy: hôm nay).

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

#### Scenario: Điều chỉnh vào ngày cuối kỳ
- **WHEN** kỳ 10/2026 đã chốt có dòng điều chỉnh −200.000 ₫
- **THEN** doanh số thuê ngày 31/10/2026 giảm 200.000 ₫; các ngày khác không đổi

#### Scenario: Hợp đồng không còn hàng
- **WHEN** hợp đồng đã trả hết hàng ngày 31/10/2026 và không có cước, điều chỉnh tháng 11
- **THEN** doanh số thuê tháng 11/2026 của hợp đồng là 0 ₫

### Requirement: Cước của hợp đồng thuê tính vào ngày giao
Cước vận chuyển nằm trên bảng kê kỳ tiền thuê SHALL tính vào doanh số thuê của ngày giao trên phiếu xuất.

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
Doanh số một tháng SHALL bằng tổng doanh số thuê và bán các ngày của tháng, tách hai phần Thuê và Bán, chưa VAT. Tháng có ít nhất một hợp đồng thuê chưa chốt kỳ SHALL được đánh dấu tạm tính; tháng đang chạy tính đến hôm nay.

#### Scenario: Tháng đã chốt hết khớp tổng các kỳ
- **WHEN** mọi kỳ 10/2026 đã chốt, tổng (tiền thuê + điều chỉnh + cước) các kỳ là 352.000.000 ₫, bán giao trong tháng 51.300.000 ₫
- **THEN** doanh số tháng 10/2026 là 403.300.000 ₫ (thuê 352.000.000 ₫, bán 51.300.000 ₫), không đánh dấu tạm tính

#### Scenario: Tháng có kỳ chưa chốt
- **WHEN** kỳ 10/2026 của một hợp đồng chưa chốt
- **THEN** cột tháng 10/2026 có dấu tạm tính và phần thuê của hợp đồng đó tính lại từ sổ kho
