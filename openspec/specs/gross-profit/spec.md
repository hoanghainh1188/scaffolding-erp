# gross-profit Specification

## Purpose
Lợi nhuận gộp theo kỳ (tháng, quý, năm, kỳ trước, lũy kế năm): doanh thu chưa VAT trừ giá vốn và hao hụt thực tế đọc từ sổ kho, không khấu hao, mỗi đồng chỉ trừ một lần.

## Requirements

### Requirement: Kỳ báo cáo
Kỳ báo cáo SHALL là một tháng, một quý (3 tháng dương lịch) hoặc một năm, theo ngày Việt Nam. Kỳ chưa hết SHALL tính đến hết hôm nay. Kỳ bắt đầu sau hôm nay SHALL không chọn được. "Kỳ trước" SHALL là kỳ liền trước cùng loại (đủ ngày). "Lũy kế năm" SHALL là từ 01/01 của năm chứa kỳ đến ngày cuối của kỳ (hoặc hôm nay nếu sớm hơn).

#### Scenario: Tháng đang chạy
- **WHEN** hôm nay 06/11/2026 và chọn kỳ tháng 11/2026
- **THEN** kỳ này tính 01/11 – 06/11/2026, kỳ trước là 01/10 – 31/10/2026, lũy kế năm 01/01 – 06/11/2026

#### Scenario: Quý đã qua
- **WHEN** hôm nay 06/11/2026 và chọn quý 3/2026
- **THEN** kỳ này 01/07 – 30/09/2026, kỳ trước quý 2/2026 (01/04 – 30/06/2026), lũy kế năm 01/01 – 30/09/2026

#### Scenario: Năm
- **WHEN** hôm nay 06/11/2026 và chọn năm 2026
- **THEN** kỳ này và lũy kế năm cùng là 01/01 – 06/11/2026, kỳ trước là cả năm 2025

#### Scenario: Kỳ ở tương lai
- **WHEN** hôm nay 06/11/2026 và yêu cầu kỳ tháng 12/2026
- **THEN** hệ thống không tính kỳ đó và mở tháng 11/2026

### Requirement: Doanh thu của kỳ
Doanh thu kỳ SHALL chưa VAT, gồm 4 dòng: **Tiền thuê** (gồm cước thuê, điều chỉnh) và **Bán hàng** (gồm cước bán) tính như doanh số D1 (spec `sales-revenue`, kỳ đã chốt lấy bảng chụp, kỳ chưa chốt tạm tính); **Đền bù đã duyệt** và **Mua lại đã duyệt** = số phải trả lưu khi duyệt, theo ngày duyệt. Phiếu chưa duyệt hoặc bị từ chối SHALL không tính.

#### Scenario: Bốn dòng doanh thu
- **WHEN** tháng 10/2026 có doanh số thuê 352.300.000 ₫, bán 146.000.000 ₫, phiếu đền bù duyệt trong tháng tổng 24.450.000 ₫, phiếu mua lại duyệt trong tháng 12.800.000 ₫
- **THEN** doanh thu tháng 10/2026 là 535.550.000 ₫ với đúng 4 dòng đó

#### Scenario: Phiếu đền bù chờ duyệt không tính
- **WHEN** phiếu đền bù 4.600.000 ₫ lập 28/10/2026 vẫn Chờ duyệt đến hôm nay
- **THEN** doanh thu đền bù tháng 10/2026 không gồm 4.600.000 ₫

#### Scenario: Tiền thuê kỳ chưa chốt tạm tính
- **WHEN** kỳ 10/2026 của một hợp đồng thuê chưa chốt
- **THEN** dòng Tiền thuê của tháng 10/2026 gồm số tạm tính của hợp đồng đó và cột kỳ được đánh dấu "tạm tính"

### Requirement: Doanh thu tháng khớp Tổng quan
Với mỗi tháng, Tiền thuê + Bán hàng trên báo cáo SHALL bằng đúng doanh số tháng đó trên D1 (cùng cách tính, cùng thời điểm xem). Đền bù và mua lại SHALL không làm đổi doanh số của D1.

