## Purpose

Bảo vệ tài khoản Giám đốc và Kế toán bằng lớp thứ hai ngoài mật khẩu: mã 6 số từ ứng dụng trên điện thoại, mã dự phòng và quy trình khi mất điện thoại.

## ADDED Requirements

### Requirement: Giám đốc và Kế toán bắt buộc bật xác thực 2 lớp
Tài khoản vai trò `DIRECTOR` hoặc `ACCOUNTANT` chưa bật xác thực 2 lớp SHALL chỉ mở được `/two-factor`: mọi trang khác SHALL chuyển về `/two-factor`, mọi API (trừ API của chính bước bật và đăng xuất) SHALL trả 403 với "Cần bật xác thực 2 lớp trước khi tiếp tục". Điều kiện SHALL đọc từ dữ liệu hiện tại ở mỗi yêu cầu. Khi còn phải đổi mật khẩu tạm, việc đổi mật khẩu SHALL làm trước. Vai trò khác SHALL không bị yêu cầu.

#### Scenario: Giám đốc chưa bật mở Tổng quan
- **WHEN** `minhanh` (`DIRECTOR`, đã đổi mật khẩu, chưa bật 2 lớp) mở `/dashboard`
- **THEN** hệ thống chuyển tới `/two-factor`

#### Scenario: Giám đốc chưa bật gọi API
- **WHEN** `minhanh` chưa bật 2 lớp gửi `GET /api/users`
- **THEN** API trả 403 với "Cần bật xác thực 2 lớp trước khi tiếp tục"

#### Scenario: Mật khẩu tạm làm trước
- **WHEN** `minhanh` vừa được tạo bằng lệnh, đăng nhập bằng mật khẩu tạm và mở `/two-factor`
- **THEN** hệ thống chuyển tới `/change-password`; đổi xong mới vào `/two-factor`

#### Scenario: Kế toán chưa bật mở Công nợ
- **WHEN** `thuha` (`ACCOUNTANT`, đã đổi mật khẩu, chưa bật 2 lớp) mở trang Công nợ
- **THEN** hệ thống chuyển tới `/two-factor`

#### Scenario: Kinh doanh không bị hỏi
- **WHEN** `quocbao` (`SALES`, chưa bật 2 lớp) đăng nhập đúng mật khẩu
- **THEN** hệ thống chuyển tới `/dashboard`, không hỏi mã

#### Scenario: Được đổi sang vai trò Giám đốc
- **WHEN** `lanphuong` đang dùng hệ thống và được đổi vai trò từ `SALES` sang `DIRECTOR`
- **THEN** ở lần tải trang kế tiếp `lanphuong` bị chuyển tới `/two-factor`

### Requirement: Bản demo không dùng xác thực 2 lớp
Khi `DEMO_MODE=true`, hệ thống SHALL không yêu cầu bật xác thực 2 lớp và SHALL từ chối yêu cầu bật với "Bản demo không dùng xác thực 2 lớp".

#### Scenario: Bản demo
- **GIVEN** hệ thống chạy với `DEMO_MODE=true`
- **WHEN** `giamdoc` đăng nhập đúng mật khẩu và gửi yêu cầu bật 2 lớp
- **THEN** `giamdoc` vào `/dashboard` không cần mã **AND** yêu cầu bật trả 400 với "Bản demo không dùng xác thực 2 lớp"

### Requirement: Bật xác thực 2 lớp
Người dùng thuộc vai trò bắt buộc SHALL bật xác thực 2 lớp qua ba bước: nhập lại mật khẩu; thêm tài khoản vào ứng dụng tạo mã bằng mã QR hoặc chuỗi bí mật gõ tay; nhập đúng một mã 6 số. Hệ thống SHALL chỉ coi là đã bật sau khi mã đúng. Bỏ dở SHALL giữ nguyên trạng thái chưa bật. Bật xong, mọi phiên khác của tài khoản SHALL kết thúc và phiên đang dùng SHALL còn hiệu lực.

