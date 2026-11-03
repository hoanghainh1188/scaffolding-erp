## ADDED Requirements

### Requirement: Đang ở công trình tính cả thu hồi và hàng mất
Số đang ở công trình của hợp đồng thuê SHALL bằng tổng số lượng các dòng sổ tại vị trí công trình của phiếu xuất và phiếu thu hồi thuộc hợp đồng đó (vào − ra, gồm cả hàng mất), theo mã, gộp Mới và Tốt. "Còn phải giao" và cột "Đã trả" của D6 SHALL dùng số này. "Đã trả" SHALL gồm hàng trả về và hàng mất.

#### Scenario: Sau một phiếu thu hồi
- **WHEN** hợp đồng có 300 `H1,7`, đã xuất 320, rồi `PTH-2026-071` trả về 100 và mất 2
- **THEN** D6 hiện `H1,7` đã xuất 320, đã trả 102, đang ở công trình 218 **AND** còn phải giao 82

#### Scenario: Hàng mất thôi ở công trình
- **WHEN** công trình đang có 20 `MAM1,6` và phiếu thu hồi ghi 20 mất, 0 trả về
- **THEN** D6 hiện `MAM1,6` đang ở công trình 0 **AND** tiền 1 ngày của `MAM1,6` là 0 ₫

## MODIFIED Requirements

### Requirement: Tiến độ cấp hàng D6
D6 SHALL là màn theo hợp đồng, mở từ D5 khi hợp đồng Đã duyệt hoặc Đang thực hiện. Hợp đồng thuê SHALL hiện bảng hàng đang ở công trình (đã xuất, đã trả, đang ở công trình, tiền 1 ngày) và ô "Đang cho thuê"; hợp đồng bán SHALL hiện đã giao và còn phải giao. D6 SHALL có còn phải giao từng mã, dòng thời gian các đợt xuất và phiếu thu hồi mới nhất trước, và nút "Tạo đợt xuất". Bảng chỉ tính phiếu Đã xuất và phiếu thu hồi đã ghi sổ.

#### Scenario: Bảng hàng ở công trình
- **WHEN** công trình đã nhận 320 `H1,7`, 360 `CHEO1,7`, 160 `MAM1,6` (giá ngày 450 ₫, 300 ₫, 375 ₫) và chưa thu hồi
- **THEN** D6 hiện từng dòng đã xuất, đã trả 0, đang ở công trình, tiền 1 ngày **AND** ô "Đang cho thuê" hiện "840 cái" và tiền một ngày của 840 cái

#### Scenario: Phiếu chưa xuất không cộng
- **WHEN** `PX-2026-140` cần 120 `H1,7` đang Đang nhặt
- **THEN** cột đã xuất chưa cộng 120 đó **AND** dưới bảng hiện "Chỉ tính phiếu đã xác nhận. Phiếu xuất đang nhặt hàng chưa được cộng."

#### Scenario: Dòng thời gian
- **WHEN** hợp đồng có `PX-2026-061` Đợt 1 xuất 15/06/2026, `PX-2026-074` Đợt 2 xuất 02/07/2026 và `PX-2026-140` Đợt 3 Đang nhặt
- **THEN** dòng thời gian hiện Đợt 3 "Đang nhặt" trên cùng, rồi Đợt 2, Đợt 1 "Đã xuất", mỗi dòng có số đã xuất và cước

#### Scenario: Phiếu thu hồi trong dòng thời gian
- **WHEN** hợp đồng có `PX-2026-140` xuất 03/11/2026 và `PTH-2026-071` trả 100, mất 2 ngày 05/11/2026 có phiếu đền bù `ĐB-2026-009` Chờ duyệt
- **THEN** dòng thời gian hiện "Thu hồi PTH-2026-071 · 05/11/2026 · trả 100 cái, mất 2 cái · Đền bù Chờ duyệt" trên dòng của `PX-2026-140` **AND** bấm vào mở chi tiết phiếu thu hồi

#### Scenario: Nhắc phiếu gửi muộn
- **WHEN** `PX-2026-142` có ngày giao 06/11/2026 nhưng được xác nhận trên máy lúc 22:10 ngày 05/11/2026
- **THEN** D6 có khối "Cần kiểm tra" với dòng "PX-2026-142 · ngày giao 06/11/2026, xác nhận trên máy 05/11/2026"

#### Scenario: Thu hồi gửi muộn
- **WHEN** `PTH-2026-072` có ngày trả 06/11/2026 nhưng được lưu trên máy lúc 21:50 ngày 05/11/2026
- **THEN** khối "Cần kiểm tra" có dòng "PTH-2026-072 · ngày trả 06/11/2026, lưu trên máy 05/11/2026"

#### Scenario: Hợp đồng chưa duyệt
- **WHEN** người dùng mở D5 của hợp đồng Nháp
- **THEN** D5 không có nút "Tiến độ cấp hàng"

#### Scenario: Hợp đồng bán
- **WHEN** hợp đồng bán `112026/ANPHAT-PDLONG` đã giao 50 / 200 cái `PK-KU` Mới
- **THEN** D6 có tiêu đề "Giao hàng · 112026/ANPHAT-PDLONG" và hiện `PK-KU` Mới đã giao 50, còn phải giao 150
