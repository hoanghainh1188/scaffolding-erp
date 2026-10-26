# app-shell Specification

## Purpose

Khung giao diện chung của hệ thống: layout Desktop cho văn phòng và layout Mobile PWA cho thủ kho, xưởng. Mọi màn hình D1..D17, M1..M8 nằm trong một trong hai khung này.

## Requirements

### Requirement: Hai khu giao diện tách biệt theo đường dẫn
Hệ thống SHALL phục vụ giao diện Desktop ở các đường dẫn gốc (`/...`) và giao diện Mobile ở các đường dẫn bắt đầu bằng `/m`. Trang `/` SHALL chuyển tới trang Tổng quan của Desktop.

#### Scenario: Mở trang gốc
- **WHEN** người dùng mở `/`
- **THEN** hệ thống chuyển tới `/dashboard` và hiển thị layout Desktop

#### Scenario: Mở khu Mobile
- **WHEN** người dùng mở `/m`
- **THEN** hệ thống hiển thị layout Mobile với tab "Việc hôm nay" đang được chọn

### Requirement: Khu Mobile mở cho mọi vai trò
Mọi vai trò SHALL mở được khu Mobile (`/m`), kể cả vai trò dùng Desktop. Hệ thống SHALL không chuyển vai trò Desktop ra khỏi `/m`.

#### Scenario: Giám đốc mở khu Mobile
- **WHEN** người dùng có vai trò `DIRECTOR` mở `/m/history`
- **THEN** hệ thống hiển thị layout Mobile với tab "Lịch sử" đang được chọn, không chuyển sang Desktop

#### Scenario: Kế toán mở khu Mobile trên điện thoại
- **WHEN** người dùng có vai trò `ACCOUNTANT` mở `/m` ở màn hình rộng 375px
- **THEN** hệ thống hiển thị layout Mobile với 4 tab dưới đáy

### Requirement: Sidebar Desktop có 9 mục menu
Layout Desktop SHALL có sidebar cố định bên trái, nền sáng (token `card`, viền `border`), gồm logo và các mục theo thứ tự: Tổng quan, Thu mua, Kho, Sửa chữa, Bán & Thuê, Công nợ, Báo cáo, Danh mục, Cài đặt. Mục ứng với trang đang mở SHALL có nền token `accent`.

#### Scenario: Làm nổi bật mục đang mở
- **WHEN** người dùng (vai trò Giám đốc) đang ở `/inventory`
- **THEN** sidebar hiện đủ 9 mục và chỉ mục "Kho" ở trạng thái đang chọn với nền `accent`
- **AND** mục đang chọn được đánh dấu cho trình đọc màn hình (`aria-current="page"`)

### Requirement: Menu Desktop lọc theo vai trò
Sidebar SHALL chỉ hiện các mục mà vai trò của người dùng hiện tại được phép xem. Việc ẩn mục menu chỉ để giao diện gọn, không thay cho kiểm tra quyền phía server.

#### Scenario: Kinh doanh không thấy Công nợ, Báo cáo, Cài đặt
- **WHEN** người dùng có vai trò `SALES` mở layout Desktop
- **THEN** sidebar hiện 6 mục: Tổng quan, Thu mua, Kho, Sửa chữa, Bán & Thuê, Danh mục
- **AND** không hiện Công nợ, Báo cáo, Cài đặt

#### Scenario: Kế toán thấy Công nợ nhưng không thấy Cài đặt
- **WHEN** người dùng có vai trò `ACCOUNTANT` mở layout Desktop
- **THEN** sidebar hiện mục Công nợ
- **AND** không hiện mục Báo cáo và Cài đặt

#### Scenario: Giám đốc thấy tất cả
- **WHEN** người dùng có vai trò `DIRECTOR` mở layout Desktop
- **THEN** sidebar hiện đủ 9 mục

#### Scenario: Vai trò chỉ dùng Mobile mở Desktop
- **WHEN** người dùng có vai trò `WAREHOUSE` hoặc `WORKSHOP` mở một trang Desktop
- **THEN** hệ thống chuyển người dùng tới `/m`

