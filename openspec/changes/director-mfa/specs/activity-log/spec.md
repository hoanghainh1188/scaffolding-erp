## ADDED Requirements

### Requirement: Thao tác xác thực 2 lớp được ghi
Hệ thống SHALL ghi một dòng nhật ký, có cờ Dữ liệu nhạy cảm, cho: bật xác thực 2 lớp, đổi điện thoại, tạo lại mã dự phòng, tắt bằng lệnh cứu hộ, và lần đăng nhập bằng mã dự phòng. Dòng đăng nhập bằng mã dự phòng SHALL thay cho dòng "Đăng nhập thành công" của lần đó, không ghi hai dòng. Nhập sai mã, và đăng nhập bằng mã 6 số ngoài dòng đăng nhập bình thường, SHALL không ghi thêm. Nhật ký SHALL không chứa bí mật, mã 6 số hay mã dự phòng.

#### Scenario: Bật 2 lớp
- **WHEN** `minhanh` bật xác thực 2 lớp thành công lúc 09:15
- **THEN** có một dòng "Bật xác thực 2 lớp" của `minhanh` lúc 09:15 có cờ Dữ liệu nhạy cảm

#### Scenario: Đăng nhập bằng mã dự phòng
- **WHEN** `minhanh` đăng nhập bằng một mã dự phòng lúc 07:41, còn lại 9 mã
- **THEN** có đúng một dòng đăng nhập lúc 07:41 "Đăng nhập bằng mã dự phòng, còn 9 mã" có cờ Dữ liệu nhạy cảm **AND** dòng đó không chứa mã

#### Scenario: Nhập sai mã
- **WHEN** `minhanh` nhập sai mã 2 lần rồi đăng nhập đúng bằng mã 6 số
- **THEN** chỉ có một dòng "Đăng nhập thành công"

#### Scenario: Tắt bằng lệnh cứu hộ
- **WHEN** quản trị chạy lệnh tắt xác thực 2 lớp của `minhanh`
- **THEN** có một dòng "Tắt xác thực 2 lớp bằng lệnh cứu hộ" gắn với tài khoản `minhanh` có cờ Dữ liệu nhạy cảm
