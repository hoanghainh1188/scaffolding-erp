## Purpose

Bảo vệ dữ liệu cá nhân của người bán theo Luật 91/2025/QH15, Nghị định 356/2025/NĐ-CP và PDPA Singapore: mã hóa số CCCD, quản lý khóa, ghi nhận thông báo, ẩn danh khi được yêu cầu, không để lộ qua log, seed, và có quy trình xử lý sự cố.

## ADDED Requirements

### Requirement: Số CCCD lưu mã hóa
Số CCCD SHALL được mã hóa bằng AES-256-GCM ở ứng dụng trước khi vào DB, với IV ngẫu nhiên cho mỗi lần mã hóa. Bản mã SHALL mang mã khóa đã dùng. Bản mã SHALL gắn với đúng bản ghi và đúng trường: chép bản mã sang người bán khác SHALL không giải mã được. DB SHALL không có số gốc ở bất kỳ cột nào của `supplier`, kể cả `search_text`. 4 số cuối SHALL lưu riêng để danh sách không phải giải mã.

#### Scenario: DB chỉ có bản mã
- **WHEN** Kế toán lưu người bán có CCCD `001203012345`
- **THEN** cột bản mã bắt đầu bằng `pii1.`, cột 4 số cuối là `2345` **AND** chuỗi `001203012345` không xuất hiện khi đọc cả dòng `supplier` dạng chữ

#### Scenario: Cùng số, bản mã khác nhau
- **WHEN** hai người bán cùng được lưu CCCD `001203012345`
- **THEN** hai bản mã khác nhau

#### Scenario: Chép bản mã sang người khác
- **WHEN** bản mã của `NCC-0004` bị chép đè sang dòng `NCC-0005` rồi mở form sửa `NCC-0005`
- **THEN** giải mã thất bại, API trả 500 với "Không đọc được số CCCD, báo quản trị" **AND** báo lỗi gửi mã lỗi **AND** phản hồi và báo lỗi không chứa bản mã hay số CCCD

#### Scenario: Danh sách không cần giải mã
- **WHEN** Thủ kho gọi `GET /api/catalog/suppliers` và người bán có CCCD `001203012345`
- **THEN** phản hồi có `•••• •••• 2345` mà không có thao tác giải mã nào được thực hiện

### Requirement: Khóa mã hóa theo từng công ty
Khóa SHALL nằm ở biến môi trường `PII_ENCRYPTION_KEYS`, dạng `<số>:<base64 của đúng 32 byte>`, nhiều khóa cách nhau bằng dấu phẩy, khóa đầu tiên dùng để mã hóa, mọi khóa dùng để giải mã. Mỗi công ty (mỗi DB và bản deploy) SHALL có khóa riêng. Ở `production`, thiếu biến hoặc biến sai dạng SHALL làm ứng dụng từ chối khởi động; thông báo nêu tên biến, không in giá trị.

#### Scenario: Production thiếu khóa
- **WHEN** khởi động bản production không có `PII_ENCRYPTION_KEYS`
- **THEN** ứng dụng không chạy, lỗi nêu `PII_ENCRYPTION_KEYS`

#### Scenario: Khóa sai độ dài
- **WHEN** `PII_ENCRYPTION_KEYS` là `1:` theo sau base64 của 16 byte
- **THEN** ứng dụng production không chạy **AND** thông báo không in lại giá trị đã cấu hình

#### Scenario: Trùng số khóa
- **WHEN** `PII_ENCRYPTION_KEYS` có hai khóa cùng số `1`
- **THEN** ứng dụng production không chạy, lỗi nêu `PII_ENCRYPTION_KEYS`

#### Scenario: Dev không có khóa
- **WHEN** chạy `npm run dev` không có biến này và không ai lưu CCCD
- **THEN** ứng dụng chạy bình thường **AND** lúc lưu CCCD mới báo thiếu `PII_ENCRYPTION_KEYS`

### Requirement: Lỗi giải mã không lộ dữ liệu
Sai khóa, thiếu khóa hoặc bản mã hỏng SHALL báo lỗi nêu loại lỗi và mã khóa, SHALL không chứa số gốc, bản mã hay giá trị khóa, kể cả trong log và báo lỗi.

