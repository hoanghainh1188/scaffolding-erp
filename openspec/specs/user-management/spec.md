# user-management Specification

## Purpose

Cho Giám đốc quản lý tài khoản ở màn D17 (Cài đặt › Người dùng): xem danh sách, thêm người, đổi vai trò, đặt lại mật khẩu, khóa và mở khóa, mà không bao giờ để công ty mất Giám đốc cuối cùng.

## Requirements

### Requirement: Chỉ Giám đốc quản lý người dùng
Màn `/settings/users` và mọi API quản lý người dùng SHALL chỉ dành cho vai trò `DIRECTOR`. Vai trò khác nhận 403 (theo bảng quyền của capability `auth`).

#### Scenario: Giám đốc mở D17
- **WHEN** `minhanh` (Giám đốc) bấm Cài đặt › Người dùng
- **THEN** trang `/settings/users` hiện danh sách người dùng

#### Scenario: Kế toán gọi API danh sách
- **WHEN** `thuha` (Kế toán) gọi `GET /api/users`
- **THEN** API trả 403, không trả danh sách

### Requirement: Danh sách người dùng
D17 SHALL hiện bảng người dùng gồm: Họ tên (kèm chữ viết tắt và tên đăng nhập), Vai trò, Dùng trên, Đăng nhập gần nhất, Trạng thái (Đang dùng / Đã khóa / Hết hạn mật khẩu tạm). Khi một tài khoản Đang dùng có mật khẩu tạm đã hết hạn sau 48 giờ chưa đăng nhập, cột Trạng thái SHALL hiện huy hiệu "Hết hạn mật khẩu tạm". Đầu trang SHALL hiện số người đang dùng và số tài khoản đã khóa. Tài khoản Đang dùng xếp trước Đã khóa; cùng trạng thái xếp theo họ tên. Danh sách SHALL không bao giờ trả về mật khẩu hay mã băm.

#### Scenario: Đếm đầu trang
- **WHEN** DB có 7 tài khoản Đang dùng và 1 tài khoản Đã khóa
- **THEN** đầu trang hiện "7 người đang dùng · 1 tài khoản đã khóa" **AND** dòng `ngoclam` (Đã khóa) nằm cuối bảng

#### Scenario: API không lộ mật khẩu
- **WHEN** Giám đốc gọi `GET /api/users`
- **THEN** mỗi phần tử chỉ có id, họ tên, tên đăng nhập, vai trò, trạng thái, thiết bị, thời điểm đăng nhập gần nhất và thời điểm hết hạn mật khẩu tạm (nếu có); không có trường mật khẩu hay mã băm

#### Scenario: Hiện trạng thái hết hạn mật khẩu tạm
- **WHEN** `ducluc` được cấp mật khẩu tạm quá 48 giờ trước và chưa đăng nhập
- **THEN** dòng `ducluc` ở cột Trạng thái hiện huy hiệu "Hết hạn mật khẩu tạm"

### Requirement: Lọc danh sách theo vai trò
D17 SHALL có các nút lọc "Tất cả" và một nút cho mỗi vai trò, mỗi nút kèm số tài khoản (tính cả tài khoản đã khóa). Bộ lọc đang chọn SHALL nằm trên URL để tải lại vẫn giữ.

#### Scenario: Lọc Thủ kho
- **WHEN** DB có 3 Thủ kho (2 Đang dùng, 1 Đã khóa) và Giám đốc bấm "Thủ kho · 3"
- **THEN** bảng chỉ còn 3 dòng Thủ kho **AND** URL có `?role=WAREHOUSE`

### Requirement: Hiện lần đăng nhập gần nhất và thiết bị
Mỗi lần đăng nhập thành công, hệ thống SHALL ghi thời điểm và loại thiết bị (Máy tính hoặc Điện thoại, suy từ trình duyệt). Cột "Đăng nhập gần nhất" SHALL hiện theo giờ Việt Nam: "Hôm nay, HH:mm", "Hôm qua, HH:mm", hoặc "dd/MM/yyyy, HH:mm"; chưa từng đăng nhập thì hiện "Chưa đăng nhập" và cột "Dùng trên" hiện "—".

#### Scenario: Đăng nhập bằng điện thoại sáng nay
- **WHEN** `vantung` đăng nhập từ trình duyệt Chrome trên Android lúc 2026-10-26T23:48:00Z và Giám đốc xem D17 ngày 27/10/2026
- **THEN** dòng `vantung` hiện "Điện thoại" và "Hôm nay, 06:48"

#### Scenario: Đăng nhập từ ngày trước
- **WHEN** `lanphuong` đăng nhập lần cuối bằng Edge trên Windows lúc 23/10/2026 16:20 giờ Việt Nam và hôm nay là 27/10/2026
- **THEN** dòng `lanphuong` hiện "Máy tính" và "23/10/2026, 16:20"

