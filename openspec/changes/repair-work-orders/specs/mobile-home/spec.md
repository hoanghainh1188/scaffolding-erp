## ADDED Requirements

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
