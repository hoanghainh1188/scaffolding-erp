## MODIFIED Requirements

### Requirement: Đang ở công trình tính cả thu hồi và hàng mất
Số đang ở công trình của hợp đồng thuê SHALL bằng tổng số lượng các dòng sổ tại vị trí công trình của các chứng từ thuộc hợp đồng đó (vào − ra), theo mã, gộp Mới và Tốt: phiếu xuất, phiếu thu hồi (gồm hàng mất), phiếu chuyển công trình (dòng ra khi hợp đồng là hợp đồng đi, dòng vào khi là hợp đồng nhận) và phiếu mua lại đã duyệt. "Còn phải giao" của D6 SHALL dùng số này. Cột "Đã trả" SHALL chỉ gồm hàng trả về bãi; hàng mất SHALL ở cột "Mất" riêng, để đã xuất + chuyển đến − đã trả − chuyển đi − mua lại − mất = đang ở công trình.

#### Scenario: Sau một phiếu thu hồi
- **WHEN** hợp đồng có 300 `H1,7`, đã xuất 320, rồi `PTH-2026-071` trả về 100 và mất 2
- **THEN** D6 hiện `H1,7` đã xuất 320, đã trả 100, mất 2, đang ở công trình 218 **AND** còn phải giao 82

#### Scenario: Hàng mất thôi ở công trình
- **WHEN** công trình đang có 20 `MAM1,6` và phiếu thu hồi ghi 20 mất, 0 trả về
- **THEN** D6 hiện `MAM1,6` đã trả 0, mất 20, đang ở công trình 0 **AND** tiền 1 ngày của `MAM1,6` là 0 ₫

#### Scenario: Sau phiếu chuyển công trình
- **WHEN** An Phú (`102026/ANPHAT-MINHPHAT`) đã xuất 120 `H1,7`, Dương Nội (`112026/ANPHAT-MINHPHAT`) có 600 `H1,7` trên hợp đồng, chưa xuất, và `CCT-2026-004` chuyển 50 `H1,7` từ An Phú sang Dương Nội
- **THEN** D6 An Phú hiện `H1,7` đã xuất 120, chuyển đi 50, đang ở công trình 70 **AND** D6 Dương Nội hiện `H1,7` chuyển đến 50, đang ở công trình 50, còn phải giao 550

#### Scenario: Hai hợp đồng cùng một công trình
- **WHEN** hợp đồng cũ và hợp đồng mới cùng công trình `CT-0003`, và phiếu chuyển 30 `H1,7` từ hợp đồng cũ sang hợp đồng mới
- **THEN** tồn `H1,7` tại `CT-0003` không đổi **AND** đang ở công trình của hợp đồng cũ giảm 30, của hợp đồng mới tăng 30

#### Scenario: Sau phiếu mua lại
- **WHEN** công trình đang có 120 `TR16` và `MLA-2026-003` mua 20 `TR16` được duyệt
- **THEN** D6 hiện `TR16` mua lại 20, đang ở công trình 100 **AND** còn phải giao không tăng vì hàng mua lại

#### Scenario: Phiếu chưa xong không tính
- **WHEN** `CCT-2026-004` Chờ xác nhận và `MLA-2026-003` Chờ duyệt
- **THEN** đang ở công trình của cả hai hợp đồng chưa đổi

### Requirement: Không hủy hợp đồng còn phiếu xuất
Hủy hợp đồng SHALL bị từ chối khi hợp đồng có phiếu xuất Đã xuất, đã nhận hàng từ phiếu chuyển công trình Đã chuyển, hoặc còn phiếu xuất Chờ nhặt, Đang nhặt, hoặc là hợp đồng nhận của phiếu chuyển Nháp, Chờ xác nhận.

#### Scenario: Có phiếu đã xuất
- **WHEN** Giám đốc hủy `112026/ANPHAT-MINHPHAT` đã có `PX-2026-001` Đã xuất
- **THEN** hệ thống từ chối với "Hợp đồng đã xuất hàng nên không hủy được." và không đổi dữ liệu

#### Scenario: Còn phiếu chưa xong
- **WHEN** hợp đồng Đã duyệt chỉ có `PX-2026-141` Chờ nhặt và Giám đốc hủy hợp đồng
- **THEN** hệ thống từ chối với "Hợp đồng còn phiếu xuất PX-2026-141 chưa xong. Bạn hủy phiếu xuất đó trước rồi hủy hợp đồng."

#### Scenario: Phiếu đã hủy hết
- **WHEN** hợp đồng Đã duyệt chỉ có `PX-2026-141` Đã hủy và Giám đốc hủy hợp đồng với lý do
- **THEN** hợp đồng sang Đã hủy

#### Scenario: Còn phiếu chuyển tới chưa xong
- **WHEN** hợp đồng Đã duyệt là hợp đồng nhận của `CCT-2026-004` Chờ xác nhận và Giám đốc hủy hợp đồng
- **THEN** hệ thống từ chối với "Hợp đồng còn phiếu chuyển công trình CCT-2026-004 chưa xong. Bạn hủy phiếu chuyển đó trước rồi hủy hợp đồng."

## ADDED Requirements

### Requirement: D6 có chuyển công trình, mua lại và đổi hàng
Bảng hàng ở công trình của D6 SHALL có thêm cột "Chuyển đến", "Chuyển đi", "Mua lại", mỗi cột chỉ hiện khi hợp đồng có số khác 0. Dòng thời gian SHALL có phiếu chuyển công trình (đi và đến, cả Nháp, Chờ xác nhận), phiếu mua lại (mọi trạng thái), mới nhất trước. Với hợp đồng thuê Đang thực hiện còn hàng ở công trình, D6 SHALL có nút "Chuyển công trình", "Khách mua lại", "Đổi hàng" cho người có quyền sửa hợp đồng thuê.

#### Scenario: Phiếu chuyển trong dòng thời gian hai hợp đồng
- **WHEN** `CCT-2026-004` chuyển 86 cái từ An Phú sang Dương Nội ngày 05/11/2026
- **THEN** D6 An Phú có dòng "Chuyển đi CCT-2026-004 · 05/11/2026 · 86 cái → Trường THCS Dương Nội" **AND** D6 Dương Nội có dòng "Chuyển đến CCT-2026-004 · 05/11/2026 · 86 cái ← Chung cư An Phú – Block B" **AND** bấm vào mở phiếu chuyển

#### Scenario: Phiếu mua lại chờ duyệt trong dòng thời gian
- **WHEN** `MLA-2026-003` Chờ duyệt
- **THEN** D6 có dòng "Mua lại MLA-2026-003 · Chờ duyệt · 20 ty ren, 50 bát chuồn · 1.300.000 ₫"

#### Scenario: Không có chuyển, mua lại
- **WHEN** hợp đồng chưa có phiếu chuyển hay phiếu mua lại nào đã ghi sổ
- **THEN** bảng D6 không có cột "Chuyển đến", "Chuyển đi", "Mua lại"

#### Scenario: Kế toán không thấy nút
- **WHEN** `thuha` mở D6 của hợp đồng thuê Đang thực hiện
- **THEN** trang không có nút "Chuyển công trình", "Khách mua lại", "Đổi hàng"