### Requirement: Sidebar theo cỡ màn hình
Sidebar SHALL đổi theo bề rộng cửa sổ khi người dùng chưa tự chọn: dưới 1024px ẩn thành ngăn trượt mở bằng nút menu; 1024–1279px thu gọn chỉ còn biểu tượng; từ 1280px mở rộng. Người dùng SHALL tự thu gọn/mở rộng được; lựa chọn đó được nhớ trên trình duyệt và thắng mặc định ở mọi bề rộng từ 1024px. Dưới 1024px luôn là ngăn trượt.

#### Scenario: Mặc định ở 1366px
- **WHEN** người dùng chưa từng tự chọn và mở `/dashboard` ở cửa sổ 1366px
- **THEN** sidebar mở rộng, hiện đủ tên mục

#### Scenario: Mặc định ở 1100px
- **WHEN** người dùng chưa từng tự chọn và mở `/dashboard` ở cửa sổ 1100px
- **THEN** sidebar chỉ hiện biểu tượng, rê chuột vào biểu tượng thấy tên mục

#### Scenario: Ngăn trượt ở 768px
- **WHEN** cửa sổ trình duyệt rộng 768px
- **THEN** sidebar không chiếm chỗ trên trang
- **AND** bấm nút menu ở header thì sidebar trượt ra phía trên nội dung, bấm ra ngoài hoặc phím Esc thì đóng

#### Scenario: Lựa chọn của người dùng được nhớ
- **WHEN** ở cửa sổ 1366px người dùng bấm thu gọn sidebar rồi tải lại trang
- **THEN** sidebar vẫn chỉ hiện biểu tượng

#### Scenario: Lựa chọn thắng mặc định ở dải giữa
- **WHEN** ở cửa sổ 1100px người dùng bấm mở rộng sidebar, rồi tải lại trang ở cùng bề rộng
- **THEN** sidebar vẫn mở rộng

#### Scenario: Dưới 1024px bỏ qua lựa chọn
- **WHEN** người dùng đã chọn mở rộng, rồi thu cửa sổ còn 900px
- **THEN** sidebar là ngăn trượt đang đóng

### Requirement: Nền tảng và trình duyệt hỗ trợ
Nền tảng chính là Windows 10/11 + Microsoft Edge. Hệ thống SHALL hỗ trợ đầy đủ Chrome và Edge bản mới trên Windows, macOS, Ubuntu (và Chrome trên Android). Safari và Firefox bản mới (gồm Safari trên iPhone) được hỗ trợ cơ bản: mọi trang SHALL mở được, dùng được và không cuộn ngang; khác biệt nhỏ về hiển thị được chấp nhận.

#### Scenario: Edge trên Windows
- **WHEN** Giám đốc mở `/dashboard` trên Edge, Windows 11, cửa sổ 1366×768
- **THEN** mọi phần của layout Desktop hiển thị và hoạt động đúng

#### Scenario: Firefox hỗ trợ cơ bản
- **WHEN** Kế toán mở `/dashboard` trên Firefox bản mới
- **THEN** trang hiện đủ sidebar, header, nội dung, không có lỗi chặn thao tác và không cuộn ngang

#### Scenario: Safari trên iPhone hỗ trợ cơ bản
- **WHEN** thủ kho mở `/m` trên Safari của iPhone
- **THEN** 4 tab dưới đáy bấm được và trang không cuộn ngang

### Requirement: Trang không cuộn ngang ở các cỡ màn hình chuẩn
Ở các bề rộng 360, 375, 768, 1024, 1280, 1366px, mọi trang của khu Desktop và khu Mobile SHALL không có thanh cuộn ngang ở mức trang: bề rộng nội dung trang không vượt bề rộng cửa sổ. Nội dung rộng (như bảng) cuộn trong khung riêng của nó.