#### Scenario: Khớp D1
- **WHEN** D1 ghi doanh số tháng 10/2026 là 498.300.000 ₫ (thuê 352.300.000 ₫, bán 146.000.000 ₫)
- **THEN** báo cáo tháng 10/2026 có Tiền thuê 352.300.000 ₫ và Bán hàng 146.000.000 ₫

### Requirement: Các khoản giá vốn và hao hụt từ sổ kho
Giá vốn và hao hụt SHALL đọc từ dòng sổ kho của kỳ (theo ngày ghi sổ), không khấu hao: **giá vốn hàng bán** (xuất bán của phiếu xuất); **giá vốn hàng khách mua lại** (xuất bán của phiếu mua lại); **hàng mất ở công trình** (`LOSS_OUT`); **giảm giá trị khi trả về đổi tình trạng**; **sửa chữa**; **chênh lệch kiểm kê và điều chỉnh**. Số là giá trị trên sổ, dấu + là làm giảm lợi nhuận.

#### Scenario: Giá vốn hàng bán theo kg
- **WHEN** phiếu xuất bán giao 05/11/2026 ghi sổ `SALE_OUT` 1.250 kg phế liệu giá BQ 5.200 ₫/kg
- **THEN** giá vốn hàng bán tháng 11/2026 tăng 6.500.000 ₫

#### Scenario: Hàng khách mua lại
- **WHEN** phiếu mua lại `MLA-2026-004` được duyệt 12/10/2026, sổ ghi `SALE_OUT` 20 `PK-KU` Tốt giá BQ 395.000 ₫ ở công trình
- **THEN** giá vốn hàng khách mua lại tháng 10/2026 tăng 7.900.000 ₫ **AND** doanh thu mua lại tháng 10/2026 gồm số phải trả của `MLA-2026-004`

#### Scenario: Hàng mất
- **WHEN** phiếu thu hồi ghi sổ 31/10/2026 có `LOSS_OUT` −2 `H1,7` Tốt giá BQ 400.000 ₫
- **THEN** hàng mất ở công trình tháng 10/2026 tăng 800.000 ₫

#### Scenario: Không có biến động
- **WHEN** tháng 01/2026 không có dòng sổ kho nào
- **THEN** mọi khoản giá vốn và hao hụt của tháng là 0 ₫

### Requirement: Giảm giá trị khi trả về đổi tình trạng
Với mỗi phiếu thu hồi ghi sổ trong kỳ, khoản này SHALL bằng giá trị hàng rời công trình (`RETURN_OUT`, giá BQ Mới / Tốt) trừ giá trị hàng nhập bãi (`RETURN_IN`, giá BQ Tốt / Chờ sửa / Phế liệu), tức đúng "Giá trị giảm do đổi tình trạng" trên phiếu. Hàng mất SHALL không nằm trong khoản này. Số có thể âm khi giá BQ nhập cao hơn.

#### Scenario: Trả về Mới, Tốt, Chờ sửa, Phế liệu
- **WHEN** `PTH-2026-071` ghi sổ 20/10/2026: `RETURN_OUT` −30 Mới (−15.600.000 ₫) và −68 Tốt (−27.200.000 ₫); `RETURN_IN` +80 Tốt (32.000.000 ₫), +15 Chờ sửa (3.750.000 ₫), +3 Phế liệu (180.000 ₫); `LOSS_OUT` −2 Tốt (−800.000 ₫)
- **THEN** giảm giá trị khi trả về tháng 10/2026 tăng 6.870.000 ₫ **AND** hàng mất tăng 800.000 ₫

#### Scenario: Trả về đúng tình trạng
- **WHEN** phiếu thu hồi trả 50 `CHEO1,7` Tốt về Tốt, giá BQ 90.000 ₫
- **THEN** khoản giảm giá trị của phiếu là 0 ₫

