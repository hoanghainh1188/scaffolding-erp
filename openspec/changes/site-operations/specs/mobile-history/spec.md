## MODIFIED Requirements

### Requirement: Phiếu đã ghi sổ theo ngày
Dưới mục nháp, M7 SHALL hiện phiếu đã ghi sổ của mọi người theo quyền: phiếu nhập (`receiving.manage`), phiếu xuất và phiếu chuyển công trình (`deliveries.pick`), phiếu thu hồi (`returns.receive`), nhóm theo ngày nghiệp vụ mới nhất trước ("Hôm nay, 26/10", "Hôm qua, 25/10"). Mỗi dòng có số phiếu, nhà cung cấp hoặc công trình, số lượng, giờ ghi sổ, không có giá. Ban đầu SHALL hiện 2 ngày; "Xem các ngày trước" tải thêm 7 ngày. Bấm phiếu SHALL mở phiếu chỉ xem.

#### Scenario: Phiếu hôm nay
- **WHEN** `PN-2026-091` (Thép Phúc Lâm, hàng mới, 2 mã) ghi sổ lúc 07:20 ngày 26/10/2026
- **THEN** mục "Hôm nay, 26/10" có dòng "Nhập PN-2026-091", "Thép Phúc Lâm · hàng mới · 2 mã", "07:20"

#### Scenario: Mở phiếu
- **WHEN** Thủ kho bấm "Nhập PN-2026-090"
- **THEN** trình duyệt mở `/m/receipts/PN-2026-090`

#### Scenario: Chưa có phiếu nào
- **WHEN** chưa có phiếu nhập nào và máy không có nháp
- **THEN** M7 hiện "Chưa có phiếu nào. Phiếu bạn làm sẽ hiện ở đây."

#### Scenario: Phiếu xuất hôm nay
- **WHEN** `PX-2026-140` của An Phú – Block B xuất 260 cái lúc 10:42 ngày 03/11/2026
- **THEN** mục "Hôm nay, 03/11" có dòng "Xuất PX-2026-140", "An Phú – Block B · 260 cái", "10:42" **AND** bấm vào mở `/m/deliveries/PX-2026-140` chỉ xem

#### Scenario: Phiếu thu hồi hôm nay
- **WHEN** `PTH-2026-071` của An Phú – Block B trả 100 cái, mất 2 cái lúc 09:40 ngày 05/11/2026
- **THEN** mục "Hôm nay, 05/11" có dòng "Thu hồi PTH-2026-071", "An Phú – Block B · trả 100 cái, mất 2 cái", "09:40" **AND** bấm vào mở `/m/returns/PTH-2026-071` chỉ xem, có ảnh, không có giá

#### Scenario: Phiếu chuyển công trình hôm nay
- **WHEN** `CCT-2026-004` chuyển 86 cái từ An Phú – Block B sang Trường THCS Dương Nội lúc 16:05 ngày 05/11/2026
- **THEN** mục "Hôm nay, 05/11" có dòng "Chuyển CCT-2026-004", "An Phú – Block B → Trường THCS Dương Nội · 86 cái", "16:05" **AND** bấm vào mở `/m/site-transfers/CCT-2026-004` chỉ xem, không có giá

### Requirement: Lọc theo loại phiếu
M7 SHALL có bộ lọc loại phiếu "Tất cả", "Nhập", "Xuất", "Thu hồi", "Chuyển". Loại đang chọn SHALL lưu trên URL.

#### Scenario: Lọc Nhập
- **WHEN** Thủ kho chọn "Nhập"
- **THEN** URL có `?type=receipt` **AND** danh sách chỉ có nháp nhập và phiếu nhập

#### Scenario: Lọc Xuất
- **WHEN** Thủ kho chọn "Xuất"
- **THEN** URL có `?type=delivery` **AND** danh sách chỉ có nháp nhặt hàng và phiếu xuất

#### Scenario: Lọc Thu hồi
- **WHEN** Thủ kho chọn "Thu hồi"
- **THEN** URL có `?type=return` **AND** danh sách chỉ có nháp thu hồi và phiếu thu hồi

#### Scenario: Lọc Chuyển
- **WHEN** Thủ kho chọn "Chuyển"
- **THEN** URL có `?type=transfer` **AND** danh sách chỉ có nháp xác nhận chuyển và phiếu chuyển công trình

#### Scenario: Vai trò không nhận hàng
- **WHEN** `thuha` (Kế toán) mở `/m/history` trên máy không có nháp
- **THEN** M7 hiện "Chưa có phiếu nào. Phiếu bạn làm sẽ hiện ở đây." và không gọi danh sách phiếu nhập, phiếu xuất, phiếu thu hồi hay phiếu chuyển
