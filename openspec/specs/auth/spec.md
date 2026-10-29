# auth Specification

## Purpose

Xác định ai đang dùng hệ thống và họ được làm gì: đăng nhập bằng tên đăng nhập và mật khẩu, giữ phiên, quy tắc mật khẩu, chống dò mật khẩu, bắt buộc đăng nhập và kiểm tra quyền theo vai trò ở phía server.

## Requirements

### Requirement: Đăng nhập bằng tên đăng nhập và mật khẩu
Hệ thống SHALL cho người dùng đăng nhập ở `/login` bằng tên đăng nhập và mật khẩu. Không có đăng nhập bằng email, số điện thoại hay mạng xã hội. Tên đăng nhập không phân biệt hoa thường khi gõ. Đăng nhập xong, hệ thống SHALL chuyển tới trang `next` (nếu là đường dẫn nội bộ hợp lệ) hoặc trang mặc định theo vai trò: `/dashboard` cho Giám đốc, Kế toán, Kinh doanh; `/m` cho Thủ kho, Xưởng.

#### Scenario: Kế toán đăng nhập đúng
- **WHEN** người dùng `thuha` (vai trò `ACCOUNTANT`, đang hoạt động, đã đổi mật khẩu) nhập đúng mật khẩu ở `/login`
- **THEN** hệ thống tạo phiên đăng nhập và chuyển tới `/dashboard`

#### Scenario: Thủ kho đăng nhập về khu Mobile
- **WHEN** người dùng `vantung` (vai trò `WAREHOUSE`) đăng nhập đúng
- **THEN** hệ thống chuyển tới `/m`

#### Scenario: Gõ tên đăng nhập có chữ hoa
- **WHEN** người dùng gõ `ThuHa` với đúng mật khẩu của `thuha`
- **THEN** đăng nhập thành công như khi gõ `thuha`

#### Scenario: Quay lại trang đang mở dở
- **WHEN** người dùng chưa đăng nhập mở `/inventory`, bị chuyển tới `/login?next=%2Finventory` rồi đăng nhập đúng (vai trò `SALES`)
- **THEN** hệ thống chuyển tới `/inventory`

#### Scenario: Tham số next trỏ ra ngoài
- **WHEN** người dùng đăng nhập đúng từ `/login?next=https%3A%2F%2Fevil.example`
- **THEN** hệ thống bỏ qua `next` và chuyển tới trang mặc định theo vai trò

### Requirement: Báo lỗi đăng nhập không lộ tài khoản
Khi đăng nhập sai, hệ thống SHALL hiện cùng một thông báo "Tên đăng nhập hoặc mật khẩu không đúng" dù tên đăng nhập không tồn tại hay mật khẩu sai, và SHALL không tạo phiên. API đăng nhập SHALL trả 401.

#### Scenario: Sai mật khẩu
- **WHEN** người dùng `thuha` nhập mật khẩu sai
- **THEN** trang hiện "Tên đăng nhập hoặc mật khẩu không đúng", không có cookie phiên nào được đặt

#### Scenario: Tên đăng nhập không tồn tại
- **WHEN** người dùng nhập tên `khongco` với mật khẩu bất kỳ
- **THEN** trang hiện đúng thông báo "Tên đăng nhập hoặc mật khẩu không đúng" như trường hợp sai mật khẩu

### Requirement: Tạm khóa khi nhập sai nhiều lần
Sau 5 lần đăng nhập sai liên tiếp với cùng một tên đăng nhập trong vòng 15 phút, hệ thống SHALL từ chối mọi lần đăng nhập với tên đó trong 15 phút kể từ lần sai thứ 5, kể cả khi mật khẩu đúng, với thông báo "Nhập sai quá nhiều lần. Thử lại sau 15 phút hoặc nhờ Giám đốc đặt lại mật khẩu". Quy tắc áp dụng cả cho tên không tồn tại. Đăng nhập đúng hoặc Giám đốc đặt lại mật khẩu SHALL xóa bộ đếm.