#### Scenario: Thiếu khóa cũ
- **WHEN** bản mã dùng khóa số `1` nhưng `PII_ENCRYPTION_KEYS` chỉ có khóa số `2`
- **THEN** lỗi ghi "không có khóa số 1" **AND** không chứa bản mã

#### Scenario: Bản mã bị sửa
- **WHEN** một ký tự của bản mã bị đổi
- **THEN** giải mã báo lỗi xác thực, không trả về chuỗi sai

### Requirement: Đổi khóa
Lệnh đổi khóa SHALL mã hóa lại theo lô mọi bản mã chưa dùng khóa đầu tiên, cả số CCCD và gói hồ sơ thuế, chạy lại được nhiều lần cho cùng kết quả, không đổi `updated_at`, không ghi số gốc ra màn hình hay log. Trong lúc chuyển, ứng dụng SHALL đọc được cả bản mã khóa cũ và khóa mới. Có chế độ kiểm tra chỉ đếm số bản mã còn lại, mã thoát khác 0 khi còn.

#### Scenario: Đổi khóa
- **WHEN** có 250 bản mã khóa số `1`, `PII_ENCRYPTION_KEYS` là `2:...,1:...` và chạy lệnh đổi khóa với lô 100
- **THEN** cả 250 chuyển sang khóa số `2` **AND** form sửa vẫn hiện đúng số

#### Scenario: Đổi khóa gói hồ sơ thuế
- **WHEN** `NCC-0004` đã ẩn danh có gói hồ sơ thuế khóa số `1` và chạy lệnh đổi khóa
- **THEN** gói chuyển sang khóa số `2` **AND** nội dung giải mã không đổi

#### Scenario: Chạy lại
- **WHEN** chạy lại lệnh sau khi đã xong
- **THEN** 0 bản ghi bị đổi, mã thoát 0

#### Scenario: Dừng giữa chừng
- **WHEN** lệnh dừng sau 100 trên 250 bản mã rồi chạy lại
- **THEN** 150 bản còn lại được chuyển **AND** trong lúc đó form sửa đọc được cả hai loại

#### Scenario: Kiểm tra còn sót
- **WHEN** chạy chế độ kiểm tra khi còn 3 bản mã khóa cũ
- **THEN** lệnh in số 3, mã thoát 1, không đổi dữ liệu

### Requirement: Chuyển dữ liệu cũ hai bước
Migration SHALL theo hai lần deploy. Bước 1 chỉ thêm cột; lệnh chuyển dữ liệu mã hóa CCCD cũ, lấy 4 số cuối của số tài khoản cũ, rồi xóa trắng hai cột cũ trong cùng transaction. Lệnh SHALL chạy lại được và không in số gốc. Bước 2 bỏ hai cột cũ ở lần deploy sau, và SHALL dừng nếu cột cũ còn dữ liệu.

#### Scenario: Chuyển một người bán
- **WHEN** chạy lệnh chuyển với dòng có `id_number` `001203012345`, `bank_account` `0451 0003 1234 5678`
- **THEN** dòng có bản mã, 4 số cuối CCCD `2345`, 4 số cuối tài khoản `5678` **AND** hai cột cũ trống

#### Scenario: Số tài khoản quá ngắn
- **WHEN** `bank_account` cũ là `123`
- **THEN** cột 4 số cuối để trống, cột cũ được xóa trắng **AND** lệnh in số dòng bị bỏ, không in số

#### Scenario: Bước 2 khi còn dữ liệu cũ
- **WHEN** chạy migration bỏ cột mà còn 1 dòng có `bank_account`
- **THEN** migration dừng với lỗi, không bỏ cột nào

### Requirement: Không còn chỗ đọc số đầy đủ
Sau khi đổi code, ứng dụng SHALL không đọc cột `supplier.id_number`, `supplier.bank_account` ở bất cứ đâu, trừ lệnh chuyển dữ liệu. Chỉ các đường đã liệt kê SHALL được giải mã số CCCD: form sửa của `partners.manage`, kiểm tra thay đổi khi lưu, đóng gói hồ sơ thuế khi ẩn danh, lệnh đổi khóa. Gói hồ sơ thuế SHALL chỉ được giải mã trong lệnh đổi khóa và lệnh dọn; không màn hình hay API nào giải mã gói. Một kiểm tra tĩnh SHALL bắt chỗ vi phạm.

