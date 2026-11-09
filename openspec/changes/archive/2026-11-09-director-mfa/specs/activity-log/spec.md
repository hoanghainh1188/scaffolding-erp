## ADDED Requirements

### Requirement: Thao tác xác thực 2 lớp được ghi
Hệ thống SHALL ghi một dòng nhật ký, có cờ Dữ liệu nhạy cảm, cho: bật xác thực 2 lớp, đổi điện thoại, tạo lại mã dự phòng, tắt bằng lệnh cứu hộ, quên mọi thiết bị đã tin, và lần đăng nhập bằng mã dự phòng. Dòng đăng nhập bằng mã dự phòng SHALL thay cho dòng "Đăng nhập thành công" của lần đó, không ghi hai dòng. Nhập sai mã, và đăng nhập bằng mã 6 số ngoài dòng đăng nhập bình thường, SHALL không ghi thêm. Nhật ký SHALL không chứa bí mật, mã 6 số hay mã dự phòng.

#### Scenario: Bật 2 lớp
- **WHEN** `minhanh` bật xác thực 2 lớp thành công lúc 09:15
- **THEN** có một dòng "Bật xác thực 2 lớp" của `minhanh` lúc 09:15 có cờ Dữ liệu nhạy cảm

#### Scenario: Đăng nhập bằng mã dự phòng
- **WHEN** `minhanh` đăng nhập bằng một mã dự phòng lúc 07:41, còn lại 9 mã
- **THEN** có đúng một dòng đăng nhập lúc 07:41 "Đăng nhập bằng mã dự phòng, còn 9 mã" có cờ Dữ liệu nhạy cảm **AND** dòng đó không chứa mã

#### Scenario: Nhập sai mã
- **WHEN** `minhanh` nhập sai mã 2 lần rồi đăng nhập đúng bằng mã 6 số
- **THEN** chỉ có một dòng "Đăng nhập thành công"

#### Scenario: Quên thiết bị đã tin
- **WHEN** `thuha` bấm "Quên mọi thiết bị đã tin" lúc 10:20
- **THEN** có một dòng "Quên mọi thiết bị đã tin" của `thuha` lúc 10:20 có cờ Dữ liệu nhạy cảm

#### Scenario: Tắt bằng lệnh cứu hộ
- **WHEN** quản trị chạy lệnh tắt xác thực 2 lớp của `minhanh`
- **THEN** có một dòng "Tắt xác thực 2 lớp bằng lệnh cứu hộ" gắn với tài khoản `minhanh` có cờ Dữ liệu nhạy cảm

### Requirement: Lần tin thiết bị được ghi
Lần đăng nhập có chọn tin thiết bị SHALL ghi một dòng "Đăng nhập thành công, tin thiết bị 30 ngày" có cờ Dữ liệu nhạy cảm, thay cho dòng đăng nhập thường. Đăng nhập trên thiết bị đã tin SHALL ghi dòng "Đăng nhập thành công" như bình thường.

#### Scenario: Chọn tin thiết bị
- **WHEN** `thuha` đăng nhập đúng mã lúc 08:02 và chọn "Tin thiết bị này 30 ngày"
- **THEN** có đúng một dòng đăng nhập lúc 08:02 "Đăng nhập thành công, tin thiết bị 30 ngày" có cờ Dữ liệu nhạy cảm

#### Scenario: Đăng nhập trên máy đã tin
- **WHEN** `thuha` đăng nhập trên máy đã tin lúc 08:05
- **THEN** có đúng một dòng "Đăng nhập thành công", không có cờ Dữ liệu nhạy cảm

### Requirement: Thao tác của admin hệ thống được ghi
Hệ thống SHALL ghi một dòng nhật ký có cờ Dữ liệu nhạy cảm khi admin gỡ xác thực 2 lớp cho người khác và khi cờ Admin hệ thống được đặt hoặc gỡ.

#### Scenario: Admin gỡ cho người khác
- **WHEN** `quocbao` (có cờ) gỡ 2 lớp của `thuha` lúc 14:30
- **THEN** có một dòng "Gỡ xác thực 2 lớp của thuha" do `quocbao` làm lúc 14:30, có cờ Dữ liệu nhạy cảm

#### Scenario: Đặt cờ Admin hệ thống
- **WHEN** quản trị chạy lệnh đặt cờ cho `quocbao` lúc 16:00
- **THEN** có một dòng "Đặt cờ Admin hệ thống" gắn với tài khoản `quocbao` lúc 16:00, có cờ Dữ liệu nhạy cảm