#### Scenario: Sai lần thứ 5
- **WHEN** người dùng `vantung` nhập sai mật khẩu 5 lần liên tiếp lúc 08:00–08:03
- **THEN** lần thứ 6 lúc 08:04 với mật khẩu đúng bị từ chối với thông báo tạm khóa, không tạo phiên

#### Scenario: Hết thời gian tạm khóa
- **WHEN** lần sai thứ 5 của `vantung` lúc 08:03 và người đó đăng nhập đúng lúc 08:19
- **THEN** đăng nhập thành công và bộ đếm về 0

#### Scenario: Sai 4 lần rồi đúng
- **WHEN** người dùng `thuha` sai 4 lần rồi nhập đúng
- **THEN** đăng nhập thành công; lần sai tiếp theo được đếm lại từ 1

#### Scenario: Tên không tồn tại cũng bị tạm khóa
- **WHEN** ai đó thử tên `khongco` sai 5 lần
- **THEN** lần thứ 6 nhận thông báo tạm khóa giống tài khoản có thật

#### Scenario: Giám đốc đặt lại mật khẩu gỡ tạm khóa
- **WHEN** `vantung` đang bị tạm khóa và Giám đốc đặt lại mật khẩu cho `vantung`
- **THEN** `vantung` đăng nhập được ngay bằng mật khẩu tạm mới

### Requirement: Giới hạn số lần gọi đăng nhập theo địa chỉ IP
Hệ thống SHALL giới hạn tối đa 20 lần gọi API đăng nhập mỗi phút từ cùng một địa chỉ IP. Vượt giới hạn SHALL trả 429 với thông báo "Thao tác quá nhanh. Thử lại sau ít phút".

#### Scenario: Dò nhiều tên từ một máy
- **WHEN** một địa chỉ IP gửi 21 yêu cầu đăng nhập trong cùng một phút, mỗi lần một tên khác nhau
- **THEN** yêu cầu thứ 21 nhận 429 và không được kiểm tra mật khẩu

### Requirement: Tài khoản bị khóa không đăng nhập được
Tài khoản ở trạng thái Đã khóa SHALL không đăng nhập được. Khi mật khẩu đúng, hệ thống SHALL hiện "Tài khoản đã bị khóa. Liên hệ Giám đốc"; khi mật khẩu sai, hiện thông báo sai thông thường.

#### Scenario: Nhân viên đã nghỉ đăng nhập
- **WHEN** `ngoclam` (Đã khóa) nhập đúng mật khẩu cũ
- **THEN** đăng nhập bị từ chối với "Tài khoản đã bị khóa. Liên hệ Giám đốc", không tạo phiên

#### Scenario: Tài khoản khóa nhập sai mật khẩu
- **WHEN** `ngoclam` (Đã khóa) nhập sai mật khẩu
- **THEN** trang hiện "Tên đăng nhập hoặc mật khẩu không đúng"

### Requirement: Thời gian giữ đăng nhập
Khi tick "Giữ đăng nhập trên máy này", phiên SHALL còn hiệu lực 30 ngày kể từ lần dùng gần nhất (tự gia hạn, gia hạn tối đa một lần mỗi ngày). Khi không tick, cookie phiên SHALL mất khi đóng trình duyệt và phiên SHALL hết hạn sau 12 giờ kể từ lúc đăng nhập, dù trình duyệt còn mở. Phiên hết hạn thì người dùng phải đăng nhập lại.

#### Scenario: Thủ kho tick giữ đăng nhập
- **WHEN** `vantung` tick ô và đăng nhập ngày 01/11/2026, dùng app mỗi ngày tới 15/11/2026
- **THEN** ngày 16/11/2026 mở `/m` vẫn vào được, không phải đăng nhập lại

#### Scenario: Giữ đăng nhập nhưng bỏ không dùng
- **WHEN** `vantung` tick ô, dùng app lần cuối ngày 01/11/2026
- **THEN** ngày 02/12/2026 mở `/m` bị chuyển tới `/login`

