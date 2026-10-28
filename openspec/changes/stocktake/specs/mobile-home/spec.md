## ADDED Requirements

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
