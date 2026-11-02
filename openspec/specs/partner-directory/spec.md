# partner-directory Specification

## Purpose
Danh sách đối tác của công ty: nhà thầu (khách thuê, mua hàng) với hạn thanh toán mặc định, và nhà cung cấp (công ty hoặc cá nhân bán hàng cũ, sắt vụn) mà đơn mua sau này tham chiếu.

## Requirements

### Requirement: Mã đối tác tự sinh
Hệ thống SHALL tự sinh mã khi tạo đối tác: nhà thầu `NT-0001`, `NT-0002`...; nhà cung cấp `NCC-0001`... theo thứ tự tạo, không dùng lại số đã cấp (kể cả bản ghi đã xóa). Mã SHALL không sửa được. Người dùng không phải gõ mã.

#### Scenario: Nhà thầu đầu tiên
- **WHEN** Kinh doanh tạo nhà thầu "Cty TNHH Xây dựng Minh Phát" trên danh mục trống
- **THEN** nhà thầu có mã `NT-0001`

#### Scenario: Không dùng lại số
- **WHEN** có `NT-0001`, `NT-0002`, người dùng xóa `NT-0002` (chưa dùng) rồi tạo nhà thầu mới
- **THEN** nhà thầu mới có mã `NT-0003`

#### Scenario: Hai người tạo cùng lúc
- **WHEN** hai người tạo nhà thầu cùng lúc
- **THEN** hai nhà thầu nhận hai mã khác nhau

### Requirement: Thông tin nhà thầu
Nhà thầu SHALL có: loại (công ty / cá nhân), tên (1–200 ký tự, bắt buộc), mã số thuế (tùy chọn, 10 hoặc 13 chữ số dạng `0109876543` hoặc `0109876543-001`), người liên hệ, điện thoại, địa chỉ, ghi chú, và **hạn thanh toán mặc định** (số ngày nguyên 0–365, mặc định 30). Hợp đồng sau này SHALL lấy hạn này làm mặc định.

#### Scenario: Tạo nhà thầu công ty
- **WHEN** Kinh doanh tạo nhà thầu công ty "Cty TNHH Xây dựng Minh Phát", MST `0109876543`, liên hệ "Anh Đỗ Mạnh · chỉ huy trưởng", điện thoại `0912 345 678`, không nhập hạn thanh toán
- **THEN** nhà thầu được lưu với hạn thanh toán mặc định 30 ngày và điện thoại `0912345678`

#### Scenario: Cai thầu cá nhân không có MST
- **WHEN** tạo nhà thầu cá nhân "Anh Trần Văn Hùng (cai thầu)" chỉ có tên và điện thoại
- **THEN** nhà thầu được lưu

#### Scenario: Mã số thuế sai
- **WHEN** nhập MST `01098765`
- **THEN** hệ thống từ chối với "Mã số thuế gồm 10 chữ số, hoặc 10 chữ số kèm -XXX cho chi nhánh"

#### Scenario: Hạn thanh toán ngoài khoảng
- **WHEN** nhập hạn thanh toán 400 ngày hoặc -1
- **THEN** hệ thống từ chối với "Hạn thanh toán từ 0 đến 365 ngày"

#### Scenario: Đổi hạn không ảnh hưởng hợp đồng cũ
- **WHEN** đổi hạn mặc định của `NT-0001` từ 30 thành 45 ngày
- **THEN** chỉ hợp đồng tạo sau đó lấy 45 ngày làm mặc định

### Requirement: Số điện thoại
Điện thoại (nhà thầu, nhà cung cấp) SHALL được lưu dạng chỉ có số, bỏ khoảng trắng, dấu chấm, gạch ngang; chấp nhận 10 chữ số bắt đầu bằng `0`, hoặc `+84` theo sau 9 chữ số (lưu thành `0` + 9 chữ số). Hiển thị theo nhóm `0912 345 678`.

#### Scenario: Gõ có dấu chấm
- **WHEN** nhập `0912.345.678`
- **THEN** lưu `0912345678` và hiện `0912 345 678`

#### Scenario: Số quốc tế
- **WHEN** nhập `+84 912 345 678`
- **THEN** lưu `0912345678`

#### Scenario: Thiếu số
- **WHEN** nhập `091234567`
- **THEN** hệ thống từ chối với "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0"

### Requirement: Thông tin nhà cung cấp
Nhà cung cấp SHALL có: loại (công ty / cá nhân), tên (bắt buộc), điện thoại, địa chỉ, mã số thuế (tùy chọn, công ty), **số CCCD** (tùy chọn, cá nhân, đúng 12 chữ số), số tài khoản và tên ngân hàng (tùy chọn), ghi chú. Người bán sắt vụn cá nhân SHALL tạo được chỉ với tên.

