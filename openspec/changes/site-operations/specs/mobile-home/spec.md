## ADDED Requirements

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