#### Scenario: Bật thành công
- **WHEN** `minhanh` nhập đúng mật khẩu, quét mã QR và nhập đúng mã `492817`
- **THEN** 2 lớp được bật **AND** màn hình hiện 10 mã dự phòng **AND** `minhanh` mở được `/dashboard`

#### Scenario: Sai mật khẩu ở bước đầu
- **WHEN** `minhanh` nhập sai mật khẩu ở bước đầu
- **THEN** hệ thống báo "Mật khẩu hiện tại không đúng" và không hiện mã QR

#### Scenario: Sai mã khi xác nhận
- **WHEN** `minhanh` đã quét mã QR nhưng nhập mã sai `000000`
- **THEN** hệ thống báo "Mã xác thực không đúng" **AND** 2 lớp vẫn chưa bật

#### Scenario: Bỏ dở rồi làm lại
- **WHEN** `minhanh` tới bước quét mã QR rồi đóng trình duyệt, hôm sau đăng nhập lại
- **THEN** đăng nhập không hỏi mã **AND** `/two-factor` bắt đầu lại với bí mật mới

#### Scenario: Phiên mở từ trước khi bật
- **WHEN** `minhanh` đang đăng nhập trên máy tính và điện thoại, rồi bật 2 lớp trên máy tính
- **THEN** máy tính dùng tiếp **AND** thao tác tiếp theo trên điện thoại bị chuyển tới `/login`

### Requirement: Đăng nhập hai bước
Với tài khoản đã bật xác thực 2 lớp, trên thiết bị chưa được tin, đúng mật khẩu SHALL chuyển `/login` sang ô nhập mã và SHALL chưa tạo phiên đăng nhập. Chỉ khi nhập đúng mã 6 số hoặc mã dự phòng, hệ thống mới tạo phiên, ghi lần đăng nhập gần nhất và áp dụng lựa chọn "Giữ đăng nhập" đã chọn ở bước mật khẩu. Bước nhập mã SHALL hết hạn sau 10 phút. Tài khoản bị khóa hoặc mật khẩu tạm hết hạn SHALL bị từ chối ngay ở bước mật khẩu như quy tắc hiện có.

#### Scenario: Đúng mật khẩu, chưa nhập mã
- **WHEN** `minhanh` (đã bật 2 lớp) nhập đúng mật khẩu lúc 08:00 rồi mở thẳng `/dashboard`
- **THEN** hệ thống chuyển tới `/login` vì chưa có phiên đăng nhập

#### Scenario: Nhập đúng mã
- **WHEN** `minhanh` nhập đúng mật khẩu rồi nhập đúng mã 6 số từ ứng dụng
- **THEN** hệ thống tạo phiên và chuyển tới `/dashboard`

#### Scenario: Không giữ đăng nhập
- **WHEN** `minhanh` không tick "Giữ đăng nhập", nhập đúng mật khẩu và mã lúc 08:00
- **THEN** lúc 20:01 cùng ngày, thao tác tiếp theo bị chuyển tới `/login`

#### Scenario: Quá 10 phút mới nhập mã
- **WHEN** `minhanh` nhập đúng mật khẩu lúc 08:00 và nhập đúng mã lúc 08:11
- **THEN** hệ thống báo "Phiên nhập mã đã hết hạn. Đăng nhập lại" và form về bước mật khẩu, không tạo phiên

#### Scenario: Giám đốc đã bị khóa
- **WHEN** `minhanh` (đã bật 2 lớp, Đã khóa) nhập đúng mật khẩu
- **THEN** đăng nhập bị từ chối với "Tài khoản đã bị khóa. Liên hệ Giám đốc" và không hỏi mã

#### Scenario: Ô nhập mã dễ dùng
- **WHEN** form chuyển sang bước nhập mã trên điện thoại
- **THEN** ô nhập hiện bàn phím số, có gợi ý tự điền mã một lần **AND** có liên kết "Dùng mã dự phòng"

