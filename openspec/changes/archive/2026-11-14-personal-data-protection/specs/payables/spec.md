## MODIFIED Requirements

### Requirement: Che CCCD và số tài khoản trên D14c
D14c, form ghi phiếu chi, API của D14c và file Excel phải trả SHALL chỉ có CCCD dạng che như D16 (`•••• •••• 2345`) và tài khoản dạng `<ngân hàng> ···5678`; số CCCD đầy đủ SHALL không có trong phản hồi hay file. File Excel SHALL có một cột "Tài khoản" thay cho hai cột số tài khoản và ngân hàng.

#### Scenario: Người bán cá nhân có CCCD
- **WHEN** Anh Tâm có CCCD `001203012345`, 4 số cuối tài khoản `5678` tại Vietcombank, và `thuha` mở Anh Tâm trên D14c
- **THEN** màn hiện `Vietcombank ···5678` **AND** chuỗi `001203012345` không có trong phản hồi `GET /api/payables/suppliers/{id}`

#### Scenario: Form ghi phiếu chi
- **WHEN** `thuha` mở form ghi phiếu chi của Anh Tâm
- **THEN** form hiện `Chuyển vào: Vietcombank ···5678`

#### Scenario: Cột tài khoản trong Excel
- **WHEN** `thuha` xuất Excel phải trả có Anh Tâm
- **THEN** sheet "Theo người bán" có cột "Tài khoản" giá trị `Vietcombank ···5678` và cột CCCD `•••• •••• 2345`