#### Scenario: Người bán sắt vụn
- **WHEN** Kinh doanh tạo nhà cung cấp cá nhân "Chú Ba ve chai" không có thông tin khác
- **THEN** nhà cung cấp được lưu với mã `NCC-xxxx`

#### Scenario: CCCD sai độ dài
- **WHEN** nhập CCCD `0012030123`
- **THEN** hệ thống từ chối với "Số CCCD gồm 12 chữ số"

### Requirement: Che số CCCD và số tài khoản
Số CCCD và số tài khoản ngân hàng là dữ liệu cá nhân. Danh sách và màn chi tiết D16 SHALL chỉ hiện 4 số cuối (`•••• •••• 0123` cho CCCD, `•••• 5678` cho tài khoản). API đọc dùng chung (mọi vai trò) SHALL không trả số đầy đủ. Số đầy đủ SHALL chỉ có trong dữ liệu form sửa, cho người có quyền sửa đối tác (`DIRECTOR`, `SALES`, `ACCOUNTANT`).

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
- **WHEN** người bán có tài khoản `0451000312345678` tại Vietcombank và `vantung` (Thủ kho) gọi `GET /api/catalog/suppliers`
- **THEN** phản hồi có `•••• 5678` **AND** chuỗi `0451000312345678` không xuất hiện; form sửa của Kế toán vẫn điền số đầy đủ

#### Scenario: Không có CCCD
- **WHEN** nhà cung cấp không có CCCD
- **THEN** danh sách và chi tiết không hiện dòng CCCD

### Requirement: Danh sách đối tác D16
D16 SHALL có tab Nhà thầu và Nhà cung cấp, mỗi tab kèm số lượng đang dùng; danh sách bên trái tìm được theo tên, mã, điện thoại hoặc MST (không phân biệt dấu); chọn một đối tác thì bên phải hiện chi tiết. Tab đang chọn, từ khóa và đối tác đang chọn SHALL nằm trên URL. Nhà thầu SHALL hiện số công trình đang dùng.

#### Scenario: Mở D16 lần đầu
- **WHEN** người dùng mở `/catalog/partners` không kèm `?id=`
- **THEN** bên phải hiện sẵn chi tiết nhà thầu đầu danh sách và dòng đó được đánh dấu đang chọn

#### Scenario: Chọn nhà thầu
- **WHEN** người dùng chọn "Cty TNHH Xây dựng Minh Phát" (3 công trình)
- **THEN** bên phải hiện MST, người liên hệ, điện thoại, hạn thanh toán "30 ngày", địa chỉ và danh sách 3 công trình **AND** dòng bên trái hiện "3 công trình"

#### Scenario: Tìm theo điện thoại
- **WHEN** gõ "0912345" ở tab Nhà thầu
- **THEN** danh sách còn các nhà thầu có số điện thoại chứa dãy đó

### Requirement: Ngừng dùng và xóa đối tác
Nhà thầu và nhà cung cấp SHALL ngừng dùng và dùng lại được. Đối tác đã được tham chiếu (nhà thầu có công trình, nhà cung cấp có đơn thu mua kể cả nháp hay đã hủy, và sau này hợp đồng) SHALL chỉ ngừng dùng, không xóa. Nhà thầu còn công trình đang dùng, hoặc nhà cung cấp còn đơn thu mua đang xử lý (`IN_PROGRESS`), SHALL không ngừng dùng được; đơn nháp không chặn. Đối tác ngừng dùng SHALL không chọn được cho chứng từ hay công trình mới.

#### Scenario: Xóa nhà thầu đã có công trình
- **WHEN** xóa `NT-0001` đang có công trình (kể cả công trình đã ngừng dùng)
- **THEN** hệ thống từ chối với "Nhà thầu đã được dùng nên chỉ ngừng dùng được"

#### Scenario: Ngừng dùng nhà thầu còn công trình đang dùng
- **WHEN** ngừng dùng `NT-0001` khi công trình `CT-0001` của họ đang dùng
- **THEN** hệ thống từ chối với "Ngừng dùng các công trình của nhà thầu này trước"

#### Scenario: Xóa nhà cung cấp tạo nhầm
- **WHEN** xóa `NCC-0005` chưa được dùng ở đâu
- **THEN** nhà cung cấp bị xóa hẳn

#### Scenario: Xóa nhà cung cấp đã có đơn thu mua
- **WHEN** xóa `NCC-0002` đã có đơn `PO-2026-049` (đã xong)
- **THEN** hệ thống từ chối với "Nhà cung cấp đã được dùng nên chỉ ngừng dùng được"

