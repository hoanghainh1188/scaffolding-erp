# Spec Delta

## ADDED Requirements

### Requirement: Thao tác trên phiếu xuất được ghi
Mỗi lệnh làm đổi phiếu xuất (Tạo, Sửa, Bắt đầu nhặt, Trả lại, Hủy, Ghi sổ) SHALL ghi đúng một dòng nhật ký. Lọc theo loại chứng từ trên D18 SHALL có Phiếu xuất.

#### Scenario: Gửi lại cùng mã nháp phiếu xuất
- **WHEN** điện thoại của `vantung` gửi lại lần xác nhận `PX-2026-140` cùng mã nháp sau khi phiếu đã ghi sổ
- **THEN** vẫn chỉ có một dòng Ghi sổ `PX-2026-140`

#### Scenario: Lọc phiếu xuất trên D18
- **WHEN** Giám đốc lọc D18 theo loại Phiếu xuất
- **THEN** bảng chỉ hiện các dòng có mã dạng `PX-2026-140`, gồm cả thao tác "Bắt đầu nhặt"