#### Scenario: Tài khoản mới chưa đăng nhập
- **WHEN** Giám đốc vừa tạo tài khoản `ducluc`
- **THEN** dòng `ducluc` hiện "—" ở cột Dùng trên và "Chưa đăng nhập"

#### Scenario: Đăng nhập sai không ghi
- **WHEN** `thuha` đăng nhập lần cuối lúc 07:55 rồi lúc 09:00 nhập sai mật khẩu
- **THEN** D17 vẫn hiện "Hôm nay, 07:55" cho `thuha`

### Requirement: Thêm người dùng
Giám đốc SHALL thêm được người dùng với họ tên (1–100 ký tự), tên đăng nhập và đúng một vai trò. Tên đăng nhập SHALL dài 3–32 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm hoặc gạch dưới (không ở đầu/cuối), không trùng với tài khoản nào kể cả tài khoản đã khóa, và không đổi được sau khi tạo. Tài khoản mới ở trạng thái Đang dùng và phải đổi mật khẩu ở lần đăng nhập đầu.

#### Scenario: Tạo Thủ kho mới
- **WHEN** Giám đốc nhập họ tên "Đức Lực", tên đăng nhập `ducluc`, chọn vai trò Thủ kho và bấm "Tạo tài khoản"
- **THEN** tài khoản `ducluc` vai trò `WAREHOUSE` được tạo, trạng thái Đang dùng, bảng có thêm một dòng

#### Scenario: Tên đăng nhập có dấu
- **WHEN** Giám đốc nhập tên đăng nhập `đức lực`
- **THEN** hệ thống từ chối với "Chữ thường không dấu, không khoảng trắng" và không tạo tài khoản

#### Scenario: Trùng tên với tài khoản đã khóa
- **WHEN** Giám đốc tạo tài khoản tên `ngoclam` trong khi `ngoclam` đã khóa vẫn còn
- **THEN** hệ thống từ chối với "Tên đăng nhập đã có người dùng" và không tạo tài khoản

### Requirement: Mật khẩu tạm chỉ hiện một lần
Khi tạo tài khoản hoặc đặt lại mật khẩu, hệ thống SHALL tạo mật khẩu tạm ngẫu nhiên dạng `<từ>-<4 chữ số>` (ví dụ `giao-7342`) và hiện cho Giám đốc đúng một lần kèm nút "Sao chép" và lời nhắc "Đưa mật khẩu này cho <họ tên>. Lần đầu đăng nhập phải đổi mật khẩu mới." Hệ thống SHALL chỉ lưu mã băm; đóng hộp thoại hoặc tải lại trang thì không xem lại được mật khẩu đó.

#### Scenario: Xem mật khẩu tạm sau khi tạo
- **WHEN** Giám đốc tạo xong tài khoản `ducluc`
- **THEN** hộp thoại hiện mật khẩu tạm dạng `giao-7342`, nút "Sao chép" và lời nhắc "Đưa mật khẩu này cho Đức Lực..."

#### Scenario: Không xem lại được
- **WHEN** Giám đốc đóng hộp thoại mật khẩu tạm của `ducluc` rồi mở lại dòng `ducluc`
- **THEN** không có chỗ nào hiện lại mật khẩu tạm; muốn có mật khẩu mới phải "Đặt lại mật khẩu"

#### Scenario: Mật khẩu tạm không lưu dạng đọc được
- **WHEN** đọc bản ghi tài khoản `ducluc` trong DB
- **THEN** chỉ thấy mã băm, không thấy chuỗi `giao-7342`

### Requirement: Đặt lại mật khẩu
Giám đốc SHALL đặt lại mật khẩu cho một tài khoản Đang dùng khác (hoặc cấp lại khi mật khẩu tạm đã hết hạn). Hệ thống SHALL thay mật khẩu bằng mật khẩu tạm mới (hiện một lần) có thời hạn 48 giờ mới, bắt đổi ở lần đăng nhập kế tiếp, xóa bộ đếm nhập sai và kết thúc ngay mọi phiên đang mở của người đó. Giám đốc tự đổi mật khẩu của mình ở màn Đổi mật khẩu, không dùng đặt lại.

#### Scenario: Thủ kho quên mật khẩu
- **WHEN** `vantung` đang đăng nhập trên điện thoại và Giám đốc bấm "Đặt lại mật khẩu" cho `vantung`
- **THEN** Giám đốc thấy mật khẩu tạm mới một lần có thời hạn 48 giờ **AND** thao tác tiếp theo trên điện thoại của `vantung` bị chuyển tới `/login` **AND** mật khẩu cũ không đăng nhập được nữa

