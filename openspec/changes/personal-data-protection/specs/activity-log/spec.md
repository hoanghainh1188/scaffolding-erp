## MODIFIED Requirements

### Requirement: Che dữ liệu nhạy cảm
Nhật ký SHALL chỉ lưu CCCD và 4 số cuối tài khoản ở dạng đã che (`•••• •••• 2345`, `•••• 5678`), cả trong tóm tắt và trường đổi. Mật khẩu, mật khẩu tạm, mã phiên đăng nhập SHALL không bao giờ vào nhật ký, kể cả dạng đã che. Xuất Excel SHALL dùng đúng giá trị đã che.

#### Scenario: Số tài khoản bị che
- **WHEN** `ducthang` đổi 4 số cuối tài khoản `NCC-0004` từ `1234` thành `5678`
- **THEN** dòng Sửa có trường "Số tài khoản" `•••• 1234` → `•••• 5678`

#### Scenario: Đổi CCCD
- **WHEN** `ducthang` đổi CCCD `NCC-0004` từ `001203011111` thành `001203012345`
- **THEN** dòng Sửa có trường "Số CCCD" `•••• •••• 1111` → `•••• •••• 2345` **AND** chuỗi `001203012345` và bản mã không có ở bất kỳ cột nào của dòng

#### Scenario: Đặt lại mật khẩu không lộ mật khẩu tạm
- **WHEN** Giám đốc đặt lại mật khẩu cho `thuha` và hệ thống tạo mật khẩu tạm
- **THEN** dòng Sửa ghi "Đặt lại mật khẩu cho thuha" **AND** mật khẩu tạm không có trong dòng nhật ký

## ADDED Requirements

### Requirement: Người bán cá nhân ghi bằng mã trong bảng chỉ ghi thêm
Với người bán cá nhân, nhật ký và mô tả dòng sổ kho SHALL ghi mã NCC thay cho tên thật. Khi sửa người bán cá nhân, trường tên, điện thoại, địa chỉ, mã số thuế, ghi chú SHALL chỉ ghi "(đã đổi)", không ghi giá trị; các trường này SHALL không làm dòng mang cờ "Dữ liệu nhạy cảm". Người bán là công ty SHALL giữ nguyên cách ghi tên.

#### Scenario: Đơn mua của người bán cá nhân
- **WHEN** tạo đơn cho `NCC-0004` "Anh Lê Văn Tâm" (cá nhân) 2 mã hàng 26.500.000 ₫
- **THEN** dòng Tạo ghi "NCC-0004 · 2 mã hàng · 26.500.000 ₫" **AND** chuỗi "Lê Văn Tâm" không có ở bất kỳ cột nào của dòng

#### Scenario: Đơn mua của công ty
- **WHEN** tạo đơn cho "Hòa Phát mẫu" (công ty) 5 mã hàng 52.942.500 ₫
- **THEN** dòng Tạo ghi "Hòa Phát mẫu · 5 mã hàng · 52.942.500 ₫"

#### Scenario: Phiếu chi cho người bán cá nhân
- **WHEN** ghi phiếu chi Trả tiền hàng 20.000.000 ₫ cho `NCC-0004`
- **THEN** dòng nhật ký bắt đầu bằng "NCC-0004 · Trả tiền hàng 20.000.000 ₫" **AND** không có tên thật

#### Scenario: Dòng sổ kho khi nhập hàng
- **WHEN** nhập chuyến 1 của `PO-2026-052` từ `NCC-0004` (cá nhân)
- **THEN** mô tả dòng sổ là "Nhập từ PO-2026-052 · NCC-0004 · chuyến 1"

#### Scenario: Sửa điện thoại người bán cá nhân
- **WHEN** Kế toán đổi điện thoại `NCC-0004` lúc 10:00
- **THEN** dòng Sửa có trường "Điện thoại" với giá trị "(đã đổi)" **AND** số điện thoại cũ và mới không có ở bất kỳ cột nào **AND** dòng không có cờ nào

#### Scenario: Tạo người bán cá nhân
- **WHEN** Kinh doanh tạo "Chú Ba ve chai" được mã `NCC-0012`
- **THEN** dòng Tạo có tóm tắt `NCC-0012`, không có tên