### Requirement: Tin thiết bị 30 ngày
Ở bước nhập mã 6 số, người dùng SHALL chọn được "Tin thiết bị này 30 ngày", mặc định không chọn. Trên thiết bị đã tin, đúng mật khẩu SHALL đăng nhập luôn, không hỏi mã. Hạn 30 ngày SHALL tính lại sau mỗi lần đăng nhập trên thiết bị đó. Mật khẩu SHALL luôn bắt buộc. Đăng nhập bằng mã dự phòng SHALL không tin được thiết bị.

#### Scenario: Tin máy văn phòng
- **WHEN** `thuha` đăng nhập đúng mật khẩu và mã ngày 01/11/2026, có chọn "Tin thiết bị này 30 ngày", rồi đăng xuất và đăng nhập lại ngày 10/11/2026 trên máy đó
- **THEN** đúng mật khẩu là vào `/dashboard`, không hỏi mã

#### Scenario: Máy đã tin vẫn cần mật khẩu
- **WHEN** ai đó dùng máy đã tin của `thuha` và nhập sai mật khẩu
- **THEN** trang hiện "Tên đăng nhập hoặc mật khẩu không đúng", không tạo phiên

#### Scenario: Quá 30 ngày không đăng nhập
- **WHEN** `thuha` tin máy ngày 01/11/2026 và đăng nhập lại trên máy đó ngày 02/12/2026
- **THEN** đúng mật khẩu vẫn phải nhập mã

#### Scenario: Đăng nhập đều đặn
- **WHEN** `thuha` tin máy ngày 01/11/2026 và đăng nhập trên máy đó ngày 25/11/2026, rồi ngày 20/12/2026
- **THEN** cả hai lần không hỏi mã

#### Scenario: Máy khác vẫn hỏi mã
- **WHEN** `thuha` đã tin máy văn phòng và đăng nhập từ điện thoại chưa tin
- **THEN** đúng mật khẩu vẫn phải nhập mã

#### Scenario: Không chọn tin
- **WHEN** `minhanh` nhập đúng mã, không chọn ô, rồi đăng xuất và đăng nhập lại trên máy đó
- **THEN** đúng mật khẩu vẫn phải nhập mã

#### Scenario: Mã dự phòng không tin được máy
- **WHEN** `minhanh` đăng nhập bằng mã dự phòng
- **THEN** màn nhập mã dự phòng không có ô tin thiết bị **AND** lần đăng nhập sau trên máy đó vẫn phải nhập mã

### Requirement: Thu hồi thiết bị đã tin
Hệ thống SHALL hủy mọi thiết bị đã tin của một tài khoản khi người dùng bấm "Quên mọi thiết bị đã tin", đổi mật khẩu, được đặt lại mật khẩu, đổi điện thoại, hoặc khi lệnh cứu hộ chạy. `/two-factor` SHALL hiện số thiết bị đang được tin.

#### Scenario: Mất máy tính xách tay
- **WHEN** `thuha` có 2 máy đã tin và bấm "Quên mọi thiết bị đã tin" từ máy thứ ba
- **THEN** lần đăng nhập sau trên cả 2 máy đều phải nhập mã **AND** `/two-factor` hiện "Đang tin 0 thiết bị"

#### Scenario: Đổi mật khẩu
- **WHEN** `minhanh` có 1 máy đã tin rồi đổi mật khẩu
- **THEN** lần đăng nhập sau trên máy đó phải nhập mã

#### Scenario: Đổi điện thoại
- **WHEN** `minhanh` có 2 máy đã tin rồi đổi điện thoại và bật lại xong
- **THEN** lần đăng nhập sau trên cả 2 máy đều phải nhập mã

#### Scenario: Lệnh cứu hộ
- **WHEN** quản trị chạy lệnh tắt xác thực 2 lớp của `thuha` rồi `thuha` bật lại
- **THEN** các máy đã tin trước đó đều phải nhập mã

