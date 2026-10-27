# Spec Delta

## Purpose

Màn Việc hôm nay (M1) là trang đầu của khu Mobile: cho Thủ kho thấy ngay các việc cần làm (xe sắp về, phiếu chưa gửi) và mở việc bằng một lần bấm.

## ADDED Requirements

### Requirement: Đầu trang Việc hôm nay
Trang `/m` SHALL hiện thứ và ngày hôm nay theo giờ Việt Nam, và câu chào "Chào <tên>, hôm nay có N việc", với N là số thẻ việc của hôm nay và các việc đã trễ. N = 0 SHALL hiện "Chào <tên>, hôm nay chưa có việc nào".

#### Scenario: Có việc
- **WHEN** `vantung` (tên Tùng) mở `/m` ngày Thứ Hai 26/10/2026, có 2 đơn dự kiến về hôm nay
- **THEN** trang hiện "Thứ Hai, 26/10/2026" và "Chào Tùng, hôm nay có 2 việc"

#### Scenario: Không có việc
- **WHEN** không có đơn nào đang xử lý
- **THEN** trang hiện "Chào Tùng, hôm nay chưa có việc nào" và "Xe sắp về sẽ hiện ở đây."

### Requirement: Xe sắp về bãi
Người có quyền `receiving.manage` SHALL thấy khối "Xe sắp về bãi" gồm mọi đơn thu mua đang xử lý có ngày dự kiến tới hết ngày mai: đơn trễ và hôm nay trước (theo giờ), rồi ngày mai; đơn ngày sau đó gom thành "Xem N đơn ngày sau". Mỗi thẻ SHALL có giờ hoặc nhãn ngày, mã đơn, nhà cung cấp, xe, loại hàng, số mã còn phải nhận và nút mở M3.

#### Scenario: Thẻ đơn hôm nay
- **WHEN** `PO-2026-052` (anh Trần Văn Hùng, hàng cũ, xe 29H-123.45, 4 mã) dự kiến 26/10/2026 09:30 và hôm nay là 26/10/2026
- **THEN** thẻ hiện "09:30", "PO-2026-052 · anh Trần Văn Hùng", "Xe 29H-123.45 · 4 mã hàng cũ" và nút "Bắt đầu nhập hàng"

#### Scenario: Đơn trễ hẹn
- **WHEN** `PO-2026-049` dự kiến 24/10/2026, chưa nhận, hôm nay 26/10/2026
- **THEN** thẻ hiện nhãn "Trễ 2 ngày" màu `warning` và đứng trước các đơn hôm nay

#### Scenario: Đơn đang chờ giao bù
- **WHEN** `PO-2026-051` đã có phiếu nhập và còn chờ giao bù 40 mâm
- **THEN** thẻ hiện "Đang nhận · chờ giao bù 40 mâm giàn giáo 1,6m"

#### Scenario: Đơn đã đóng biến mất
- **WHEN** Kinh doanh đóng `PO-2026-051`
- **THEN** lần mở `/m` sau không còn thẻ của `PO-2026-051`

#### Scenario: Có nháp của đơn trên máy
- **WHEN** máy có nháp nhập `PO-2026-052` của người đang đăng nhập
- **THEN** nút của thẻ là "Tiếp tục nhập" và mở lại nháp đó

#### Scenario: Vai trò không nhận hàng
- **WHEN** `thuha` (Kế toán) mở `/m`
- **THEN** trang không có khối "Xe sắp về bãi"

### Requirement: Phiếu chưa gửi trên M1
Khi máy có nháp chưa gửi của người đang đăng nhập, đầu M1 SHALL hiện thanh "N phiếu chưa gửi" kèm tên và giờ lưu của nháp mới nhất và nút "Tiếp tục". Thanh này đọc dữ liệu trên máy, hiện được cả khi mất mạng sau khi trang đã mở.

#### Scenario: Một nháp
- **WHEN** máy có một nháp "Nhập PO-2026-052" lưu lúc 08:15
- **THEN** M1 hiện "1 phiếu chưa gửi: Nhập PO-2026-052, nháp lúc 08:15" và nút "Tiếp tục"