#### Scenario: Không tick, đóng trình duyệt
- **WHEN** `thuha` đăng nhập không tick ô, rồi đóng hẳn trình duyệt và mở lại
- **THEN** mở `/dashboard` bị chuyển tới `/login`

#### Scenario: Không tick, để máy cả đêm
- **WHEN** `thuha` đăng nhập không tick ô lúc 08:00 và để trình duyệt mở
- **THEN** lúc 20:01 cùng ngày, thao tác tiếp theo bị chuyển tới `/login`

### Requirement: Bắt buộc đổi mật khẩu tạm
Tài khoản đang dùng mật khẩu tạm (vừa tạo hoặc vừa được đặt lại) SHALL được chuyển tới `/change-password` sau khi đăng nhập. Cho tới khi đổi xong, mọi trang khác SHALL chuyển về `/change-password` và mọi API (trừ đổi mật khẩu và đăng xuất) SHALL trả 403 với thông báo "Cần đổi mật khẩu trước khi tiếp tục".

#### Scenario: Lần đầu đăng nhập
- **WHEN** người dùng mới `ducluc` đăng nhập bằng mật khẩu tạm `giao-7342`
- **THEN** hệ thống chuyển tới `/change-password`, không vào `/dashboard`

#### Scenario: Cố mở trang khác khi chưa đổi
- **WHEN** `ducluc` chưa đổi mật khẩu và mở thẳng `/inventory`
- **THEN** hệ thống chuyển về `/change-password`

#### Scenario: Gọi API khi chưa đổi
- **WHEN** `ducluc` chưa đổi mật khẩu và gọi `GET /api/users`
- **THEN** API trả 403 với "Cần đổi mật khẩu trước khi tiếp tục"

#### Scenario: Đổi xong
- **WHEN** `ducluc` đổi mật khẩu tạm sang `bai-sau-kho-9` thành công
- **THEN** hệ thống chuyển tới trang mặc định theo vai trò và lần sau đăng nhập bằng `bai-sau-kho-9`, không bị bắt đổi nữa

### Requirement: Quy tắc mật khẩu mới
Mật khẩu người dùng tự đặt SHALL dài 8–128 ký tự, khác tên đăng nhập, khác mật khẩu đang dùng và không thuộc danh sách mật khẩu quá phổ biến (ví dụ `12345678`, `password`, `matkhau123`). Không bắt buộc chữ hoa, số hay ký tự đặc biệt. Ô "Nhập lại mật khẩu mới" SHALL khớp ô mật khẩu mới. Đổi mật khẩu SHALL yêu cầu nhập mật khẩu hiện tại.

#### Scenario: Quá ngắn
- **WHEN** người dùng đặt mật khẩu mới `kho123` (6 ký tự)
- **THEN** hệ thống từ chối với "Mật khẩu mới phải có ít nhất 8 ký tự"

#### Scenario: Trùng mật khẩu tạm
- **WHEN** `ducluc` đặt mật khẩu mới đúng bằng mật khẩu tạm `giao-7342`
- **THEN** hệ thống từ chối với "Mật khẩu mới phải khác mật khẩu hiện tại"

#### Scenario: Mật khẩu phổ biến
- **WHEN** người dùng đặt mật khẩu mới `12345678`
- **THEN** hệ thống từ chối với "Mật khẩu này quá dễ đoán, chọn mật khẩu khác"

#### Scenario: Câu dài không ký tự đặc biệt
- **WHEN** người dùng đặt mật khẩu mới `bai sau kho` (11 ký tự, có khoảng trắng)
- **THEN** hệ thống chấp nhận

#### Scenario: Sai mật khẩu hiện tại
- **WHEN** người dùng đổi mật khẩu nhưng nhập sai mật khẩu hiện tại
- **THEN** hệ thống từ chối với "Mật khẩu hiện tại không đúng" và mật khẩu không đổi

### Requirement: Đổi mật khẩu đăng xuất các thiết bị khác
Khi người dùng tự đổi mật khẩu thành công, hệ thống SHALL kết thúc mọi phiên khác của người đó và giữ phiên đang dùng.

