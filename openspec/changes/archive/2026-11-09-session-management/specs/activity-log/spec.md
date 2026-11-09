# Spec Delta

## ADDED Requirements

### Requirement: Đăng xuất từ xa được ghi
Hệ thống SHALL ghi một dòng nhật ký, có cờ Dữ liệu nhạy cảm, cho mỗi lần đăng xuất một máy khác, đăng xuất mọi máy khác, và Giám đốc đăng xuất mọi máy của nhân viên, trong cùng giao dịch với thao tác. Lần không kết thúc phiên nào và không quên máy đã tin nào SHALL không ghi. Có quên máy đã tin thì vẫn một dòng, thêm đuôi ", quên k máy đã tin". Nhật ký SHALL không chứa token, địa chỉ IP hay chuỗi User-Agent gốc.

#### Scenario: Đăng xuất một máy khác
- **WHEN** `thuha` đăng xuất máy "Điện thoại · Chrome" của mình lúc 10:20
- **THEN** có một dòng "Đăng xuất máy khác: Điện thoại · Chrome" của `thuha` lúc 10:20 có cờ Dữ liệu nhạy cảm

#### Scenario: Đăng xuất mọi máy khác
- **WHEN** `minhanh` đăng xuất 3 máy khác lúc 11:00
- **THEN** có đúng một dòng "Đăng xuất 3 máy khác" của `minhanh` lúc 11:00 có cờ Dữ liệu nhạy cảm

#### Scenario: Giám đốc đăng xuất mọi máy của nhân viên
- **WHEN** `minhanh` (Giám đốc) đăng xuất 2 máy của `vantung` lúc 14:30
- **THEN** có một dòng "Đăng xuất mọi máy của vantung (2 máy)" do `minhanh` làm lúc 14:30, gắn với tài khoản `vantung`, có cờ Dữ liệu nhạy cảm

#### Scenario: Có quên máy đã tin
- **WHEN** `minhanh` đăng xuất 3 máy khác và có 2 máy đã tin, lúc 11:00
- **THEN** có đúng một dòng "Đăng xuất 3 máy khác, quên 2 máy đã tin"

#### Scenario: Giám đốc đăng xuất và quên máy đã tin
- **WHEN** `minhanh` (Giám đốc) đăng xuất 2 máy của `vantung` có 1 máy đã tin
- **THEN** có đúng một dòng "Đăng xuất mọi máy của vantung (2 máy), quên 1 máy đã tin"

#### Scenario: Không còn phiên nhưng còn máy đã tin
- **WHEN** Giám đốc đăng xuất mọi máy của `thuha` khi `thuha` không có phiên nào và có 1 máy đã tin
- **THEN** có đúng một dòng "Đăng xuất mọi máy của thuha (0 máy), quên 1 máy đã tin"

#### Scenario: Không có máy nào bị đăng xuất
- **WHEN** Giám đốc đăng xuất mọi máy của `ngoclam` khi `ngoclam` không có phiên nào và không có máy đã tin nào
- **THEN** nhật ký không có dòng mới

#### Scenario: Tự đăng xuất khi không còn máy khác
- **WHEN** `thuha` đăng xuất mọi máy khác khi chỉ có một máy và còn 1 máy đã tin
- **THEN** máy đã tin vẫn còn **AND** nhật ký không có dòng mới

## MODIFIED Requirements

### Requirement: Thao tác trên danh mục, người dùng và đăng nhập được ghi
Hệ thống SHALL ghi một dòng cho: tạo, sửa (cả ngừng dùng, dùng lại), xóa vật tư, nhóm hàng, bộ, nhà cung cấp, nhà thầu, công trình, kho/bãi/xưởng; tạo người dùng, đổi vai trò, khóa, mở khóa, đặt lại mật khẩu, tự đổi mật khẩu; sửa giá sắt vụn; mỗi lần đăng nhập thành công. Đăng nhập sai, đăng xuất chính máy đang dùng, xem trang SHALL không ghi.

#### Scenario: Đăng nhập thành công và sai
- **WHEN** `vantung` nhập sai mật khẩu lúc 07:40 rồi đăng nhập đúng lúc 07:41
- **THEN** chỉ có một dòng Đăng nhập lúc 07:41 "Đăng nhập thành công", không có mã chứng từ

#### Scenario: Sửa giá sắt vụn
- **WHEN** Giám đốc đổi giá sắt vụn từ 7.500 ₫/kg thành 7.800 ₫/kg
- **THEN** có một dòng Sửa loại Giá sắt vụn với trường "Giá sắt vụn" 7.500 ₫/kg → 7.800 ₫/kg

#### Scenario: Đăng xuất máy đang dùng
- **WHEN** `thuha` bấm "Đăng xuất" ở menu người dùng lúc 17:00
- **THEN** nhật ký không có dòng mới
