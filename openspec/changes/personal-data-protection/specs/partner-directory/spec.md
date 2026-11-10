## MODIFIED Requirements

### Requirement: Thông tin nhà cung cấp
Nhà cung cấp SHALL có: loại (công ty / cá nhân), tên (bắt buộc), điện thoại, địa chỉ, mã số thuế (tùy chọn, công ty), **số CCCD** (tùy chọn, cá nhân, đúng 12 chữ số), **4 số cuối tài khoản** và tên ngân hàng (tùy chọn), ghi chú. Số tài khoản đầy đủ SHALL không được đưa vào phần mềm: ô tài khoản chỉ nhận đúng 4 chữ số. Người bán sắt vụn cá nhân SHALL tạo được chỉ với tên.

#### Scenario: Người bán sắt vụn
- **WHEN** Kinh doanh tạo nhà cung cấp cá nhân "Chú Ba ve chai" không có thông tin khác
- **THEN** nhà cung cấp được lưu với mã `NCC-xxxx`

#### Scenario: CCCD sai độ dài
- **WHEN** nhập CCCD `0012030123`
- **THEN** hệ thống từ chối với "Số CCCD gồm 12 chữ số"

#### Scenario: Nhập 4 số cuối
- **WHEN** nhập tài khoản `5678` tại Vietcombank
- **THEN** lưu 4 số cuối `5678`, ngân hàng Vietcombank

#### Scenario: Dán cả số tài khoản
- **WHEN** nhập `0451000312345678` vào ô tài khoản
- **THEN** hệ thống từ chối với "Chỉ nhập 4 số cuối của tài khoản" **AND** không lưu, không ghi số đó vào đâu

#### Scenario: Xác nhận trên form
- **WHEN** Kế toán mở form nhà cung cấp và nhập CCCD lần đầu
- **THEN** form hiện câu thông báo và ô xác nhận "Đã thông báo cho người bán"

### Requirement: Che số CCCD và số tài khoản
Số CCCD là dữ liệu cá nhân. Danh sách và màn chi tiết D16 SHALL chỉ hiện 4 số cuối CCCD (`•••• •••• 0123`) và tài khoản dạng `<ngân hàng> ···5678`. API đọc dùng chung (mọi vai trò) SHALL không trả số CCCD đầy đủ. Số CCCD đầy đủ SHALL chỉ có trong dữ liệu form sửa, cho người có quyền sửa đối tác (`DIRECTOR`, `SALES`, `ACCOUNTANT`). Số tài khoản đầy đủ SHALL không tồn tại trong hệ thống.

#### Scenario: Xem chi tiết người bán
- **WHEN** Kinh doanh xem nhà cung cấp cá nhân có CCCD `001203012345` ở D16
- **THEN** màn chi tiết và dòng danh sách hiện `•••• •••• 2345`, không hiện số đầy đủ

#### Scenario: API đọc chung không lộ số
- **WHEN** `vantung` (Thủ kho) gọi `GET /api/catalog/suppliers`
- **THEN** phần tử của người bán đó có số đã che `•••• •••• 2345` **AND** chuỗi `001203012345` không xuất hiện ở đâu trong phản hồi

#### Scenario: Form sửa có số đầy đủ
- **WHEN** Kế toán mở "Sửa thông tin" của người bán đó
- **THEN** ô CCCD điền sẵn `001203012345`

#### Scenario: Thủ kho không lấy được số đầy đủ
- **WHEN** `vantung` (Thủ kho) gọi `GET /api/catalog/suppliers/{id}/edit`
- **THEN** API trả 403

#### Scenario: Số tài khoản cũng bị che
- **WHEN** người bán có 4 số cuối `5678` tại Vietcombank và Kinh doanh xem ở D16
- **THEN** dòng Tài khoản hiện `Vietcombank ···5678`

#### Scenario: Có 4 số cuối, không có ngân hàng
- **WHEN** người bán có 4 số cuối `5678`, không có tên ngân hàng
- **THEN** dòng Tài khoản hiện `···5678`

#### Scenario: Không có CCCD
- **WHEN** nhà cung cấp không có CCCD
- **THEN** danh sách và chi tiết không hiện dòng CCCD
