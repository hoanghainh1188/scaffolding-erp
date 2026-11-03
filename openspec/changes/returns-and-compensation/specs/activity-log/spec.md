## ADDED Requirements

### Requirement: Thao tác trên phiếu thu hồi và phiếu đền bù được ghi
Ghi sổ phiếu thu hồi SHALL ghi đúng một dòng nhật ký Ghi sổ của phiếu thu hồi và, nếu có phiếu đền bù, đúng một dòng Tạo của phiếu đền bù. Mỗi lệnh Sửa, Duyệt, Từ chối phiếu đền bù SHALL ghi đúng một dòng. Lọc theo loại chứng từ trên D18 SHALL có Phiếu thu hồi và Phiếu đền bù; nhóm "Trả lại, hủy, xóa" SHALL gồm thao tác "Từ chối".

#### Scenario: Ghi sổ có phiếu đền bù
- **WHEN** `vantung` lưu `PTH-2026-071` có hàng Chờ sửa và Mất
- **THEN** nhật ký có đúng một dòng "Ghi sổ PTH-2026-071" và một dòng "Tạo ĐB-2026-009"

#### Scenario: Gửi lại cùng mã nháp
- **WHEN** máy gửi lại lần lưu `PTH-2026-071` cùng mã nháp
- **THEN** vẫn chỉ có một dòng Ghi sổ `PTH-2026-071` và một dòng Tạo `ĐB-2026-009`

#### Scenario: Lọc phiếu đền bù trên D18
- **WHEN** Giám đốc lọc D18 theo loại Phiếu đền bù và nhóm "Trả lại, hủy, xóa"
- **THEN** bảng chỉ hiện các dòng "Từ chối" có mã dạng `ĐB-2026-009`
