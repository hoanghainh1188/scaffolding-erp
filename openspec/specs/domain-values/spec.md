# domain-values Specification

## Purpose

Quy tắc chung để biểu diễn, đọc và hiển thị các giá trị nghiệp vụ — tiền VND, số lượng, ngày nghiệp vụ, tình trạng hàng, vai trò — để mọi phân hệ tính và hiển thị giống nhau, không sai số.

## Requirements

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

### Requirement: Số lượng gắn với đơn vị
Mỗi số lượng SHALL gắn với một đơn vị: `PIECE` ("cái") hoặc `KG` ("kg"). Số lượng đơn vị cái SHALL là số nguyên. Số lượng đơn vị kg SHALL có tối đa 3 chữ số thập phân. Giá trị tuyệt đối không vượt 99.999.999.999,999. Phép cộng, trừ chỉ làm giữa hai số lượng cùng đơn vị.

#### Scenario: Từ chối số lẻ với đơn vị cái
- **WHEN** nhập số lượng "12,5" với đơn vị cái
- **THEN** hệ thống báo lỗi "Số lượng cái phải là số nguyên"

#### Scenario: Nhận số lẻ với đơn vị kg
- **WHEN** nhập số lượng "250,5" với đơn vị kg
- **THEN** hệ thống chấp nhận 250,5 kg

#### Scenario: Từ chối quá 3 chữ số thập phân với kg
- **WHEN** nhập số lượng "1,2345" với đơn vị kg
- **THEN** hệ thống báo lỗi "Số lượng kg tối đa 3 chữ số thập phân"

#### Scenario: Số lượng 0
- **WHEN** nhập số lượng "0" với đơn vị cái
- **THEN** hệ thống chấp nhận số lượng 0 cái

#### Scenario: Cộng số lẻ chính xác
- **WHEN** cộng 0,1 kg với 0,2 kg
- **THEN** kết quả đúng bằng 0,3 kg, không có sai số dấu phẩy động

#### Scenario: Không cộng khác đơn vị
- **WHEN** cộng 10 cái với 2,5 kg
- **THEN** hệ thống báo lỗi khác đơn vị và không trả kết quả

### Requirement: Hiển thị số lượng theo kiểu Việt Nam
Hệ thống SHALL hiển thị số lượng với dấu chấm ngăn cách hàng nghìn, dấu phẩy thập phân và bỏ số 0 thừa ở cuối.

#### Scenario: Hiển thị số lượng lẻ
- **WHEN** hiển thị số lượng 1234,500 kg
- **THEN** chuỗi hiển thị là "1.234,5"

#### Scenario: Hiển thị số lượng chẵn
- **WHEN** hiển thị số lượng 80 cái
- **THEN** chuỗi hiển thị là "80"

### Requirement: Đọc số lượng người dùng gõ
Khi đọc chuỗi người dùng gõ, hệ thống SHALL không nhận dấu ngăn cách hàng nghìn; dấu phẩy hoặc dấu chấm đều là dấu thập phân. Chuỗi kg có dấu chấm, đúng 3 chữ số sau và không có dấu phẩy (VD "1.234") là chưa rõ và SHALL bị báo lỗi, trừ khi bắt đầu bằng "0.". Chuỗi có từ hai dấu chấm SHALL bị báo lỗi.

#### Scenario: Đọc số lượng kg gõ bằng dấu chấm
- **WHEN** thủ kho gõ "250.5" với đơn vị kg trên bàn phím số của điện thoại
- **THEN** hệ thống đọc ra 250,5 kg

#### Scenario: Chuỗi kg chưa rõ "1.234"
- **WHEN** thủ kho gõ "1.234" với đơn vị kg
- **THEN** hệ thống báo lỗi "Chưa rõ số này. Gõ 1234 hoặc 1,234" và không đọc ra giá trị nào

#### Scenario: Chuỗi kg chưa rõ "12.500"
- **WHEN** thủ kho gõ "12.500" với đơn vị kg
- **THEN** hệ thống báo lỗi "Chưa rõ số này. Gõ 1234 hoặc 1,234"

#### Scenario: Dấu chấm với ít hơn 3 chữ số sau là dấu thập phân
- **WHEN** thủ kho gõ "0.75" với đơn vị kg
- **THEN** hệ thống đọc ra 0,75 kg

#### Scenario: Chuỗi bắt đầu bằng "0." không bị coi là chưa rõ
- **WHEN** thủ kho gõ "0.500" với đơn vị kg
- **THEN** hệ thống đọc ra 0,5 kg

#### Scenario: Nhiều dấu chấm bị từ chối
- **WHEN** thủ kho gõ "1.234.567" với đơn vị kg
- **THEN** hệ thống báo lỗi "Số lượng không hợp lệ. Không dùng dấu chấm ngăn cách hàng nghìn" và không đọc ra giá trị nào

#### Scenario: Dấu phẩy với 3 chữ số sau là dấu thập phân
- **WHEN** thủ kho gõ "1,234" với đơn vị kg
- **THEN** hệ thống đọc ra 1,234 kg

#### Scenario: Dấu chấm với đơn vị cái không bị hiểu thành hàng nghìn
- **WHEN** thủ kho gõ "1.234" với đơn vị cái
- **THEN** hệ thống báo lỗi "Số lượng cái phải là số nguyên", không tự hiểu thành 1234

### Requirement: Dạng sửa của tiền và số lượng
Hệ thống SHALL có dạng sửa cho tiền và số lượng — chuỗi đưa vào ô nhập khi người dùng đang sửa: không có dấu ngăn cách hàng nghìn, không có ký hiệu "₫", số lượng dùng dấu phẩy thập phân. Đọc lại dạng sửa SHALL cho đúng giá trị ban đầu.

#### Scenario: Dạng sửa của tiền
- **WHEN** lấy dạng sửa của số tiền 1250000
- **THEN** chuỗi là "1250000"

#### Scenario: Dạng sửa của số lượng kg
- **WHEN** lấy dạng sửa của số lượng 1234,5 kg
- **THEN** chuỗi là "1234,5" và đọc lại chuỗi đó được 1234,5 kg

#### Scenario: Dạng sửa của số lượng 0
- **WHEN** lấy dạng sửa của số lượng 0 cái
- **THEN** chuỗi là "0"

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

### Requirement: Trạng thái chứng từ lưu và trạng thái hiển thị
Trạng thái chứng từ lưu trong DB SHALL chỉ gồm `DRAFT`, `PENDING_APPROVAL`, `IN_PROGRESS`, `DONE`. `OVERDUE` ("Quá hạn") SHALL chỉ là trạng thái hiển thị, tính ra từ ngày đến hạn, không bao giờ được lưu. Quy tắc tính Quá hạn thuộc change `receivables`.

#### Scenario: Danh sách trạng thái được lưu
- **WHEN** hỏi các trạng thái chứng từ được phép lưu
- **THEN** kết quả là `DRAFT`, `PENDING_APPROVAL`, `IN_PROGRESS`, `DONE`, không có `OVERDUE`

#### Scenario: Từ chối lưu Quá hạn
- **WHEN** một phép ghi cố lưu trạng thái chứng từ `OVERDUE`
- **THEN** hệ thống báo lỗi "Quá hạn là trạng thái tính ra, không được lưu"
