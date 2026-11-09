## ADDED Requirements

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
