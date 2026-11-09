# mobile-home Specification

## Purpose
Màn Việc hôm nay (M1) là trang đầu của khu Mobile: cho Thủ kho thấy ngay các việc cần làm (xe sắp về, phiếu chưa gửi) và mở việc bằng một lần bấm.

## Requirements

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

### Requirement: Kiểm kê trên Việc hôm nay
Người có quyền `stocktake.count` SHALL thấy khối "Kiểm kê" trên M1: mỗi phiên chưa xong ở bãi, xưởng là một thẻ (mã phiên, vị trí, trạng thái, tiến độ), và nút "Bắt đầu kiểm kê" mở M6a. Phiên Đang đếm SHALL tính vào số việc N của đầu trang; phiên Chờ duyệt chỉ hiện "Chờ Giám đốc duyệt", không có nút, không tính vào N.

#### Scenario: Phiên đang đếm
- **WHEN** `KK-2026-003` tại `BAI-01` đang đếm, máy có nháp 17 / 28 dòng
- **THEN** M1 có thẻ "KK-2026-003 · BAI-01 · Bãi chính", "Đang đếm · 17 / 28 dòng" và nút "Tiếp tục đếm" mở M6

#### Scenario: Văn phòng yêu cầu đếm lại
- **WHEN** Giám đốc yêu cầu đếm lại 1 dòng của `KK-2026-003`
- **THEN** thẻ hiện "Cần đếm lại 1 dòng" màu `warning` và nút "Đếm lại"

#### Scenario: Phiên bị trả lại
- **WHEN** Giám đốc trả lại `KK-2026-003` với lý do "Đếm lại cả khu chéo sau xưởng"
- **THEN** thẻ hiện "Bị trả lại: Đếm lại cả khu chéo sau xưởng" và nút "Tiếp tục đếm"

#### Scenario: Không có phiên nào
- **WHEN** không có phiên chưa xong
- **THEN** khối "Kiểm kê" chỉ có nút "Bắt đầu kiểm kê"

#### Scenario: Vai trò không kiểm kê
- **WHEN** `thuha` (Kế toán) mở `/m`
- **THEN** trang không có khối "Kiểm kê"

### Requirement: Xuất hàng trên Việc hôm nay
Người có quyền `deliveries.pick` SHALL thấy khối "Xuất hàng" trên M1: mỗi phiếu Chờ nhặt hoặc Đang nhặt có ngày dự kiến tới hết hôm nay (kể cả trễ) là một thẻ, xếp theo ngày dự kiến (trễ trước); phiếu không có ngày dự kiến xếp cuối. Thẻ SHALL có nhãn ngày ("Hôm nay", "Trễ N ngày", "Chưa hẹn"), số phiếu và đợt, công trình (hoặc nhà thầu với hợp đồng bán), tóm tắt hàng không có giá, trạng thái và nút mở M5. Mỗi thẻ SHALL tính vào số việc N của đầu trang.

#### Scenario: Thẻ phiếu chờ nhặt
- **WHEN** `PX-2026-140` Đợt 3 của An Phú – Block B, 60 bộ giàn giáo 1,7m, dự kiến 03/11/2026, Chờ nhặt, và hôm nay là 03/11/2026
- **THEN** M1 có thẻ "Hôm nay", "PX-2026-140 · Đợt 3 · An Phú – Block B", "60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm" và nút "Bắt đầu nhặt"

#### Scenario: Đang nhặt có nháp trên máy
- **WHEN** `PX-2026-140` Đang nhặt và máy của `vantung` có nháp 200 / 300 cái
- **THEN** thẻ hiện "Đang nhặt · 200 / 300 cái" và nút "Tiếp tục nhặt"

#### Scenario: Phiếu trễ
- **WHEN** `PX-2026-138` dự kiến 01/11/2026, vẫn Chờ nhặt, hôm nay 03/11/2026
- **THEN** thẻ hiện nhãn "Trễ 2 ngày" màu `warning` và đứng trước các phiếu hôm nay

#### Scenario: Phiếu đã xuất biến mất
- **WHEN** `PX-2026-140` đã xuất
- **THEN** lần mở `/m` sau không còn thẻ của `PX-2026-140`

#### Scenario: Vai trò không nhặt hàng
- **WHEN** `thuha` (Kế toán) mở `/m`
- **THEN** trang không có khối "Xuất hàng"

### Requirement: Thu hồi trên Việc hôm nay
Người có quyền `returns.receive` SHALL thấy khối "Thu hồi" trên M1 với nút "Nhập thu hồi" mở M4, và các phiếu thu hồi đã ghi sổ hôm nay của mọi người (số phiếu, công trình, số trả về và mất, giờ ghi sổ, không có giá). Khối này SHALL không cộng vào số việc N của đầu trang. Nháp thu hồi chưa gửi SHALL hiện ở thanh "N phiếu chưa gửi" như các nháp khác.

#### Scenario: Có phiếu hôm nay
- **WHEN** `PTH-2026-071` của An Phú – Block B trả 100 cái, mất 2 cái, ghi sổ lúc 09:40 hôm nay
- **THEN** khối "Thu hồi" có dòng "PTH-2026-071 · An Phú – Block B · trả 100, mất 2 · 09:40" và nút "Nhập thu hồi"

