## ADDED Requirements

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