### Requirement: Sửa chữa không trừ hai lần
Chi phí sửa đã cộng vào giá hàng Tốt (0.2 #23) SHALL không trừ ngay khi ghi sổ phiếu sửa. Nó SHALL vào lợi nhuận khi hàng đó rời kho theo giá BQ (bán, mất, trả về hỏng lại). Khoản "Sửa chữa" của kỳ SHALL bằng tổng **lỗ hỏng hàng** của phiếu sửa ghi sổ trong kỳ. Báo cáo SHALL ghi kèm "chi phí sửa đã chi trong kỳ".

#### Scenario: Trả về Chờ sửa, sửa, rồi mất
- **WHEN** công ty chỉ có 10 `H1,7` Tốt giá BQ 400.000 ₫ (đều ở công trình); tháng 10 trả về 10 cái Chờ sửa (giá BQ Chờ sửa 250.000 ₫); tháng 11 phiếu sửa 10 cái, sửa xong 10, chi phí 500.000 ₫ (vào Tốt 300.000 ₫/cái); tháng 12 10 cái này mất ở công trình
- **THEN** giảm giá trị tháng 10 là 1.500.000 ₫; khoản Sửa chữa tháng 11 là 0 ₫ kèm "chi phí sửa đã chi 500.000 ₫"; hàng mất tháng 12 là 3.000.000 ₫
- **AND** tổng 3 tháng là 4.500.000 ₫ = giá trị ban đầu 4.000.000 ₫ + chi phí sửa 500.000 ₫, không trừ 500.000 ₫ lần thứ hai

#### Scenario: Cả dòng hỏng hết
- **WHEN** phiếu sửa ghi sổ 15/11/2026 có dòng `GG-M16` lấy 5, sửa xong 0, phế liệu 5, lỗ hỏng hàng 600.000 ₫
- **THEN** khoản Sửa chữa tháng 11/2026 tăng 600.000 ₫

#### Scenario: Có phần hỏng nhưng còn hàng sửa xong
- **WHEN** phiếu sửa `GG-K17` sửa xong 36, phế liệu 4, phần hỏng 235.000 ₫, chi phí 1.980.000 ₫
- **THEN** khoản Sửa chữa của phiếu là 0 ₫ **AND** chi phí sửa đã chi tăng 1.980.000 ₫

### Requirement: Phế liệu bán đi
Hàng trả về thành Phế liệu SHALL trừ phần giảm giá trị ở kỳ thu hồi; khi bán phế liệu đó, giá vốn hàng bán SHALL là giá trị Phế liệu trên sổ, và tiền bán vào doanh thu Bán hàng. Tổng hai lần trừ SHALL bằng giá trị trước khi hỏng.

#### Scenario: Trả về Phế liệu rồi bán
- **WHEN** tháng 10 trả về 4 `GG-K17` từ Tốt (400.000 ₫) thành Phế liệu (giá BQ 60.000 ₫); tháng 11 bán 4 cái đó, sổ ghi `SALE_OUT` 240.000 ₫, tiền bán 405.000 ₫
- **THEN** giảm giá trị tháng 10 là 1.360.000 ₫; tháng 11 giá vốn hàng bán 240.000 ₫ và doanh thu bán 405.000 ₫
- **AND** tổng trừ 1.600.000 ₫ = 4 × 400.000 ₫

### Requirement: Chênh lệch kiểm kê và điều chỉnh
Khoản này SHALL bằng giá trị giảm trừ giá trị tăng của dòng sổ phiên kiểm kê đã duyệt và phiếu điều chỉnh (số lượng, tình trạng, vị trí) đã duyệt trong kỳ. Phiếu tồn đầu kỳ, phiếu điều chỉnh giá trị `ĐCG`, phiếu nhập, xuất thuê và chuyển công trình SHALL không vào giá vốn và hao hụt.

#### Scenario: Kiểm kê thiếu và thừa
- **WHEN** `KK-2026-003` duyệt 28/10/2026 làm tổng giá trị sổ giảm 2.788.056 ₫
- **THEN** chênh lệch kiểm kê và điều chỉnh tháng 10/2026 tăng 2.788.056 ₫

#### Scenario: Điều chỉnh tình trạng
- **WHEN** `ĐC-2026-004` duyệt chuyển 10 `GG-K17` từ Tốt (195.282 ₫) sang Chờ sửa (160.000 ₫)
- **THEN** khoản này tăng 352.820 ₫

#### Scenario: Điều chỉnh giá trị không vào
- **WHEN** phiếu `ĐCG` sửa chi phí chuyến làm giá trị kho tăng 1.200.000 ₫ trong tháng 10/2026
- **THEN** giá vốn và hao hụt tháng 10/2026 không đổi

### Requirement: Giá vốn và hao hụt khớp sổ kho
Tổng giá vốn và hao hụt của kỳ SHALL bằng: − (tổng giá trị mọi dòng sổ trong kỳ, trừ tồn đầu kỳ, nhập mua, điều chỉnh giá trị) + tổng chi phí sửa trên phiếu sửa ghi sổ trong kỳ. Xuất thuê, chuyển công trình SHALL cộng ra 0.

#### Scenario: Đối chiếu một tháng
- **WHEN** tháng 10/2026 các dòng sổ (trừ tồn đầu, nhập mua, `ĐCG`) cộng −127.340.000 ₫ và chi phí sửa trên phiếu sửa ghi sổ trong tháng là 600.000 ₫
- **THEN** tổng giá vốn và hao hụt tháng 10/2026 là 127.940.000 ₫

### Requirement: Lợi nhuận gộp và tỷ suất
Lợi nhuận gộp SHALL = doanh thu − giá vốn và hao hụt. Tỷ suất SHALL = lợi nhuận gộp ÷ doanh thu × 100, làm tròn 1 chữ số (0,05 lên), hiện dấu phẩy. Doanh thu ≤ 0 thì tỷ suất hiện "—".

#### Scenario: Tính tay một tháng
- **WHEN** tháng 10/2026 doanh thu 535.550.000 ₫; giá vốn hàng bán 102.200.000 ₫, hàng khách mua lại 7.900.000 ₫, mất 9.860.000 ₫, giảm giá trị 6.240.000 ₫, sửa chữa 600.000 ₫, kiểm kê và điều chỉnh 1.140.000 ₫
- **THEN** giá vốn và hao hụt là 127.940.000 ₫ **AND** lợi nhuận gộp 407.610.000 ₫ **AND** tỷ suất 76,1 %

#### Scenario: Doanh thu 0
- **WHEN** tháng 01/2025 doanh thu 0 ₫, giá vốn và hao hụt 0 ₫
- **THEN** lợi nhuận gộp 0 ₫ và tỷ suất "—"

### Requirement: Ngày ghi nhận và cộng dồn
Mỗi khoản SHALL thuộc đúng một ngày: thuê theo ngày tính (spec `sales-revenue`), bán theo ngày giao, đền bù và mua lại theo ngày duyệt, giá vốn và hao hụt theo ngày ghi sổ, chi phí sửa theo ngày ghi sổ phiếu sửa. Mọi số của quý, năm, lũy kế SHALL bằng tổng các tháng trong đó.

#### Scenario: Quý bằng tổng 3 tháng
- **WHEN** lợi nhuận gộp tháng 7, 8, 9/2026 là 341.000.000 ₫, 393.000.000 ₫, 358.180.000 ₫
- **THEN** lợi nhuận gộp quý 3/2026 là 1.092.180.000 ₫

#### Scenario: Hàng mất và đền bù khác tháng
- **WHEN** phiếu thu hồi ghi sổ 31/10/2026 có hàng mất 800.000 ₫, phiếu đền bù của nó duyệt 03/11/2026 số phải trả 1.000.000 ₫
- **THEN** hàng mất vào tháng 10/2026, doanh thu đền bù vào tháng 11/2026 **AND** lũy kế năm 2026 gồm cả hai