#### Scenario: Nháp thu hồi chưa gửi
- **WHEN** máy có nháp thu hồi của An Phú – Block B lưu lúc 08:15
- **THEN** M1 hiện "1 phiếu chưa gửi: Thu hồi An Phú – Block B, nháp lúc 08:15" và nút "Tiếp tục"

#### Scenario: Vai trò không thu hồi
- **WHEN** `thuha` (Kế toán) mở `/m`
- **THEN** trang không có khối "Thu hồi"

### Requirement: Chuyển công trình trên Việc hôm nay
Người có quyền `deliveries.pick` SHALL thấy khối "Chuyển công trình" trên M1 khi có phiếu chuyển Chờ xác nhận: mỗi phiếu là một thẻ có số phiếu, "<công trình đi> → <công trình nhận>", tổng số cái theo đơn vị, không có giá, và nút "Xác nhận" mở M9. Mỗi thẻ SHALL tính vào số việc N của đầu trang. Nháp M9 chưa gửi SHALL hiện ở thanh "N phiếu chưa gửi".

#### Scenario: Có phiếu chờ xác nhận
- **WHEN** `CCT-2026-004` chuyển 90 cái từ An Phú – Block B sang Trường THCS Dương Nội đang Chờ xác nhận
- **THEN** M1 có thẻ "CCT-2026-004 · An Phú – Block B → Trường THCS Dương Nội · 90 cái" và nút "Xác nhận" **AND** N tăng 1

#### Scenario: Phiếu đã chuyển biến mất
- **WHEN** `CCT-2026-004` đã ghi sổ
- **THEN** lần mở `/m` sau không còn thẻ của `CCT-2026-004`

#### Scenario: Vai trò không nhặt hàng
- **WHEN** `thuha` (Kế toán) mở `/m`
- **THEN** trang không có khối "Chuyển công trình"

### Requirement: Sửa chữa trên Việc hôm nay
Người có quyền `repairs.work` SHALL thấy khối "Sửa chữa" trên M1 với thẻ của mỗi lệnh Đã giao (nút "Nhận lệnh") và Đang sửa (nút "Tiếp tục"); người có quyền `repairs.count` SHALL thấy thẻ của mỗi lệnh Chờ nghiệm thu (nút "Đếm nghiệm thu"). Mỗi thẻ SHALL có mã, tổ, "<chỗ lấy> → <xưởng>", tổng số theo đơn vị, không có giá, và SHALL tính vào số việc N của đầu trang. Lệnh bị trả lại SHALL có nhãn "Văn phòng trả lại" màu `warning`. Nháp M8 chưa gửi SHALL hiện ở thanh "N phiếu chưa gửi".

#### Scenario: Xưởng có lệnh mới
- **WHEN** `PSC-2026-031` Đã giao cho tổ anh Lực, lấy 60 cái tại `BAI-01` về `XUONG-01`
- **THEN** M1 của `hoangnam` có thẻ "PSC-2026-031 · tổ anh Lực · BAI-01 → XUONG-01 · 60 cái" và nút "Nhận lệnh" **AND** N tăng 1

#### Scenario: Thủ kho có lệnh chờ nghiệm thu
- **WHEN** `PSC-2026-031` Chờ nghiệm thu
- **THEN** M1 của `vantung` có thẻ của lệnh với nút "Đếm nghiệm thu"

#### Scenario: Vai trò không làm sửa chữa
- **WHEN** `thuha` (Kế toán) mở `/m`
- **THEN** trang không có khối "Sửa chữa"

### Requirement: Sản xuất trên Việc hôm nay
Người có quyền `production.work` SHALL thấy khối "Sản xuất" trên M1, với thẻ của mỗi lệnh Đã giao (nút "Nhận lệnh") và Đang làm (nút "Tiếp tục"). Người có quyền `production.count` SHALL thấy thẻ của mỗi lệnh Chờ đếm (nút "Đếm thành phẩm"). Mỗi thẻ SHALL có:
- mã, tổ, "<xưởng> → <bãi nhận>", tổng số kế hoạch;
- không có giá.

Thẻ SHALL tính vào số việc N của đầu trang. Lệnh bị trả lại SHALL có nhãn "Văn phòng trả lại" màu `warning`. Nháp M10 chưa gửi SHALL hiện ở thanh "N phiếu chưa gửi".

#### Scenario: Xưởng có lệnh sản xuất mới
- **WHEN** `LSX-2026-004` Đã giao cho tổ anh Lực, `XUONG-01` → `BAI-01`, 100 `GG-K17` và 200 `GG-CH`
- **THEN** M1 của `hoangnam` có thẻ "LSX-2026-004 · tổ anh Lực · XUONG-01 → BAI-01 · 300 cái" và nút "Nhận lệnh" **AND** N tăng 1

#### Scenario: Thủ kho có lệnh chờ đếm
- **WHEN** `LSX-2026-004` Chờ đếm
- **THEN** M1 của `vantung` có thẻ của lệnh với nút "Đếm thành phẩm"

#### Scenario: Vai trò không làm sản xuất
- **WHEN** `thuha` (Kế toán) mở `/m`
- **THEN** trang không có khối "Sản xuất"