### Requirement: Giới hạn nhập sai mã theo tài khoản
Ngoài quy tắc tạm khóa theo tên đăng nhập và địa chỉ IP, sau 10 lần sai mã liên tiếp trên một tài khoản, từ bất kỳ địa chỉ IP nào, hệ thống SHALL từ chối mọi lần nhập mã của tài khoản đó trong 15 phút với thông báo tạm khóa. Nhập đúng mã SHALL đưa bộ đếm này về 0. Bước nhập mã SHALL dùng chung giới hạn 20 lần gọi mỗi phút theo địa chỉ IP với đăng nhập.

#### Scenario: Dò mã từ nhiều địa chỉ IP
- **WHEN** kẻ gian có mật khẩu của `minhanh` nhập sai mã 10 lần liên tiếp từ 3 địa chỉ IP khác nhau lúc 08:00–08:05
- **THEN** lúc 08:06, mã đúng từ địa chỉ IP thứ tư vẫn bị từ chối với thông báo tạm khóa

#### Scenario: Hết thời gian khóa theo tài khoản
- **WHEN** lần sai mã thứ 10 của `minhanh` lúc 08:05 và `minhanh` nhập đúng mã lúc 08:21
- **THEN** đăng nhập thành công và bộ đếm về 0

### Requirement: Mã đã dùng không dùng lại được
Một mã 6 số đã được gửi để đăng nhập cho một tài khoản SHALL không được chấp nhận lại cho tài khoản đó trong 120 giây, kể cả khi mã còn trong thời gian hiệu lực. Lần gửi lại SHALL bị coi là nhập sai mã.

#### Scenario: Kẻ gian dùng lại mã vừa nhìn thấy
- **WHEN** `minhanh` đăng nhập bằng mã `492817` lúc 08:00:05 và một trình duyệt khác đã qua bước mật khẩu gửi lại `492817` lúc 08:00:20
- **THEN** lần gửi lại nhận "Mã xác thực không đúng" và không tạo phiên

### Requirement: Mã dự phòng
Khi bật xác thực 2 lớp, hệ thống SHALL tạo 10 mã dự phòng dạng `XXXX-XXXX-XXXX-XXXX` và hiện đúng một lần. Hệ thống SHALL chỉ lưu dạng băm, SHALL không có cách xem lại. Khi gõ, mã SHALL không phân biệt hoa thường và bỏ qua dấu gạch, khoảng trắng. Mỗi mã SHALL dùng được đúng một lần, kể cả khi hai yêu cầu gửi cùng lúc. Người dùng SHALL tạo lại được bộ mã mới sau khi nhập mật khẩu; bộ cũ SHALL mất hiệu lực ngay. `/two-factor` SHALL hiện số mã còn lại.

#### Scenario: Hiện một lần
- **WHEN** `minhanh` bật 2 lớp xong, xem 10 mã, rồi tải lại `/two-factor`
- **THEN** trang chỉ hiện "Còn 10 mã dự phòng", không hiện lại mã nào

#### Scenario: Dùng một mã
- **WHEN** `minhanh` mất điện thoại tạm thời và đăng nhập bằng mã dự phòng `7KQ2-M9XA-P4TR-H6ZD`
- **THEN** đăng nhập thành công **AND** `/two-factor` hiện "Còn 9 mã dự phòng"

#### Scenario: Dùng lại mã đã dùng
- **WHEN** ai đó nhập lại `7KQ2-M9XA-P4TR-H6ZD` lần thứ hai
- **THEN** hệ thống báo "Mã xác thực không đúng" và không tạo phiên

#### Scenario: Gõ chữ thường không gạch
- **WHEN** `minhanh` gõ `3jw8 r2nb f7vc q5ky` cho mã `3JW8-R2NB-F7VC-Q5KY` còn hiệu lực
- **THEN** mã được chấp nhận

#### Scenario: Tạo lại bộ mã
- **WHEN** `minhanh` còn 4 mã, nhập đúng mật khẩu và tạo lại bộ mã
- **THEN** màn hình hiện 10 mã mới một lần **AND** 4 mã cũ không dùng được nữa

