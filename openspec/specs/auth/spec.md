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
Sau 5 lần đăng nhập sai liên tiếp với cùng một tên đăng nhập từ cùng một địa chỉ IP trong vòng 15 phút, hệ thống SHALL từ chối mọi lần đăng nhập với tên đó từ địa chỉ IP đó trong 15 phút kể từ lần sai thứ 5, kể cả khi mật khẩu đúng, với thông báo "Nhập sai quá nhiều lần. Thử lại sau 15 phút hoặc nhờ Giám đốc đặt lại mật khẩu". Quy tắc áp dụng cả cho tên không tồn tại. Đăng nhập đúng từ địa chỉ IP đó, hoặc Giám đốc đặt lại mật khẩu, hoặc lệnh dòng lệnh cứu hộ SHALL xóa bản ghi khóa. Người dùng hợp lệ đăng nhập từ địa chỉ IP khác SHALL không bị chặn bởi các lần nhập sai từ địa chỉ IP ban đầu.

#### Scenario: Sai lần thứ 5
- **WHEN** người dùng `vantung` nhập sai mật khẩu 5 lần liên tiếp từ cùng một địa chỉ IP lúc 08:00–08:03
- **THEN** lần thứ 6 lúc 08:04 với mật khẩu đúng từ địa chỉ IP đó bị từ chối với thông báo tạm khóa, không tạo phiên

#### Scenario: Hết thời gian tạm khóa
- **WHEN** lần sai thứ 5 của `vantung` từ cùng IP lúc 08:03 và người đó đăng nhập đúng từ IP đó lúc 08:19
- **THEN** đăng nhập thành công và bộ đếm về 0

#### Scenario: Sai 4 lần rồi đúng
- **WHEN** người dùng `thuha` sai 4 lần từ cùng IP rồi nhập đúng từ IP đó
- **THEN** đăng nhập thành công; lần sai tiếp theo từ IP đó được đếm lại từ 1

#### Scenario: Tên không tồn tại cũng bị tạm khóa
- **WHEN** ai đó thử tên `khongco` sai 5 lần từ cùng một IP
- **THEN** lần thứ 6 từ IP đó nhận thông báo tạm khóa giống tài khoản có thật

#### Scenario: Giám đốc đặt lại mật khẩu gỡ tạm khóa
- **WHEN** `vantung` đang bị tạm khóa và Giám đốc đặt lại mật khẩu cho `vantung`
- **THEN** `vantung` đăng nhập được ngay bằng mật khẩu tạm mới trên mọi IP

#### Scenario: Người dùng đăng nhập từ IP khác không bị chặn
- **WHEN** kẻ xấu nhập sai tên `vantung` 5 lần từ IP `1.2.3.4` lúc 08:00–08:03 khiến `vantung` bị tạm khóa ở IP `1.2.3.4`
- **THEN** lúc 08:04 người dùng `vantung` thật đăng nhập đúng mật khẩu từ IP `5.6.7.8` thành công và vào hệ thống bình thường

#### Scenario: Lệnh dòng lệnh cứu hộ gỡ tạm khóa
- **WHEN** Giám đốc duy nhất vô tình nhập sai 5 lần từ IP nhà riêng và chạy lệnh cứu hộ `npm run unlock -- giamdoc` trên server
- **THEN** bản ghi tạm khóa của `giamdoc` được dọn sạch và Giám đốc đăng nhập lại được ngay

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
Tài khoản đang dùng mật khẩu tạm (vừa tạo, vừa được đặt lại hoặc mở khóa) SHALL được cấp thời hạn 48 giờ kể từ lúc cấp. Khi đăng nhập trong thời hạn 48 giờ, hệ thống SHALL chuyển người dùng tới `/change-password` sau khi đăng nhập. Cho tới khi đổi xong, mọi trang khác SHALL chuyển về `/change-password` và mọi API (trừ đổi mật khẩu và đăng xuất) SHALL trả 403 với thông báo "Cần đổi mật khẩu trước khi tiếp tục". Khi mật khẩu tạm đã hết hạn (quá 48 giờ chưa đổi), lần đăng nhập với mật khẩu tạm đó SHALL bị từ chối với mã 401 và thông báo "Mật khẩu tạm đã hết hạn. Liên hệ Giám đốc để cấp lại". Nếu mật khẩu không khớp, hệ thống SHALL trả thông báo sai thông thường "Tên đăng nhập hoặc mật khẩu không đúng" để không lộ trạng thái tài khoản. Đổi mật khẩu thành công SHALL xóa cờ bắt buộc đổi và hủy thời hạn mật khẩu tạm.

#### Scenario: Lần đầu đăng nhập
- **WHEN** người dùng mới `ducluc` đăng nhập bằng mật khẩu tạm `giao-7342` khi mật khẩu còn trong hạn 48 giờ
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