#### Scenario: Thêm chỗ đọc mới
- **WHEN** một file mới trong `src/` đọc `supplier.bankAccount` hoặc gọi hàm giải mã số CCCD ngoài danh sách
- **THEN** kiểm tra tĩnh đỏ, nêu tên file

#### Scenario: Giải mã gói ngoài danh sách
- **WHEN** một route API hoặc trang gọi hàm giải mã gói hồ sơ thuế
- **THEN** kiểm tra tĩnh đỏ, nêu tên file

### Requirement: Nội dung câu thông báo
Câu thông báo SHALL nêu đủ dữ liệu cá nhân phần mềm lưu (tên, điện thoại, địa chỉ, CCCD, ngân hàng và 4 số cuối tài khoản), mục đích, nơi lưu, thời hạn, quyền và cách liên hệ.

#### Scenario: Câu thông báo đủ nội dung
- **WHEN** Kế toán mở khối thông báo trên form
- **THEN** câu chữ có họ tên, số điện thoại, địa chỉ, số CCCD, tên ngân hàng và 4 số cuối tài khoản, mục đích liên hệ, thanh toán, chứng từ thuế, nơi lưu Singapore, thời hạn, quyền yêu cầu xem, sửa, xóa và cách liên hệ

### Requirement: Ghi nhận đã thông báo cho người bán
Người bán cá nhân lưu điện thoại, địa chỉ, CCCD hoặc tài khoản, và mọi dòng có CCCD kể cả loại công ty, SHALL có ghi nhận đã thông báo; chưa có thì SHALL từ chối với "Chưa ghi nhận đã thông báo cho người bán, không lưu được thông tin cá nhân". Server SHALL lưu phiên bản câu chữ, người ghi (từ phiên đăng nhập), thời điểm, và ghi nhật ký.

#### Scenario: Chưa tích xác nhận
- **WHEN** Kế toán lưu CCCD `001203012345` cho `NCC-0004` chưa có ghi nhận, không tích ô xác nhận
- **THEN** API trả 422 với câu trên **AND** không có gì được lưu

#### Scenario: Điện thoại của người bán cá nhân cũng cần ghi nhận
- **WHEN** Kinh doanh tạo người bán cá nhân "Anh Tâm" có điện thoại `0912345678`, không tích ô xác nhận
- **THEN** API trả 422 với câu trên

#### Scenario: Có xác nhận
- **WHEN** `thuha` lưu CCCD đó và tích ô xác nhận lúc 10/11/2026 15:00 giờ VN
- **THEN** `NCC-0004` có ghi nhận phiên bản 1, người ghi `thuha`, thời điểm đó **AND** nhật ký có dòng ghi nhận với phiên bản 1

#### Scenario: Người ghi không lấy từ client
- **WHEN** thân yêu cầu gửi kèm tên người ghi và thời điểm khác
- **THEN** server bỏ qua, ghi đúng người đang đăng nhập và giờ server

#### Scenario: Đã có ghi nhận
- **WHEN** `NCC-0004` đã có ghi nhận và Kế toán đổi điện thoại
- **THEN** lưu thành công không cần xác nhận lại, ghi nhận không đổi

#### Scenario: Dữ liệu cũ chưa có ghi nhận
- **WHEN** dòng cũ có CCCD, chưa có ghi nhận, và `PATCH` chỉ đổi ghi chú
- **THEN** lưu thành công, không tự tạo ghi nhận

#### Scenario: Người bán chỉ có tên
- **WHEN** Kinh doanh tạo người bán cá nhân "Chú Ba ve chai" chỉ với tên
- **THEN** lưu thành công, không cần xác nhận

#### Scenario: Công ty có điện thoại
- **WHEN** Kế toán tạo người bán loại công ty "Thép Nam Sơn" có điện thoại `0243123456`, không có CCCD
- **THEN** lưu thành công, không cần xác nhận

