# mobile-history Specification

## Purpose
Màn Lịch sử (M7) cho Thủ kho xem lại phiếu đã làm và các nháp còn trên máy, để tiếp tục, gửi lại hoặc tra cứu.

## Requirements

### Requirement: Nháp chưa gửi ở đầu Lịch sử
Trang `/m/history` SHALL hiện mục "Chưa gửi · lưu trên máy này" ở đầu khi máy có nháp của người đang đăng nhập. Mỗi nháp SHALL có loại, tên chứng từ, giờ lưu, tiến độ, trạng thái (Đang làm, Chờ gửi, Bị từ chối kèm lý do), nút "Tiếp tục" hoặc "Gửi lại", và "Xóa nháp".

#### Scenario: Nháp đang làm
- **WHEN** máy có nháp "Nhập PO-2026-052" lưu lúc 08:15, đã đếm 2/4 mã
- **THEN** M7 hiện "Nhập · PO-2026-052", "Nháp lúc 08:15 · 2/4 mã đã đếm" và nút "Tiếp tục"

#### Scenario: Nháp chờ gửi
- **WHEN** nháp đang "Chờ gửi" và có mạng
- **THEN** M7 có nút "Gửi lại" để gửi ngay

### Requirement: Phiếu đã ghi sổ theo ngày
Dưới mục nháp, M7 SHALL hiện phiếu nhập đã ghi sổ (người có `receiving.manage`) và phiếu xuất đã xuất (người có `deliveries.pick`) của mọi người, nhóm theo ngày nghiệp vụ mới nhất trước ("Hôm nay, 26/10", "Hôm qua, 25/10"). Phiếu nhập có mã, nhà cung cấp, loại hàng, số mã đã nhận, giờ ghi sổ; phiếu xuất có số phiếu, công trình hoặc nhà thầu, số đã xuất, giờ ghi sổ, không có giá. Ban đầu SHALL hiện 2 ngày; "Xem các ngày trước" tải thêm 7 ngày. Bấm phiếu SHALL mở phiếu chỉ xem.

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

### Requirement: Lọc theo loại phiếu
M7 SHALL có bộ lọc loại phiếu "Tất cả", "Nhập", "Xuất". Loại Thu hồi SHALL chỉ hiện khi chức năng của nó có. Loại đang chọn SHALL lưu trên URL.

#### Scenario: Lọc Nhập
- **WHEN** Thủ kho chọn "Nhập"
- **THEN** URL có `?type=receipt` **AND** danh sách chỉ có nháp nhập và phiếu nhập

#### Scenario: Lọc Xuất
- **WHEN** Thủ kho chọn "Xuất"
- **THEN** URL có `?type=delivery` **AND** danh sách chỉ có nháp nhặt hàng và phiếu xuất

#### Scenario: Vai trò không nhận hàng
- **WHEN** `thuha` (Kế toán) mở `/m/history` trên máy không có nháp
- **THEN** M7 hiện "Chưa có phiếu nào. Phiếu bạn làm sẽ hiện ở đây." và không gọi danh sách phiếu nhập hay phiếu xuất