#### Scenario: Đổi trên máy tính
- **WHEN** `quocbao` đang đăng nhập trên máy tính và điện thoại, rồi đổi mật khẩu trên máy tính
- **THEN** máy tính vẫn dùng tiếp; thao tác tiếp theo trên điện thoại bị chuyển tới `/login`

### Requirement: Đăng xuất
Người dùng SHALL đăng xuất được từ header Desktop và tab Cá nhân trên Mobile. Đăng xuất SHALL xóa phiên ở server và cookie, rồi chuyển tới `/login`.

#### Scenario: Đăng xuất trên Desktop
- **WHEN** `thuha` bấm "Đăng xuất" trong menu người dùng ở header
- **THEN** hệ thống chuyển tới `/login`; bấm nút quay lại của trình duyệt về `/dashboard` thì bị chuyển lại `/login`

### Requirement: Bắt buộc đăng nhập cho trang và API
Mọi trang và API SHALL yêu cầu phiên đăng nhập hợp lệ, trừ `/login`, `/api/auth/*`, `/api/health`, `/manifest.webmanifest`, biểu tượng và file tĩnh. Chưa đăng nhập: trang SHALL chuyển tới `/login?next=<đường dẫn>`; API SHALL trả 401 với "Bạn cần đăng nhập". Người đã đăng nhập mở `/login` SHALL được chuyển tới trang mặc định theo vai trò.

#### Scenario: Mở trang khi chưa đăng nhập
- **WHEN** khách chưa đăng nhập mở `/m/history`
- **THEN** hệ thống chuyển tới `/login?next=%2Fm%2Fhistory`

#### Scenario: Gọi API khi chưa đăng nhập
- **WHEN** khách chưa đăng nhập gọi `GET /api/users`
- **THEN** API trả 401, thân `{ success: false, data: null, error: "Bạn cần đăng nhập" }`

#### Scenario: Kiểm tra sức khỏe không cần đăng nhập
- **WHEN** khách chưa đăng nhập gọi `GET /api/health`
- **THEN** API trả kết quả như trước, không đòi đăng nhập

#### Scenario: Đã đăng nhập mở trang đăng nhập
- **WHEN** `thuha` đang đăng nhập mở `/login`
- **THEN** hệ thống chuyển tới `/dashboard`

### Requirement: Bảng quyền theo vai trò
Hệ thống SHALL có một bảng quyền duy nhất ánh xạ mỗi quyền tới các vai trò được phép, gồm quyền xem từng mục menu, quyền danh mục, quyền kho, quyền thu mua, quyền nhận hàng, giá sắt vụn, quyền phiếu sửa chữa, quyền kiểm kê và quyền xem nhật ký thao tác như các kịch bản dưới đây. Menu và server SHALL cùng đọc bảng này.

#### Scenario: Menu và server khớp nhau
- **WHEN** vai trò `ACCOUNTANT` không có quyền vào Cài đặt trong bảng quyền
- **THEN** sidebar không hiện mục Cài đặt **AND** mở thẳng `/settings` nhận trang 403

#### Scenario: Thêm quyền mới
- **WHEN** một change sau thêm quyền "duyệt hợp đồng" chỉ cho `DIRECTOR` vào bảng quyền
- **THEN** cả nút trên giao diện lẫn API duyệt đều dùng quyền đó, không khai báo vai trò ở chỗ khác

#### Scenario: Quyền xem mục menu theo vai trò
- **WHEN** đọc bảng quyền cho các mục menu
- **THEN** Tổng quan, Thu mua, Kho, Sửa chữa, Bán & Thuê, Danh mục cho `DIRECTOR`, `ACCOUNTANT`, `SALES`; Công nợ cho `DIRECTOR`, `ACCOUNTANT`; Báo cáo, Cài đặt, quản lý người dùng chỉ cho `DIRECTOR`

#### Scenario: Quyền danh mục theo vai trò
- **WHEN** đọc bảng quyền cho các quyền danh mục
- **THEN** `catalog.read` cho cả 5 vai trò; `items.manage` cho `DIRECTOR`, `SALES`; `partners.manage` cho `DIRECTOR`, `SALES`, `ACCOUNTANT`; `locations.manage` chỉ cho `DIRECTOR`

