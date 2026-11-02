## MODIFIED Requirements

### Requirement: Tab Công trình và Kho, bãi, xưởng ở D16
D16 SHALL có tab Công trình (tên, mã, địa chỉ, tỉnh/thành, khu vực, nhà thầu) và tab Kho, bãi, xưởng (mã, tên, loại), mỗi tab kèm số lượng đang dùng. Chi tiết nhà thầu SHALL có nút "Thêm công trình" tạo công trình cho chính nhà thầu đó.

#### Scenario: Thêm công trình từ nhà thầu
- **WHEN** Kinh doanh đang xem `NT-0001` và bấm "Thêm công trình"
- **THEN** form công trình mở với nhà thầu đã chọn sẵn `NT-0001`, không đổi được

#### Scenario: Đếm tab
- **WHEN** có 9 công trình đang dùng, 1 đã ngừng dùng, và 1 bãi + 1 xưởng
- **THEN** tab hiện "Công trình · 9" và "Kho, bãi, xưởng · 2"

#### Scenario: Cột tỉnh và khu vực
- **WHEN** công trình `CT-0001` ở tỉnh "Bắc Ninh"
- **THEN** dòng `CT-0001` ở tab Công trình hiện "Bắc Ninh" và khu vực "Miền Bắc"

## ADDED Requirements

### Requirement: Tỉnh/thành của công trình
Công trình SHALL có **tỉnh/thành** chọn từ danh sách 34 tỉnh/thành hiện hành; bắt buộc khi tạo công trình và khi sửa công trình. Công trình tạo trước change này MAY chưa có tỉnh cho đến lần sửa đầu tiên. Đổi tỉnh SHALL ghi nhật ký.

#### Scenario: Tạo công trình có tỉnh
- **WHEN** Kinh doanh tạo công trình "Nhà xưởng Long Hậu", tỉnh "Tây Ninh", nhà thầu `NT-0002`
- **THEN** công trình được lưu với tỉnh "Tây Ninh"

#### Scenario: Thiếu tỉnh
- **WHEN** tạo công trình không chọn tỉnh
- **THEN** hệ thống từ chối với "Chọn tỉnh/thành của công trình"

#### Scenario: Tỉnh không có trong danh sách
- **WHEN** gửi yêu cầu tạo công trình với tỉnh "Bà Rịa - Vũng Tàu" (đã sáp nhập vào TP. Hồ Chí Minh)
- **THEN** hệ thống từ chối với "Tỉnh/thành không hợp lệ"

#### Scenario: Công trình cũ chưa có tỉnh
- **WHEN** chạy migration trên DB đã có công trình `CT-0001`
- **THEN** `CT-0001` vẫn dùng được, cột tỉnh hiện "Chưa chọn" **AND** lần sửa tiếp theo của `CT-0001` bắt buộc chọn tỉnh

### Requirement: Khu vực suy ra từ tỉnh
Khu vực của công trình SHALL là **Miền Bắc**, **Miền Trung** hoặc **Miền Nam**, suy ra từ tỉnh/thành theo bảng cố định, không nhập riêng. Công trình chưa có tỉnh SHALL có khu vực "Chưa rõ".

#### Scenario: Ba miền
- **WHEN** ba công trình ở "Hà Nội", "Đà Nẵng" và "TP. Hồ Chí Minh"
- **THEN** khu vực lần lượt là Miền Bắc, Miền Trung và Miền Nam

#### Scenario: Tỉnh Tây Nguyên
- **WHEN** công trình ở "Gia Lai" hoặc "Lâm Đồng"
- **THEN** khu vực là Miền Trung

### Requirement: Lọc công trình theo khu vực
Tab Công trình ở D16 SHALL lọc được theo khu vực (Miền Bắc, Miền Trung, Miền Nam, Chưa rõ) và theo tỉnh/thành trong khu vực đã chọn; đầu tab đếm số công trình đang dùng theo bộ lọc. Bộ lọc SHALL nằm trên URL. API danh sách công trình SHALL nhận cùng bộ lọc.

#### Scenario: Lọc Miền Nam
- **WHEN** có 6 công trình đang dùng ở Miền Nam, 2 ở Miền Bắc, 1 chưa có tỉnh, người dùng chọn "Miền Nam"
- **THEN** danh sách còn 6 công trình **AND** URL có `?region=SOUTH`

#### Scenario: Lọc theo tỉnh trong khu vực
- **WHEN** trong 6 công trình Miền Nam có 4 ở "TP. Hồ Chí Minh", người dùng chọn thêm tỉnh "TP. Hồ Chí Minh"
- **THEN** danh sách còn 4 công trình **AND** URL có `?region=SOUTH&province=HCM`

#### Scenario: Lọc công trình chưa có tỉnh
- **WHEN** người dùng chọn "Chưa rõ" với dữ liệu như trên
- **THEN** danh sách còn 1 công trình

#### Scenario: API lọc theo khu vực
- **WHEN** `vantung` (Thủ kho) gọi `GET /api/catalog/sites?region=NORTH`
- **THEN** API trả đúng 2 công trình Miền Bắc
