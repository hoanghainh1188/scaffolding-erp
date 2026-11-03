# Spec Delta

## ADDED Requirements

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