#### Scenario: Kế toán xem Danh mục nhưng không sửa vật tư
- **WHEN** `thuha` (Kế toán) mở `/catalog/items` rồi gửi `POST /api/catalog/items`
- **THEN** trang mở được **AND** API trả 403

#### Scenario: Quyền kho theo vai trò
- **WHEN** đọc bảng quyền cho các quyền kho
- **THEN** `inventory.view` cho `DIRECTOR`, `ACCOUNTANT`, `SALES`; `inventory.adjust` cho `DIRECTOR`, `ACCOUNTANT`; `inventory.approve` chỉ cho `DIRECTOR`

#### Scenario: Kế toán lập nhưng không duyệt điều chỉnh
- **WHEN** `thuha` (Kế toán) gửi `POST /api/inventory/adjustments` rồi gửi duyệt chính phiếu đó qua `POST /api/inventory/adjustments/<id>/approve`
- **THEN** phiếu được tạo **AND** lệnh duyệt trả 403

#### Scenario: Quyền thu mua theo vai trò
- **WHEN** đọc bảng quyền cho các quyền thu mua
- **THEN** `purchasing.view` cho `DIRECTOR`, `ACCOUNTANT`, `SALES`; `purchasing.manage` chỉ cho `DIRECTOR`, `SALES`

#### Scenario: Kế toán xem đơn thu mua nhưng không tạo
- **WHEN** `thuha` (Kế toán) mở `/purchasing` rồi gửi `POST /api/purchasing/orders`
- **THEN** trang mở được **AND** API trả 403

#### Scenario: Quyền nhận hàng và tra tồn theo vai trò
- **WHEN** đọc bảng quyền cho các quyền nhận hàng
- **THEN** `receiving.manage` cho `DIRECTOR`, `WAREHOUSE`; `stock.lookup` cho cả 5 vai trò; `scrap-price.manage` chỉ cho `DIRECTOR`

#### Scenario: Thủ kho nhận hàng nhưng không mở trang đơn của văn phòng
- **WHEN** `vantung` (Thủ kho) gửi `GET /api/receiving/orders/PO-2026-052` rồi mở `/purchasing/orders/PO-2026-052`
- **THEN** API trả dữ liệu đơn để nhận hàng **AND** trang trả 403

#### Scenario: Quyền phiếu sửa chữa theo vai trò
- **WHEN** đọc bảng quyền cho các quyền sửa chữa
- **THEN** `repairs.view` cho `DIRECTOR`, `ACCOUNTANT`, `SALES`; `repairs.manage` chỉ cho `DIRECTOR`, `ACCOUNTANT`

#### Scenario: Kinh doanh xem phiếu sửa nhưng không lập
- **WHEN** `quocbao` (Kinh doanh) mở `/repairs` rồi gửi `POST /api/repairs`
- **THEN** trang mở được **AND** API trả 403

#### Scenario: Quyền kiểm kê theo vai trò
- **WHEN** đọc bảng quyền cho quyền kiểm kê
- **THEN** `stocktake.count` chỉ cho `DIRECTOR`, `WAREHOUSE`; xem kết quả kiểm kê dùng `inventory.view`; duyệt dùng `inventory.approve`

#### Scenario: Thủ kho đếm nhưng không duyệt
- **WHEN** `vantung` (Thủ kho) gửi `POST /api/stocktakes` cho `BAI-01` rồi gửi `POST /api/stocktakes/KK-2026-003/approve`
- **THEN** phiên được tạo **AND** lệnh duyệt trả 403

#### Scenario: Quyền xem nhật ký thao tác theo vai trò
- **WHEN** đọc bảng quyền cho quyền nhật ký
- **THEN** `activity.view` chỉ cho `DIRECTOR`; không có quyền nào cho phép sửa hay xóa nhật ký