#### Scenario: Desktop ở 1280px
- **WHEN** Kế toán mở `/inventory` ở cửa sổ 1280×720
- **THEN** bề rộng cuộn của trang (`scrollWidth`) không lớn hơn bề rộng cửa sổ (`innerWidth`)

#### Scenario: Mobile ở 360px
- **WHEN** thủ kho mở `/m` trên điện thoại rộng 360px
- **THEN** bề rộng cuộn của trang không lớn hơn 360px

### Requirement: Header Desktop
Layout Desktop SHALL có header gồm ô tìm kiếm, nút tạo nhanh, nút thông báo và khu thông tin người dùng (tên, vai trò bằng tiếng Việt). Ô tìm kiếm, nút tạo nhanh và thông báo ở change này chỉ là chỗ hiển thị, chưa có chức năng.

#### Scenario: Hiện vai trò bằng tiếng Việt
- **WHEN** người dùng có vai trò `ACCOUNTANT` mở layout Desktop
- **THEN** khu thông tin người dùng hiện chữ "Kế toán"

### Requirement: Header gọn trên màn hẹp
Dưới 768px, ô tìm kiếm trên header SHALL thu thành một nút biểu tượng kính lúp có nhãn cho trình đọc màn hình. Ở mọi bề rộng, các phần của header SHALL không tràn ra ngoài cửa sổ.

#### Scenario: Header ở 375px
- **WHEN** người dùng mở `/dashboard` ở cửa sổ 375px
- **THEN** header hiện nút menu, nút tìm kiếm dạng biểu tượng có nhãn "Tìm kiếm" thay cho ô nhập, và khu người dùng
- **AND** không phần nào của header nằm ngoài bề rộng 375px

#### Scenario: Header ở 1024px
- **WHEN** người dùng mở `/dashboard` ở cửa sổ 1024px
- **THEN** header hiện ô tìm kiếm đầy đủ

### Requirement: Thanh điều hướng Mobile 4 tab
Layout Mobile SHALL có thanh điều hướng cố định ở đáy với 4 tab: Việc hôm nay (`/m`), Quét mã (`/m/scan`), Lịch sử (`/m/history`), Cá nhân (`/m/profile`). Mỗi tab SHALL có vùng bấm cao tối thiểu 48px. Tab đang chọn SHALL có nền token `accent` bo tròn dạng viên thuốc.

#### Scenario: Chuyển tab
- **WHEN** thủ kho bấm tab "Lịch sử"
- **THEN** hệ thống mở `/m/history` và tab "Lịch sử" ở trạng thái đang chọn với nền `accent`

### Requirement: Khu Mobile trên màn rộng
Trên cửa sổ rộng hơn 640px, nội dung khu Mobile và thanh điều hướng dưới đáy SHALL rộng tối đa 640px và căn giữa.

#### Scenario: Mở /m trên màn hình 1366px
- **WHEN** Giám đốc mở `/m` ở cửa sổ 1366px
- **THEN** nội dung và thanh 4 tab rộng 640px, nằm giữa màn hình

#### Scenario: Mở /m trên điện thoại 375px
- **WHEN** thủ kho mở `/m` trên điện thoại rộng 375px
- **THEN** nội dung và thanh 4 tab chiếm hết bề rộng 375px

### Requirement: Chừa vùng an toàn và chiều cao động trên điện thoại
Thanh điều hướng dưới đáy và app bar SHALL chừa vùng an toàn của thiết bị (tai thỏ, thanh vuốt về màn hình chính). Chiều cao khu Mobile SHALL theo chiều cao nhìn thấy thực tế của trình duyệt, để thanh dưới đáy không bị thanh địa chỉ đẩy khuất.

#### Scenario: iPhone có thanh vuốt
- **WHEN** thủ kho mở `/m` trên iPhone có thanh vuốt ở cạnh dưới (vùng an toàn dưới 34px)
- **THEN** các tab nằm trên vùng an toàn, thanh vuốt không đè lên tab nào