#### Scenario: Công ty có CCCD
- **WHEN** Kế toán lưu CCCD `001203012345` cho người bán loại công ty, không tích ô xác nhận
- **THEN** API trả 422 với câu trên

### Requirement: Phiên bản câu thông báo
Ghi nhận SHALL giữ khi sửa thông tin sau đó và SHALL không tạo tự động cho dữ liệu cũ. Câu chữ của một phiên bản đã dùng SHALL không đổi; đổi câu chữ thì thêm phiên bản mới.

#### Scenario: Đổi câu chữ
- **WHEN** câu thông báo được đổi thành phiên bản 2
- **THEN** `NCC-0004` vẫn ghi phiên bản 1 **AND** nội dung phiên bản 1 vẫn đọc lại được nguyên văn

### Requirement: Ẩn danh người bán cá nhân
Khi người bán cá nhân yêu cầu xóa dữ liệu, Giám đốc SHALL ẩn danh được họ bằng cách nhập đúng mã NCC và ngày nhận yêu cầu. Thao tác SHALL trong một transaction: đổi tên thành `Đã ẩn danh (<mã NCC>)`; xóa điện thoại, địa chỉ, mã số thuế, bản mã và 4 số cuối CCCD, 4 số cuối và tên ngân hàng, ghi chú; `search_text` chỉ còn tên mới và mã; chuyển Ngừng dùng; ghi nhật ký không chứa dữ liệu cũ. Mã NCC và mọi chứng từ SHALL giữ nguyên.

#### Scenario: Ẩn danh thành công
- **WHEN** Giám đốc ẩn danh `NCC-0004` "Anh Lê Văn Tâm", đã hết nợ, không có đơn đang xử lý
- **THEN** tên thành `Đã ẩn danh (NCC-0004)`, các trường cá nhân trống, trạng thái Ngừng dùng **AND** D14c, đơn mua, phiếu nhập cũ hiện tên mới **AND** số dòng và tổng giá trị `inventory_ledger` không đổi

#### Scenario: Tìm tên cũ không ra
- **WHEN** sau đó tìm "Le Van Tam" ở D16
- **THEN** không có kết quả

#### Scenario: DB không còn tên cũ dạng chữ thường
- **WHEN** đọc dòng `supplier` của `NCC-0004` dạng chữ sau khi ẩn danh
- **THEN** không có "Lê Văn Tâm", "Le Van Tam", địa chỉ cũ, số CCCD ở bất kỳ cột nào

#### Scenario: Nhật ký không chứa dữ liệu cũ
- **WHEN** xem dòng nhật ký Ẩn danh của `NCC-0004`
- **THEN** dòng ghi mã NCC và ngày nhận yêu cầu **AND** tên, điện thoại, địa chỉ, số CCCD cũ không có ở bất kỳ cột nào

#### Scenario: Còn nợ
- **WHEN** Giám đốc ẩn danh `NCC-0004` còn phải trả 26.500.000 ₫
- **THEN** API trả 409 với "NCC-0004 còn phải trả 26.500.000 ₫. Trả hết trước khi ẩn danh" **AND** không có gì đổi

#### Scenario: Còn tiền ứng trước
- **WHEN** `NCC-0004` đã hết nợ nhưng còn tiền ứng trước 5.000.000 ₫
- **THEN** API trả 409 với "NCC-0004 còn tiền ứng trước 5.000.000 ₫. Xử lý xong trước khi ẩn danh"

#### Scenario: Còn đơn đang xử lý
- **WHEN** `NCC-0004` còn đơn `PO-2026-055` đang chờ xe về
- **THEN** API trả 409, nêu mã đơn

#### Scenario: Người bán là công ty
- **WHEN** Giám đốc ẩn danh "Hòa Phát mẫu" (loại công ty)
- **THEN** API trả 409 với "Chỉ ẩn danh được người bán cá nhân"

#### Scenario: Nhập sai mã xác nhận
- **WHEN** Giám đốc nhập `NCC-0005` khi ẩn danh `NCC-0004`
- **THEN** API trả 422, không có gì đổi

#### Scenario: Kế toán không ẩn danh được
- **WHEN** `thuha` (Kế toán) gọi `POST /api/catalog/suppliers/{id}/anonymize`
- **THEN** API trả 403 và người bán không đổi