#### Scenario: Ngừng dùng nhà cung cấp còn đơn đang xử lý
- **WHEN** ngừng dùng `NCC-0001` khi đơn `PO-2026-055` của họ đang chờ xe về
- **THEN** hệ thống từ chối với "NCC-0001 còn đơn thu mua đang xử lý: PO-2026-055. Đóng hoặc hủy đơn trước"

#### Scenario: Ngừng dùng nhà cung cấp chỉ có đơn đã xong
- **WHEN** ngừng dùng `NCC-0002` khi mọi đơn của họ đã xong hoặc còn nháp
- **THEN** ngừng dùng thành công

### Requirement: Quyền sửa đối tác
Tạo, sửa, ngừng dùng, dùng lại, xóa nhà thầu và nhà cung cấp SHALL chỉ dành cho `DIRECTOR`, `SALES`, `ACCOUNTANT`. Mọi vai trò SHALL đọc được qua API. Trang D16 mở được cho Giám đốc, Kế toán, Kinh doanh.

#### Scenario: Thủ kho thử sửa nhà thầu
- **WHEN** `vantung` (Thủ kho) gửi `PATCH /api/catalog/customers/{id}`
- **THEN** API trả 403 và nhà thầu không đổi

#### Scenario: Kế toán sửa hạn thanh toán
- **WHEN** `thuha` (Kế toán) đổi hạn thanh toán của `NT-0001` thành 45 ngày
- **THEN** thay đổi được lưu

### Requirement: Nhân viên phụ trách nhà thầu
Nhà thầu MAY có một **nhân viên phụ trách**: một tài khoản vai trò Kinh doanh hoặc Giám đốc đang hoạt động. Người có quyền sửa đối tác SHALL đặt, đổi, bỏ được người phụ trách; mỗi lần đổi ghi nhật ký. Tài khoản bị khóa sau đó vẫn hiện là người phụ trách, kèm chữ "(đã khóa)", cho đến khi có người đổi.

#### Scenario: Gán người phụ trách
- **WHEN** Kế toán đặt người phụ trách của `NT-0001` là `khang` (Kinh doanh)
- **THEN** `NT-0001` lưu người phụ trách `khang` **AND** nhật ký ghi "Sửa nhà thầu NT-0001: nhân viên phụ trách – → Khang"

#### Scenario: Chọn tài khoản không phải Kinh doanh
- **WHEN** gửi yêu cầu đặt người phụ trách của `NT-0001` là `vantung` (Thủ kho)
- **THEN** hệ thống từ chối với "Người phụ trách phải là tài khoản Kinh doanh hoặc Giám đốc đang hoạt động"

#### Scenario: Người phụ trách bị khóa
- **WHEN** `khang` phụ trách `NT-0001` và Giám đốc khóa tài khoản `khang`
- **THEN** D16 hiện người phụ trách của `NT-0001` là "Khang (đã khóa)" **AND** form sửa không cho chọn lại `khang` cho nhà thầu khác

#### Scenario: Thủ kho thử đổi người phụ trách
- **WHEN** `vantung` (Thủ kho) gửi `PATCH /api/catalog/customers/{id}` kèm người phụ trách mới
- **THEN** API trả 403 và nhà thầu không đổi

### Requirement: Không giới hạn quyền xem theo người phụ trách
Người phụ trách SHALL chỉ là thông tin để lọc và báo cáo. Mọi người có quyền đọc danh mục SHALL vẫn thấy mọi nhà thầu, kể cả nhà thầu do người khác phụ trách.

#### Scenario: Kinh doanh xem khách của người khác
- **WHEN** `thao` (Kinh doanh) mở D16 khi `NT-0001` do `khang` phụ trách
- **THEN** `thao` thấy và mở được chi tiết `NT-0001`

### Requirement: Lọc nhà thầu theo người phụ trách ở D16
Tab Nhà thầu ở D16 SHALL hiện người phụ trách ở dòng danh sách và ở chi tiết, và lọc được theo một người phụ trách hoặc "Chưa có người phụ trách". Bộ lọc SHALL nằm trên URL.

#### Scenario: Lọc khách của Khang
- **WHEN** có 5 nhà thầu do `khang` phụ trách, 3 do `thao`, 2 chưa có, người dùng chọn "Khang"
- **THEN** danh sách còn 5 nhà thầu **AND** URL có `?sales=<id của khang>`

#### Scenario: Lọc khách chưa có người phụ trách
- **WHEN** người dùng chọn "Chưa có người phụ trách" với dữ liệu như trên
- **THEN** danh sách còn 2 nhà thầu **AND** URL có `?sales=none`