#### Scenario: Thanh địa chỉ thu lại
- **WHEN** thủ kho cuộn trang `/m` làm thanh địa chỉ của trình duyệt thu lại hoặc hiện ra
- **THEN** thanh 4 tab luôn nằm sát mép dưới vùng nhìn thấy

### Requirement: Ô đang nhập không bị bàn phím ảo che
Trong khu Mobile, khi một ô nhập được chọn và bàn phím ảo mở ra, ô đó SHALL được tự cuộn vào vùng nhìn thấy, không nằm dưới bàn phím.

#### Scenario: Ô ở cuối trang
- **WHEN** thủ kho chạm vào ô nhập số lượng ở cuối danh sách và bàn phím ảo mở ra
- **THEN** trang cuộn để ô đó nằm trong vùng nhìn thấy phía trên bàn phím

### Requirement: App bar Mobile
Layout Mobile SHALL có app bar ở đầu trang hiện tên trang, chừa vùng an toàn phía trên. Trang chi tiết SHALL có nút quay lại trong app bar.

#### Scenario: Trang chi tiết có nút quay lại
- **WHEN** một trang Mobile khai báo là trang chi tiết với tiêu đề "Phiếu nhập"
- **THEN** app bar hiện chữ "Phiếu nhập" và nút quay lại
- **AND** bấm nút quay lại thì trở về trang trước

### Requirement: Thanh báo mất kết nối trên Mobile
Layout Mobile SHALL hiện thanh báo "Mất kết nối" ở đầu màn hình khi trình duyệt mất mạng và SHALL tự ẩn khi có mạng lại.

#### Scenario: Mất mạng rồi có lại
- **WHEN** thiết bị đang mở `/m` thì mất mạng
- **THEN** thanh báo "Mất kết nối" xuất hiện ở đầu màn hình
- **AND** khi có mạng lại thì thanh báo biến mất

### Requirement: Cài đặt PWA
Hệ thống SHALL cung cấp web app manifest để cài khu Mobile lên màn hình chính: tên "Scaffolding ERP", tên ngắn "Kho", trang mở đầu `/m`, chế độ `standalone`, màu chủ đạo là token `primary` (chế độ Sáng) và biểu tượng cỡ 192px, 512px.

#### Scenario: Đọc manifest
- **WHEN** trình duyệt tải `/manifest.webmanifest`
- **THEN** nhận được manifest có `start_url` là `/m`, `display` là `standalone`, `theme_color` là `#1D5BFF` và hai biểu tượng 192×192, 512×512

### Requirement: Trang giữ chỗ cho mục chưa làm
Mỗi mục menu Desktop và mỗi tab Mobile SHALL mở được một trang có tiêu đề đúng tên mục và dòng chữ "Đang xây dựng", thay vì lỗi 404. Tiêu đề trang SHALL dùng họ chữ `display` của Bright Blue Base.

#### Scenario: Mở mục chưa làm
- **WHEN** Giám đốc bấm mục "Báo cáo" trên sidebar
- **THEN** trang hiện tiêu đề "Báo cáo" và chữ "Đang xây dựng"

### Requirement: Người dùng giả lập trước khi có đăng nhập
Cho tới khi có chức năng đăng nhập, hệ thống SHALL lấy người dùng hiện tại từ cấu hình giả lập chỉ ở môi trường phát triển (mặc định vai trò `DIRECTOR`). Ở môi trường production, hệ thống SHALL từ chối dùng người dùng giả lập.

#### Scenario: Đổi vai trò giả lập
- **WHEN** môi trường dev cấu hình vai trò giả lập là `SALES`
- **THEN** layout Desktop hiện "Kinh doanh" ở khu người dùng và menu lọc theo vai trò `SALES`

#### Scenario: Production không có người dùng giả lập
- **WHEN** ứng dụng chạy ở chế độ production mà chưa có chức năng đăng nhập
- **THEN** hệ thống không dùng người dùng giả lập và báo lỗi cấu hình thay vì cho vào với vai trò `DIRECTOR`
