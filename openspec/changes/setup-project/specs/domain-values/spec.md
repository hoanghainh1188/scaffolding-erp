# Spec Delta: domain-values

## Purpose

Quy tắc chung để biểu diễn, đọc và hiển thị các giá trị nghiệp vụ — tiền VND, số lượng, ngày nghiệp vụ, tình trạng hàng, vai trò — để mọi phân hệ tính và hiển thị giống nhau, không sai số.

## ADDED Requirements

### Requirement: Tiền là số nguyên VND
Mọi số tiền SHALL là số nguyên đồng VND, không có phần lẻ. Hệ thống SHALL từ chối giá trị tiền có phần thập phân hoặc vượt giới hạn số nguyên an toàn, thay vì làm tròn ngầm. Tiền được phép âm (dùng cho dòng điều chỉnh).

#### Scenario: Từ chối tiền có phần lẻ
- **WHEN** một phép ghi nhận số tiền 1250000,5
- **THEN** hệ thống báo lỗi "Số tiền phải là số nguyên" và không ghi nhận

#### Scenario: Tiền bằng 0
- **WHEN** ghi nhận số tiền 0
- **THEN** hệ thống chấp nhận và hiển thị "0 ₫"

#### Scenario: Tiền âm cho điều chỉnh
- **WHEN** ghi nhận số tiền −50000
- **THEN** hệ thống chấp nhận và hiển thị "-50.000 ₫"

### Requirement: Hiển thị và đọc tiền theo kiểu Việt Nam
Hệ thống SHALL hiển thị tiền với dấu chấm ngăn cách hàng nghìn và ký hiệu "₫" ở cuối. Ô nhập tiền SHALL đọc được chuỗi có hoặc không có dấu chấm ngăn cách và có thể kèm "₫" hoặc khoảng trắng.

#### Scenario: Hiển thị tiền
- **WHEN** hiển thị số tiền 1250000
- **THEN** chuỗi hiển thị là "1.250.000 ₫"

#### Scenario: Đọc tiền người dùng gõ
- **WHEN** người dùng gõ "1.250.000" hoặc "1250000" hoặc "1.250.000 ₫"
- **THEN** hệ thống đọc ra cùng số tiền 1250000

#### Scenario: Đọc chuỗi tiền sai
- **WHEN** người dùng gõ "12a00"
- **THEN** hệ thống báo lỗi "Số tiền không hợp lệ"

### Requirement: Số lượng tối đa 3 chữ số thập phân, cộng trừ không sai số
Số lượng SHALL có tối đa 3 chữ số thập phân (để chứa kg) và giá trị tuyệt đối không vượt 99.999.999.999,999. Phép cộng, trừ số lượng SHALL cho kết quả chính xác, không có sai số dấu phẩy động.

#### Scenario: Cộng số lẻ chính xác
- **WHEN** cộng 0,1 kg với 0,2 kg
- **THEN** kết quả đúng bằng 0,3 kg

#### Scenario: Từ chối quá 3 chữ số thập phân
- **WHEN** nhập số lượng "1,2345"
- **THEN** hệ thống báo lỗi "Số lượng tối đa 3 chữ số thập phân"

#### Scenario: Số lượng 0
- **WHEN** nhập số lượng "0"
- **THEN** hệ thống chấp nhận số lượng 0

### Requirement: Hiển thị và đọc số lượng theo kiểu Việt Nam
Hệ thống SHALL hiển thị số lượng với dấu chấm ngăn cách hàng nghìn, dấu phẩy thập phân và bỏ số 0 thừa ở cuối. Ô nhập số lượng SHALL không dùng dấu ngăn cách hàng nghìn; dấu phẩy hoặc dấu chấm đều được hiểu là dấu thập phân.

#### Scenario: Hiển thị số lượng lẻ
- **WHEN** hiển thị số lượng 1234,500
- **THEN** chuỗi hiển thị là "1.234,5"

#### Scenario: Hiển thị số lượng chẵn
- **WHEN** hiển thị số lượng 80
- **THEN** chuỗi hiển thị là "80"

#### Scenario: Đọc số lượng gõ bằng dấu chấm
- **WHEN** thủ kho gõ "250.5" trên bàn phím số của điện thoại
- **THEN** hệ thống đọc ra 250,5

#### Scenario: Dấu chấm trong ô số lượng là dấu thập phân
- **WHEN** thủ kho gõ "1.234"
- **THEN** hệ thống đọc ra 1,234 (không phải 1234)

### Requirement: Ngày nghiệp vụ theo giờ Việt Nam
Thời điểm SHALL được lưu theo UTC. "Ngày" nghiệp vụ của một thời điểm SHALL là ngày lịch tại múi giờ Asia/Ho_Chi_Minh (UTC+7). Ngày hiển thị dạng "dd/MM/yyyy", thời điểm hiển thị dạng "dd/MM/yyyy HH:mm" theo giờ Việt Nam.

#### Scenario: Nửa đêm giờ Việt Nam
- **WHEN** một phiếu được ghi lúc 2026-10-26T17:00:00Z
- **THEN** ngày nghiệp vụ của phiếu là 27/10/2026 và thời điểm hiển thị là "27/10/2026 00:00"

#### Scenario: Ngay trước nửa đêm
- **WHEN** một phiếu được ghi lúc 2026-10-26T16:59:59Z
- **THEN** ngày nghiệp vụ của phiếu là 26/10/2026

### Requirement: Danh sách tình trạng hàng
Hệ thống SHALL có đúng 4 tình trạng hàng `NEW`, `GOOD`, `NEEDS_REPAIR`, `SCRAP` với tên tiếng Việt "Mới", "Tốt", "Chờ sửa", "Phế liệu". Chỉ `NEW` và `GOOD` SHALL được coi là xuất bán/cho thuê được.

#### Scenario: Kiểm tra tình trạng xuất được
- **WHEN** hỏi tình trạng nào được xuất bán/cho thuê
- **THEN** kết quả là `NEW` và `GOOD`
- **AND** `NEEDS_REPAIR`, `SCRAP` bị coi là không xuất được

### Requirement: Danh sách vai trò
Hệ thống SHALL có đúng 5 vai trò `DIRECTOR`, `ACCOUNTANT`, `SALES`, `WAREHOUSE`, `WORKSHOP` với tên tiếng Việt "Giám đốc", "Kế toán", "Kinh doanh", "Thủ kho", "Xưởng". `WAREHOUSE` và `WORKSHOP` SHALL được coi là vai trò dùng giao diện Mobile; ba vai trò còn lại dùng giao diện Desktop.

#### Scenario: Vai trò không hợp lệ
- **WHEN** cấu hình nhận vai trò "ADMIN"
- **THEN** hệ thống báo lỗi vai trò không hợp lệ và liệt kê 5 vai trò cho phép

#### Scenario: Giao diện mặc định theo vai trò
- **WHEN** hỏi giao diện mặc định của vai trò `WAREHOUSE`
- **THEN** kết quả là Mobile
