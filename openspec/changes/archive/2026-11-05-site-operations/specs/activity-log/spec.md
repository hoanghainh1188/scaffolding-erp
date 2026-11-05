## ADDED Requirements

### Requirement: Thao tác trên phiếu chuyển công trình và phiếu mua lại được ghi
Mỗi lệnh làm đổi phiếu chuyển công trình (Tạo, Sửa, Gửi điện thoại, Rút về, Hủy, Ghi sổ) và phiếu mua lại (Tạo, Sửa, Duyệt, Từ chối) SHALL ghi đúng một dòng nhật ký. Ghi sổ phiếu chuyển làm hợp đồng nhận sang Đang thực hiện SHALL không ghi thêm dòng của hợp đồng. Lọc theo loại chứng từ trên D18 SHALL có Phiếu chuyển công trình và Phiếu mua lại.

#### Scenario: Gửi lại cùng mã nháp phiếu chuyển
- **WHEN** điện thoại của `vantung` gửi lại lần xác nhận `CCT-2026-004` cùng mã nháp sau khi phiếu đã ghi sổ
- **THEN** vẫn chỉ có một dòng Ghi sổ `CCT-2026-004`

#### Scenario: Lọc phiếu chuyển trên D18
- **WHEN** Giám đốc lọc D18 theo loại Phiếu chuyển công trình
- **THEN** bảng chỉ hiện các dòng có mã dạng `CCT-2026-004`

#### Scenario: Khác nhà thầu
- **WHEN** `quocbao` ghi sổ phiếu chuyển từ hợp đồng của Minh Phát sang hợp đồng của Phú Đạt đã tích xác nhận
- **THEN** dòng Ghi sổ gắn cờ "Có xác nhận bất thường"

### Requirement: Thao tác Gửi điện thoại và nhóm lọc
Thao tác mới "Gửi điện thoại" SHALL thuộc nhóm "Duyệt, ghi sổ" như "Gửi duyệt" và không tính vào ô Duyệt / ghi sổ. "Rút về" phiếu chuyển SHALL ghi là thao tác "Trả lại". "Trả lại", "Hủy", "Từ chối" SHALL thuộc nhóm "Trả lại, hủy, xóa".

#### Scenario: Gửi điện thoại
- **WHEN** `quocbao` gửi `CCT-2026-004` cho điện thoại xác nhận
- **THEN** có một dòng "Gửi điện thoại" `CCT-2026-004` **AND** ô Duyệt / ghi sổ trên D18 không tăng

#### Scenario: Lọc phiếu mua lại bị từ chối
- **WHEN** Giám đốc lọc D18 theo loại Phiếu mua lại và nhóm "Trả lại, hủy, xóa"
- **THEN** bảng chỉ hiện các dòng "Từ chối" có mã dạng `MLA-2026-003`