### Requirement: Đổi điện thoại
Người dùng đã bật xác thực 2 lớp SHALL đổi được thiết bị tại `/two-factor` sau khi nhập mật khẩu và một mã 6 số hoặc mã dự phòng còn hiệu lực. Đổi xong, bí mật cũ và toàn bộ mã dự phòng cũ SHALL mất hiệu lực, mọi phiên khác SHALL kết thúc và người dùng SHALL phải bật lại trước khi làm việc tiếp.

#### Scenario: Đổi sang điện thoại mới
- **WHEN** `minhanh` nhập đúng mật khẩu và mã hiện tại rồi bấm "Đổi điện thoại"
- **THEN** ứng dụng cũ không còn tạo được mã hợp lệ **AND** `/two-factor` bắt đầu bước bật với bí mật mới

#### Scenario: Sai mã khi đổi
- **WHEN** `minhanh` nhập đúng mật khẩu nhưng sai mã `000000`
- **THEN** hệ thống báo "Mã xác thực không đúng" và 2 lớp giữ nguyên

### Requirement: Cứu hộ khi mất điện thoại bằng lệnh
Hệ thống SHALL có lệnh dòng lệnh chạy trên máy có quyền vào cơ sở dữ liệu để tắt xác thực 2 lớp của một tài khoản theo tên đăng nhập. Lệnh SHALL xóa bí mật và mã dự phòng, kết thúc mọi phiên của tài khoản, gỡ tạm khóa và ghi nhật ký trong cùng một giao dịch. Lần đăng nhập sau, người đó SHALL phải bật lại nếu vai trò bắt buộc. Tên không tồn tại hoặc tài khoản chưa bật SHALL được báo rõ và không đổi gì. Quy trình xác minh người yêu cầu SHALL nằm trong tài liệu vận hành.

#### Scenario: Giám đốc mất điện thoại và mã dự phòng
- **WHEN** quản trị chạy `npm run auth:reset-2fa -- --username minhanh`
- **THEN** 2 lớp của `minhanh` tắt **AND** mọi máy của `minhanh` phải đăng nhập lại **AND** nhật ký có dòng "Tắt xác thực 2 lớp bằng lệnh cứu hộ"

#### Scenario: Sai tên đăng nhập
- **WHEN** quản trị chạy lệnh với `--username khongco`
- **THEN** lệnh báo không tìm thấy tài khoản, thoát mã khác 0 và không đổi gì

#### Scenario: Gỡ tạm khóa do nhập sai mã
- **WHEN** `minhanh` nhập sai mã 10 lần liên tiếp và quản trị chạy `npm run auth:unlock -- --username minhanh`
- **THEN** `minhanh` nhập đúng mã thì đăng nhập được ngay, không phải chờ 15 phút

### Requirement: Cờ Admin hệ thống
Mỗi tài khoản SHALL có cờ Admin hệ thống, mặc định tắt, không đổi vai trò của tài khoản. Cờ SHALL chỉ đặt và gỡ được bằng lệnh dòng lệnh, có ghi nhật ký. Tài khoản có cờ SHALL bắt buộc bật xác thực 2 lớp như Giám đốc, kể cả khi vai trò không bắt buộc, và SHALL mở được `/two-factor`. Cờ SHALL đọc từ dữ liệu hiện tại ở mỗi yêu cầu.

#### Scenario: Đặt cờ bằng lệnh
- **WHEN** quản trị chạy `npm run auth:set-admin -- --username quocbao`
- **THEN** `quocbao` có cờ, vai trò vẫn `SALES` **AND** lần tải trang kế tiếp `quocbao` bị chuyển tới `/two-factor` nếu chưa bật

#### Scenario: Gỡ cờ
- **WHEN** quản trị chạy `npm run auth:set-admin -- --username quocbao --off`
- **THEN** `quocbao` không còn thấy mục "Gỡ xác thực 2 lớp" ở lần tải kế tiếp