#### Scenario: Mật khẩu tạm hết hạn sau 48 giờ
- **WHEN** `ducluc` được tạo tài khoản lúc 08:00 ngày 01/11/2026 với mật khẩu tạm `giao-7342` và cố đăng nhập bằng mật khẩu đó lúc 08:01 ngày 03/11/2026 (sau 48 giờ 1 phút)
- **THEN** đăng nhập bị từ chối với "Mật khẩu tạm đã hết hạn. Liên hệ Giám đốc để cấp lại", không tạo phiên

#### Scenario: Mật khẩu tạm hết hạn nhưng gõ sai mật khẩu
- **WHEN** mật khẩu tạm của `ducluc` đã hết hạn và ai đó cố gõ sai mật khẩu `sai-mat-khau`
- **THEN** hệ thống hiện thông báo sai thông thường "Tên đăng nhập hoặc mật khẩu không đúng", không tiết lộ mật khẩu tạm đã hết hạn

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
Hệ thống SHALL có một bảng quyền duy nhất ánh xạ mỗi quyền tới các vai trò được phép, gồm quyền xem từng mục menu, quyền danh mục, quyền kho, quyền thu mua, quyền nhận hàng, giá sắt vụn, quyền phiếu sửa chữa, quyền kiểm kê, quyền xem nhật ký thao tác và quyền hợp đồng (thuê, bán, duyệt) như các kịch bản dưới đây. Menu và server SHALL cùng đọc bảng này.

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

#### Scenario: Quyền hợp đồng theo vai trò
- **WHEN** đọc bảng quyền cho các quyền hợp đồng
- **THEN** `contracts.rental.view` và `contracts.sale.view` cho `DIRECTOR`, `ACCOUNTANT`, `SALES`; `contracts.rental.manage` và `contracts.sale.manage` cho `DIRECTOR`, `SALES`; `contracts.approve` chỉ cho `DIRECTOR`

#### Scenario: Thủ kho gọi API hợp đồng
- **WHEN** `vantung` (Thủ kho) gửi `GET /api/contracts`
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

### Requirement: Bảo vệ tài khẩu demo khi đổi mật khẩu
Khi hệ thống hoạt động ở chế độ demo (`DEMO_MODE=true`), hệ thống SHALL từ chối yêu cầu đổi mật khẩu cá nhân của 5 tài khoản demo dùng chung (`giamdoc`, `ketoan`, `kinhdoanh`, `thukho`, `xuong`) với mã lỗi HTTP 400 và thông báo tiếng Việt "Tài khoản demo dùng chung không được đổi mật khẩu".

#### Scenario: Chặn tài khoản demo đổi mật khẩu khi bật chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** tài khoản `ketoan` gửi yêu cầu đổi mật khẩu cá nhân
- **THEN** hệ thống trả mã lỗi HTTP 400 với thông báo "Tài khoản demo dùng chung không được đổi mật khẩu"
- **AND** mật khẩu của tài khoản không bị thay đổi

#### Scenario: Cho phép đổi mật khẩu khi tắt chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=false` (hoặc không cấu hình)
- **WHEN** tài khoản `ketoan` gửi yêu cầu đổi mật khẩu với mật khẩu hiện tại chính xác
- **THEN** hệ thống đổi mật khẩu thành công

### Requirement: Phạm vi hợp đồng của tài khoản Kinh doanh
Mỗi tài khoản SHALL có phạm vi hợp đồng: Cả hai, Chỉ cho thuê, hoặc Chỉ bán (mặc định Cả hai). Với vai trò `SALES`, quyền xem và sửa hợp đồng một loại SHALL cần cả quyền trong bảng quyền lẫn phạm vi có loại đó. Vai trò khác SHALL bỏ qua phạm vi. Trang và API SHALL kiểm ở server theo phạm vi đọc lại ở mỗi yêu cầu.

#### Scenario: Kinh doanh chỉ cho thuê
- **WHEN** `quocbao` (`SALES`, phạm vi Chỉ cho thuê) gửi `GET /api/contracts?type=SALE`
- **THEN** API trả 403 với "Bạn không có quyền thực hiện thao tác này"

#### Scenario: Kinh doanh cả hai
- **WHEN** `lanphuong` (`SALES`, phạm vi Cả hai) mở D4
- **THEN** D4 hiện cả hợp đồng thuê lẫn hợp đồng bán

#### Scenario: Phạm vi không áp cho Kế toán
- **WHEN** `thuyvy` đang là Kinh doanh phạm vi Chỉ bán, Giám đốc đổi vai trò sang Kế toán, rồi `thuyvy` mở D5 của một hợp đồng thuê
- **THEN** trang mở được vì phạm vi chỉ áp cho `SALES`

#### Scenario: Đổi phạm vi có hiệu lực ngay
- **WHEN** Giám đốc đổi phạm vi của `quocbao` từ Cả hai sang Chỉ cho thuê trong lúc `quocbao` đang mở D5 của hợp đồng bán
- **THEN** lần tải lại kế tiếp `quocbao` nhận trang 403
