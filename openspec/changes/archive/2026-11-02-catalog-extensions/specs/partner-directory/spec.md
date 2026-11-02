## ADDED Requirements

### Requirement: Nhân viên phụ trách nhà thầu
Nhà thầu MAY có một **nhân viên phụ trách**: một tài khoản vai trò Kinh doanh hoặc Giám đốc đang hoạt động. Người có quyền sửa đối tác SHALL đặt, đổi, bỏ được người phụ trách; mỗi lần đổi ghi nhật ký. Tài khoản bị khóa sau đó vẫn hiện là người phụ trách, kèm chữ "(đã khóa)", cho đến khi có người đổi.

#### Scenario: Gán người phụ trách
- **WHEN** Kế toán đặt người phụ trách của `NT-0001` là `luong` (Kinh doanh)
- **THEN** `NT-0001` lưu người phụ trách `luong` **AND** nhật ký ghi "Sửa nhà thầu NT-0001: nhân viên phụ trách – → Lương"

#### Scenario: Chọn tài khoản không phải Kinh doanh
- **WHEN** gửi yêu cầu đặt người phụ trách của `NT-0001` là `vantung` (Thủ kho)
- **THEN** hệ thống từ chối với "Người phụ trách phải là tài khoản Kinh doanh hoặc Giám đốc đang hoạt động"

#### Scenario: Người phụ trách bị khóa
- **WHEN** `luong` phụ trách `NT-0001` và Giám đốc khóa tài khoản `luong`
- **THEN** D16 hiện người phụ trách của `NT-0001` là "Lương (đã khóa)" **AND** form sửa không cho chọn lại `luong` cho nhà thầu khác

#### Scenario: Thủ kho thử đổi người phụ trách
- **WHEN** `vantung` (Thủ kho) gửi `PATCH /api/catalog/customers/{id}` kèm người phụ trách mới
- **THEN** API trả 403 và nhà thầu không đổi

### Requirement: Không giới hạn quyền xem theo người phụ trách
Người phụ trách SHALL chỉ là thông tin để lọc và báo cáo. Mọi người có quyền đọc danh mục SHALL vẫn thấy mọi nhà thầu, kể cả nhà thầu do người khác phụ trách.

#### Scenario: Kinh doanh xem khách của người khác
- **WHEN** `yen` (Kinh doanh) mở D16 khi `NT-0001` do `luong` phụ trách
- **THEN** `yen` thấy và mở được chi tiết `NT-0001`

### Requirement: Lọc nhà thầu theo người phụ trách ở D16
Tab Nhà thầu ở D16 SHALL hiện người phụ trách ở dòng danh sách và ở chi tiết, và lọc được theo một người phụ trách hoặc "Chưa có người phụ trách". Bộ lọc SHALL nằm trên URL.

#### Scenario: Lọc khách của Lương
- **WHEN** có 5 nhà thầu do `luong` phụ trách, 3 do `yen`, 2 chưa có, người dùng chọn "Lương"
- **THEN** danh sách còn 5 nhà thầu **AND** URL có `?sales=<id của luong>`

#### Scenario: Lọc khách chưa có người phụ trách
- **WHEN** người dùng chọn "Chưa có người phụ trách" với dữ liệu như trên
- **THEN** danh sách còn 2 nhà thầu **AND** URL có `?sales=none`