#### Scenario: Kế toán gọi API nhật ký
- **WHEN** `thuha` (Kế toán) gửi `GET /api/activity?from=2026-10-22&to=2026-10-28`
- **THEN** API trả 403 với "Bạn không có quyền thực hiện thao tác này"

### Requirement: Từ chối thao tác sai vai trò ở server
Mỗi API và trang có giới hạn vai trò SHALL kiểm tra quyền ở server theo bảng quyền, độc lập với việc ẩn nút trên giao diện. API sai vai trò SHALL trả 403 với "Bạn không có quyền thực hiện thao tác này" và không thay đổi dữ liệu. Trang sai vai trò SHALL hiện trang 403 "Bạn không có quyền xem trang này" kèm nút về trang mặc định.

#### Scenario: Kinh doanh gọi API tạo người dùng
- **WHEN** `quocbao` (vai trò `SALES`) gửi `POST /api/users` với dữ liệu hợp lệ
- **THEN** API trả 403 với "Bạn không có quyền thực hiện thao tác này" và không có tài khoản nào được tạo

#### Scenario: Thủ kho gọi API khóa tài khoản
- **WHEN** `vantung` (vai trò `WAREHOUSE`) gửi `POST /api/users/{id}/lock` cho tài khoản `thuha`
- **THEN** API trả 403 và `thuha` vẫn Đang dùng

#### Scenario: Kế toán mở trang Người dùng
- **WHEN** `thuha` (vai trò `ACCOUNTANT`) mở thẳng `/settings/users`
- **THEN** trang hiện "Bạn không có quyền xem trang này" với mã 403

### Requirement: Quyền đọc từ dữ liệu hiện tại ở mỗi yêu cầu
Vai trò và trạng thái tài khoản SHALL được đọc từ cơ sở dữ liệu ở mỗi yêu cầu, không lưu cố định trong cookie. Đổi vai trò có hiệu lực ngay ở yêu cầu kế tiếp, không cần đăng nhập lại.

#### Scenario: Đổi vai trò khi đang dùng
- **WHEN** `lanphuong` đang mở `/purchasing` với vai trò `SALES` và Giám đốc đổi vai trò của `lanphuong` sang `ACCOUNTANT`
- **THEN** ở lần tải trang kế tiếp, sidebar của `lanphuong` hiện mục Công nợ

### Requirement: Tạo tài khoản Giám đốc đầu tiên bằng lệnh
Hệ thống SHALL có lệnh dòng lệnh tạo tài khoản Giám đốc khi cơ sở dữ liệu chưa có Giám đốc nào đang hoạt động. Lệnh nhận họ tên và tên đăng nhập, tạo mật khẩu tạm và in ra đúng một lần. Nếu đã có Giám đốc đang hoạt động, lệnh SHALL dừng và không tạo gì.

#### Scenario: Cài đặt lần đầu
- **WHEN** quản trị chạy lệnh tạo Giám đốc với tên `minhanh`, họ tên "Minh Anh" trên DB chưa có người dùng
- **THEN** tài khoản `minhanh` vai trò `DIRECTOR` được tạo, terminal in mật khẩu tạm một lần, lần đầu đăng nhập phải đổi mật khẩu

#### Scenario: Đã có Giám đốc
- **WHEN** DB đã có `minhanh` (Giám đốc, đang hoạt động) và quản trị chạy lại lệnh với tên `giamdoc2`
- **THEN** lệnh báo "Đã có tài khoản Giám đốc. Dùng màn Người dùng để thêm tài khoản" và không tạo tài khoản

### Requirement: Trang Cá nhân trên Mobile
Tab Cá nhân (`/m/profile`) SHALL hiện họ tên, tên đăng nhập, vai trò bằng tiếng Việt, nút "Đổi mật khẩu" và nút "Đăng xuất". Mỗi nút cao tối thiểu 48px.

#### Scenario: Thủ kho xem tab Cá nhân
- **WHEN** `vantung` (Thủ kho) mở `/m/profile`
- **THEN** trang hiện "Văn Tùng", "vantung", "Thủ kho", nút "Đổi mật khẩu" và "Đăng xuất"