### Requirement: Khóa người bán đã ẩn danh
Ẩn danh SHALL không hoàn tác được. Người bán đã ẩn danh SHALL không sửa, không dùng lại, không ghi phiếu chi, không nhập hàng được.

#### Scenario: Sửa sau khi đã ẩn danh
- **WHEN** Kế toán `PATCH` `NCC-0004` đã ẩn danh, hoặc ghi phiếu chi Ứng trước 1.000 ₫ cho `NCC-0004`
- **THEN** API trả 409 **AND** `GET .../edit` của `NCC-0004` cũng trả 409

#### Scenario: Dùng lại
- **WHEN** Kế toán chuyển `NCC-0004` đã ẩn danh về Đang dùng
- **THEN** API trả 409 và trạng thái vẫn là Ngừng dùng

### Requirement: Giữ hồ sơ thuế của người đã ẩn danh
Khi ẩn danh người bán đã có phiếu nhập, tên, địa chỉ và số CCCD SHALL được gộp thành một gói mã hóa "hồ sơ thuế", cùng định dạng và cùng khóa với bản mã CCCD nhưng gắn với trường riêng, trong cùng transaction ẩn danh. Không có CCCD thì gói vẫn có tên và địa chỉ. Không màn hình hay API nào SHALL giải mã gói. Người bán chưa có phiếu nhập SHALL không có gói, mọi dữ liệu bị xóa ngay.

#### Scenario: Có phiếu nhập
- **WHEN** ngày 10/11/2026 ẩn danh `NCC-0004` "Anh Lê Văn Tâm", địa chỉ "12 Trần Phú, Hà Đông", CCCD `001203012345`, phiếu nhập gần nhất 05/03/2026
- **THEN** có gói hồ sơ thuế dạng `pii1.`, bản mã và 4 số cuối CCCD trống, D16 không hiện dòng CCCD, form sửa trả 409 **AND** giải mã gói bằng khóa (trong test) ra đúng tên, địa chỉ, CCCD đó

#### Scenario: Gói không đổi lẫn với cột CCCD
- **WHEN** gói hồ sơ thuế của `NCC-0004` bị chép vào cột bản mã CCCD của chính dòng đó
- **THEN** giải mã thất bại

#### Scenario: Có phiếu nhập, không có CCCD
- **WHEN** ẩn danh `NCC-0007` chưa từng có CCCD, đã có phiếu nhập
- **THEN** có gói hồ sơ thuế với tên và địa chỉ, CCCD trống

#### Scenario: Chưa có phiếu nhập
- **WHEN** ẩn danh `NCC-0009` có CCCD nhưng chưa nhập hàng lần nào
- **THEN** không có gói hồ sơ thuế **AND** bản mã CCCD bị xóa ngay trong cùng thao tác

