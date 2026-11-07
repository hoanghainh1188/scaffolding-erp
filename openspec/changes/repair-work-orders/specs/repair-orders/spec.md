## ADDED Requirements

### Requirement: Không lập phiếu sửa đơn giản mới
Từ khi có lệnh sửa chữa, hệ thống SHALL không tạo phiếu sửa đơn giản mới: nút tạo trên `/repairs` mở lệnh sửa, và API tạo phiếu đơn giản SHALL từ chối. Phiếu đơn giản Nháp đã có SHALL vẫn sửa, xóa, ghi sổ được theo đúng luật cũ (chi phí gõ tay). Phiếu đơn giản đã ghi sổ SHALL giữ nguyên số và cách hiện.

#### Scenario: Gửi thẳng API tạo phiếu đơn giản
- **WHEN** Kế toán gửi `POST /api/repairs` với chi phí sửa gõ tay theo kiểu phiếu đơn giản
- **THEN** API trả 422 "Phiếu sửa đơn giản không lập mới nữa, dùng lệnh sửa chữa"

#### Scenario: Nháp cũ vẫn ghi sổ
- **WHEN** `PSC-2026-025` là phiếu đơn giản Nháp lập trước khi có lệnh sửa
- **THEN** Kế toán mở D12 đơn giản, sửa chi phí và ghi sổ được như trước

## MODIFIED Requirements

### Requirement: Danh sách phiếu sửa chữa
Trang `/repairs` SHALL liệt kê cả phiếu sửa đơn giản và lệnh sửa, mới nhất trước, mỗi dòng: mã, "lấy tại → nhập về" (phiếu đơn giản) hoặc "lấy tại → xưởng" (lệnh), số mã, tổng sửa xong, tổng phế liệu, tổng chi phí (phiếu đơn giản; lệnh chỉ khi đã ghi sổ, còn lại "—"), trạng thái. Lọc theo trạng thái nằm trên URL, gồm Nháp, Đã giao, Đang sửa, Chờ nghiệm thu, Chờ ghi sổ (Đã đếm), Đã ghi sổ, Đã hủy. Người có `repairs.manage` SHALL thấy nút "Lệnh mới".

#### Scenario: Danh sách có nháp và phiếu đã ghi
- **WHEN** có `PSC-2026-024` Nháp và `PSC-2026-023` Đã ghi sổ
- **THEN** `PSC-2026-024` đứng trước với nhãn "Nháp" **AND** `/repairs?status=posted` chỉ hiện `PSC-2026-023`

#### Scenario: Lọc lệnh chờ ghi sổ
- **WHEN** có lệnh `PSC-2026-031` Đã đếm và phiếu đơn giản `PSC-2026-030` Đã ghi sổ
- **THEN** `/repairs?status=counted` chỉ hiện `PSC-2026-031` với nhãn "Chờ ghi sổ" và cột chi phí "—"

#### Scenario: Chưa có phiếu
- **WHEN** chưa có phiếu sửa chữa hay lệnh nào
- **THEN** trang hiện "Chưa có phiếu sửa chữa" và nút "Lệnh mới" (nếu có quyền)