#### Scenario: Đặt lại cho tài khoản đã khóa
- **WHEN** Giám đốc gọi đặt lại mật khẩu cho `ngoclam` (Đã khóa)
- **THEN** hệ thống từ chối với "Mở khóa tài khoản trước khi đặt lại mật khẩu"

#### Scenario: Cấp lại mật khẩu tạm khi đã hết hạn
- **WHEN** mật khẩu tạm của `ducluc` đã hết hạn và Giám đốc chọn "Cấp lại mật khẩu tạm" (hoặc Đặt lại mật khẩu)
- **THEN** Giám đốc nhận được mật khẩu tạm mới với thời hạn 48 giờ tính từ thời điểm cấp lại

### Requirement: Khóa tài khoản
Giám đốc SHALL khóa được tài khoản Đang dùng. Khóa SHALL kết thúc ngay mọi phiên đang mở của người đó; yêu cầu kế tiếp từ phiên cũ bị coi như chưa đăng nhập. Tài khoản khóa SHALL không bị xóa và vẫn giữ tên trong mọi lịch sử đã ghi.

#### Scenario: Khóa nhân viên nghỉ việc
- **WHEN** `hoangnam` đang mở `/m` và Giám đốc bấm "Khóa tài khoản" cho `hoangnam`
- **THEN** dòng `hoangnam` chuyển sang "Đã khóa" **AND** lần chuyển tab kế tiếp trên điện thoại của `hoangnam` bị chuyển tới `/login` **AND** API gọi bằng cookie cũ trả 401

#### Scenario: Không có nút xóa
- **WHEN** Giám đốc xem dòng `ngoclam` (Đã khóa)
- **THEN** chỉ có thao tác "Mở khóa", không có thao tác xóa

### Requirement: Mở khóa tài khoản
Giám đốc SHALL mở khóa được tài khoản Đã khóa. Mở khóa SHALL tạo mật khẩu tạm mới (hiện một lần) và bắt đổi ở lần đăng nhập kế tiếp, để mật khẩu cũ của người đã nghỉ không dùng lại được.

#### Scenario: Nhân viên đi làm lại
- **WHEN** Giám đốc mở khóa `ngoclam`
- **THEN** `ngoclam` chuyển sang "Đang dùng", Giám đốc thấy mật khẩu tạm mới một lần **AND** mật khẩu cũ của `ngoclam` không đăng nhập được

### Requirement: Đổi vai trò
Giám đốc SHALL đổi được vai trò của một tài khoản sang đúng một vai trò khác. Vai trò mới có hiệu lực ở yêu cầu kế tiếp của người đó.

#### Scenario: Kinh doanh chuyển sang Kế toán
- **WHEN** Giám đốc đổi vai trò của `lanphuong` từ Kinh doanh sang Kế toán
- **THEN** dòng `lanphuong` hiện "Kế toán" và `lanphuong` thấy mục Công nợ ở lần tải trang kế tiếp

### Requirement: Bảo vệ Giám đốc cuối cùng
Hệ thống SHALL từ chối khi Giám đốc khóa chính mình hoặc đổi vai trò của chính mình. Hệ thống SHALL từ chối mọi thao tác làm số Giám đốc Đang dùng còn 0 (khóa hoặc đổi vai trò Giám đốc cuối cùng), kể cả khi hai yêu cầu đến cùng lúc. Bị từ chối thì không thay đổi dữ liệu.

#### Scenario: Tự khóa mình
- **WHEN** `minhanh` (Giám đốc) gửi yêu cầu khóa tài khoản `minhanh`
- **THEN** API trả 409 với "Không thể tự khóa tài khoản của mình" và `minhanh` vẫn Đang dùng

#### Scenario: Tự hạ vai trò
- **WHEN** `minhanh` gửi yêu cầu đổi vai trò của `minhanh` sang Kế toán
- **THEN** API trả 409 với "Không thể tự đổi vai trò của mình"

#### Scenario: Hạ vai trò và khóa cùng lúc
- **WHEN** có đúng 2 Giám đốc Đang dùng; cùng lúc `minhanh` đổi vai trò `giamdoc2` sang Kế toán và `giamdoc2` khóa `minhanh`
- **THEN** đúng một yêu cầu thành công, yêu cầu còn lại bị từ chối và không đổi dữ liệu **AND** sau cùng còn đúng 1 Giám đốc Đang dùng