### Requirement: Xóa hồ sơ thuế khi hết hạn
Hạn giữ gói hồ sơ thuế SHALL tính từ ngày nhập gần nhất; thời hạn là một tham số, mặc định 10 năm (chờ xác nhận, #78), và hạn SHALL tính ra lúc cần, không lưu theo từng dòng. Lệnh dọn SHALL xóa gói đã hết hạn, chạy lại được, ghi nhật ký.

#### Scenario: Chưa tới hạn
- **WHEN** chạy lệnh dọn ngày 04/03/2036 với `NCC-0004`
- **THEN** gói còn

#### Scenario: Tới hạn
- **WHEN** chạy lệnh dọn ngày 05/03/2036 với `NCC-0004`
- **THEN** gói bị xóa **AND** nhật ký có một dòng cho `NCC-0004` với người làm là Hệ thống **AND** chạy lại không đổi gì

#### Scenario: Đổi thời hạn
- **WHEN** luật sư chốt 5 năm và tham số đổi thành 5
- **THEN** lần dọn sau xóa gói của `NCC-0004` từ 05/03/2031 mà không cần sửa dữ liệu

### Requirement: Thời hạn giữ CCCD áp cho mọi người bán
Với người bán chưa ẩn danh, lệnh dọn SHALL xóa bản mã và 4 số cuối CCCD khi đã quá thời hạn kể từ lần nhập gần nhất; chưa từng có phiếu nhập thì tính từ ngày tạo theo giờ Việt Nam. Mỗi người bán bị xóa SHALL có một dòng nhật ký với người làm là Hệ thống, chỉ chứa số đã che. Các thông tin khác SHALL giữ nguyên.

#### Scenario: Lâu không bán hàng
- **WHEN** chạy lệnh dọn ngày 05/03/2036 với `NCC-0006` chưa ẩn danh, CCCD `001203012345`, phiếu nhập gần nhất 05/03/2026
- **THEN** bản mã và 4 số cuối CCCD trống, tên và điện thoại giữ nguyên **AND** nhật ký có dòng Sửa của Hệ thống, trường "Số CCCD" `•••• •••• 2345` → `–`

#### Scenario: Còn bán hàng
- **WHEN** chạy lệnh dọn ngày 05/03/2036 với `NCC-0006` có phiếu nhập gần nhất 01/02/2030
- **THEN** CCCD giữ nguyên

#### Scenario: Chưa từng nhập hàng
- **WHEN** `NCC-0008` tạo ngày 10/11/2026, có CCCD, chưa có phiếu nhập, và chạy lệnh dọn ngày 10/11/2036
- **THEN** bản mã và 4 số cuối CCCD bị xóa **AND** chạy ngày 09/11/2036 thì còn

### Requirement: Dữ liệu mẫu không có số thật
Seed và dữ liệu mẫu SHALL không chứa số CCCD thật. Nếu cần số CCCD mẫu, số đó SHALL bắt đầu bằng `000` (không ứng với tỉnh nào). Một kiểm tra tĩnh SHALL bắt dãy 12 chữ số khác trong seed.

#### Scenario: Seed có số thật
- **WHEN** ai đó thêm `"001203012345"` vào `scripts/seed-dev.mts`
- **THEN** kiểm tra tĩnh đỏ, nêu tên file

### Requirement: Runbook sự cố lộ dữ liệu
Dự án SHALL có `docs/ops/data-breach.md` nêu: cách nhận biết và khoanh vùng, đổi khóa và secret, báo người bị ảnh hưởng trong 72 giờ, báo cơ quan quản lý, lưu hồ sơ sự cố ít nhất 5 năm, người chịu trách nhiệm từng bước.

#### Scenario: Có sự cố
- **WHEN** nghi lộ bản sao lưu lúc 09:00 ngày 12/11/2026
- **THEN** runbook nêu hạn báo người bị ảnh hưởng là 09:00 ngày 15/11/2026 và các bước đổi khóa

### Requirement: Runbook vận hành dữ liệu cá nhân
Dự án SHALL có `docs/ops/personal-data.md` nêu: nơi cất khóa tách khỏi bản sao lưu, đổi khóa, giữ khóa cũ tới khi bản sao lưu dùng khóa đó hết hạn, trả lời yêu cầu xóa (2 ngày làm việc, làm xong trong 20 ngày), chạy lại ẩn danh sau khi khôi phục bản sao lưu, lưu log số dòng của mỗi lần chạy lệnh làm bằng chứng tuân thủ, và cách xử lý tay yêu cầu xóa của nhà thầu cá nhân.

#### Scenario: Nhà thầu cá nhân yêu cầu xóa
- **WHEN** nhà thầu cá nhân yêu cầu xóa dữ liệu
- **THEN** runbook nêu các bước xử lý tay và nói rõ giá trị cũ vẫn còn trong nhật ký

#### Scenario: Lưu bằng chứng lần chạy
- **WHEN** chạy lệnh dọn qua workflow `pii-maintenance`
- **THEN** runbook yêu cầu lưu log số dòng vào hồ sơ tuân thủ **AND** log không chứa dữ liệu cá nhân

#### Scenario: Khôi phục bản sao lưu cũ
- **WHEN** khôi phục bản sao lưu từ trước ngày `NCC-0004` được ẩn danh
- **THEN** runbook yêu cầu đối chiếu sổ yêu cầu xóa và ẩn danh lại `NCC-0004` trước khi mở cho người dùng