#### Scenario: Không tự đặt được trên giao diện
- **WHEN** `minhanh` (Giám đốc, không có cờ) mở D17
- **THEN** D17 không có chỗ nào đặt cờ Admin hệ thống

### Requirement: Admin gỡ xác thực 2 lớp cho người khác
Tài khoản có cờ Admin hệ thống SHALL gỡ được xác thực 2 lớp của tài khoản khác trên D17, sau khi nhập lại mật khẩu và một mã của chính mình. Kết quả SHALL giống lệnh cứu hộ: xóa bí mật, mã dự phòng và thiết bị đã tin, kết thúc mọi phiên, gỡ tạm khóa, ghi nhật ký. Tài khoản không có cờ SHALL nhận 403, kể cả Giám đốc. Admin SHALL không gỡ được cho chính mình.

#### Scenario: Admin gỡ cho Kế toán mất điện thoại
- **WHEN** `quocbao` (có cờ) mở D17, chọn "Gỡ xác thực 2 lớp" ở dòng `thuha`, nhập đúng mật khẩu và mã của mình
- **THEN** 2 lớp của `thuha` tắt **AND** mọi máy của `thuha` phải đăng nhập lại **AND** lần đăng nhập sau `thuha` phải bật lại

#### Scenario: Giám đốc không có cờ
- **WHEN** `minhanh` (Giám đốc, không có cờ) gửi `POST /api/users/<id của thuha>/two-factor/reset`
- **THEN** API trả 403 với "Bạn không có quyền thực hiện thao tác này" và 2 lớp của `thuha` giữ nguyên

#### Scenario: Sai mã của admin
- **WHEN** `quocbao` nhập đúng mật khẩu nhưng sai mã `000000`
- **THEN** hệ thống báo "Mã xác thực không đúng" và 2 lớp của `thuha` giữ nguyên

#### Scenario: Gỡ cho chính mình
- **WHEN** `quocbao` gửi yêu cầu gỡ cho chính tài khoản `quocbao`
- **THEN** API trả 400 với "Không gỡ được cho chính bạn. Dùng Đổi điện thoại"

#### Scenario: Tài khoản chưa bật
- **WHEN** `quocbao` gửi yêu cầu gỡ cho `vantung` chưa bật 2 lớp
- **THEN** API trả 409 với "Tài khoản này chưa bật xác thực 2 lớp"

### Requirement: Không mở thao tác 2 lớp ngoài các lối của hệ thống
Các đường dẫn xác thực 2 lớp của thư viện đăng nhập dưới `/api/auth/` SHALL không gọi được từ trình duyệt. Mọi thao tác 2 lớp SHALL đi qua màn hình và API của hệ thống để luôn áp dụng giới hạn nhập sai, kiểm tra quyền và ghi nhật ký.

#### Scenario: Gọi thẳng route thư viện
- **WHEN** khách gửi `POST /api/auth/two-factor/verify-totp` với mã bất kỳ
- **THEN** yêu cầu nhận 404 và không có phiên nào được tạo

### Requirement: Bí mật và mã không bị lộ
Bí mật của ứng dụng tạo mã SHALL được mã hóa khi lưu. Bí mật, mã 6 số và mã dự phòng SHALL không xuất hiện trong nhật ký thao tác, log ứng dụng hay URL. Phản hồi có bí mật hoặc mã dự phòng SHALL có `Cache-Control: no-store`.

#### Scenario: Xem dữ liệu sau khi bật
- **WHEN** `minhanh` bật 2 lớp xong và đọc bảng lưu xác thực 2 lớp trong cơ sở dữ liệu
- **THEN** cột bí mật không chứa chuỗi bí mật gốc **AND** cột mã dự phòng không chứa mã gốc nào

#### Scenario: Phản hồi bước bật
- **WHEN** `minhanh` gửi yêu cầu bắt đầu bật với mật khẩu đúng
- **THEN** phản hồi có `Cache-Control: no-store`