#### Scenario: Hai Giám đốc khóa nhau cùng lúc
- **WHEN** có đúng 2 Giám đốc Đang dùng `minhanh`, `giamdoc2`, và hai yêu cầu "`minhanh` khóa `giamdoc2`" và "`giamdoc2` khóa `minhanh`" đến cùng lúc
- **THEN** đúng một yêu cầu thành công, yêu cầu còn lại bị từ chối và không đổi dữ liệu **AND** sau cùng còn đúng 1 Giám đốc Đang dùng

#### Scenario: Thông báo khi chạm Giám đốc cuối cùng
- **WHEN** dịch vụ quản lý người dùng nhận yêu cầu khóa Giám đốc Đang dùng duy nhất (ví dụ yêu cầu thứ hai trong hai yêu cầu cùng lúc, được xử lý sau)
- **THEN** API trả 409 với "Phải còn ít nhất một Giám đốc đang dùng"

#### Scenario: Còn Giám đốc khác thì được
- **WHEN** có 2 Giám đốc Đang dùng và `minhanh` khóa `giamdoc2`
- **THEN** khóa thành công

### Requirement: Bảo vệ tài khoản demo trong quản trị người dùng
Khi hệ thống hoạt động ở chế độ demo (`DEMO_MODE=true`), hệ thống SHALL từ chối các thao tác khóa tài khoản, đặt lại mật khẩu, hoặc thay đổi vai trò đối với 5 tài khoản demo dùng chung (`giamdoc`, `ketoan`, `kinhdoanh`, `thukho`, `xuong`) với mã lỗi HTTP 409 và thông báo lỗi tương ứng.

#### Scenario: Chặn đặt lại mật khẩu tài khoản demo khi bật chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** Giám đốc yêu cầu đặt lại mật khẩu cho tài khoản `thukho`
- **THEN** hệ thống trả mã lỗi HTTP 409 với thông báo "Tài khoản demo dùng chung không thể đặt lại mật khẩu"
- **AND** mật khẩu của `thukho` không bị thay đổi

#### Scenario: Chặn khóa tài khoản demo khi bật chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** Giám đốc yêu cầu khóa tài khoản `thukho`
- **THEN** hệ thống trả mã lỗi HTTP 409 với thông báo "Tài khoản demo dùng chung không thể khóa"
- **AND** trạng thái của `thukho` vẫn là `ACTIVE`

#### Scenario: Chặn đổi vai trò tài khoản demo khi bật chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** Giám đốc yêu cầu đổi vai trò của `thukho` sang `SALES`
- **THEN** hệ thống trả mã lỗi HTTP 409 với thông báo "Tài khoản demo dùng chung không thể đổi vai trò"
- **AND** vai trò của `thukho` vẫn là `WAREHOUSE`

#### Scenario: Cho phép quản lý tài khoản tạo mới trong chế độ demo
- **GIVEN** hệ thống đang chạy với `DEMO_MODE=true`
- **WHEN** Giám đốc khóa hoặc đặt lại mật khẩu cho một tài khoản mới được tạo thử nghiệm (không thuộc danh sách 5 tài khoản demo)
- **THEN** thao tác được thực hiện thành công

### Requirement: Đặt phạm vi hợp đồng cho Kinh doanh
Giám đốc SHALL đặt được phạm vi hợp đồng cho tài khoản vai trò Kinh doanh ở D17: Cả hai, Chỉ cho thuê, Chỉ bán. Tài khoản mới mặc định Cả hai. D17 SHALL hiện phạm vi ở dòng của tài khoản Kinh doanh và không hiện ô này cho vai trò khác. Đổi phạm vi SHALL có hiệu lực ở yêu cầu kế tiếp của người đó và ghi nhật ký như đổi vai trò.

#### Scenario: Đặt Chỉ cho thuê
- **WHEN** Giám đốc đặt phạm vi của `quocbao` (Kinh doanh) thành Chỉ cho thuê
- **THEN** dòng `quocbao` trên D17 hiện "Kinh doanh · Chỉ cho thuê" **AND** nhật ký có một dòng Sửa loại Người dùng với trường "Phạm vi hợp đồng" Cả hai → Chỉ cho thuê

#### Scenario: Tài khoản Kinh doanh mới
- **WHEN** Giám đốc tạo tài khoản `thuyvy` vai trò Kinh doanh không chọn phạm vi
- **THEN** `thuyvy` có phạm vi Cả hai

#### Scenario: Vai trò khác không có ô phạm vi
- **WHEN** Giám đốc mở form sửa tài khoản `thuha` (Kế toán)
- **THEN** form không có ô "Phạm vi hợp đồng"

#### Scenario: Người không phải Giám đốc đổi phạm vi
- **WHEN** `quocbao` gửi lệnh đổi phạm vi hợp đồng của chính mình thành Cả hai
- **THEN** API trả 403 và phạm vi không đổi
