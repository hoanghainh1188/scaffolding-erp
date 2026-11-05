# activity-log Specification

## Purpose
Nhật ký thao tác (D18): ghi ai làm gì, lúc nào, trên chứng từ nào, trong cùng giao dịch với thao tác; chỉ ghi thêm, che dữ liệu nhạy cảm, gắn cờ cần xem kỹ; chỉ Giám đốc xem, lọc và xuất Excel.

## Requirements

### Requirement: Nhật ký chỉ ghi thêm
Hệ thống SHALL lưu nhật ký thao tác ở một chỗ riêng, chỉ ghi thêm. Cơ sở dữ liệu SHALL chặn mọi lệnh sửa, xóa, xóa sạch dòng nhật ký với lỗi "Nhật ký thao tác chỉ ghi thêm", kể cả khi người gọi là Giám đốc hay chạy SQL trực tiếp. Hệ thống SHALL không có API hay nút nào để sửa, xóa nhật ký. Nhật ký SHALL được giữ mãi ở MVP.

#### Scenario: Sửa dòng nhật ký bị chặn
- **WHEN** chạy `UPDATE activity_log SET summary = 'x'` trên dòng ghi lúc 28/10/2026 22:47 của `thuha`
- **THEN** lệnh lỗi "Nhật ký thao tác chỉ ghi thêm" **AND** dòng vẫn như cũ

#### Scenario: Xóa và xóa sạch nhật ký bị chặn
- **WHEN** chạy `DELETE FROM activity_log` hoặc `TRUNCATE activity_log` trên cơ sở dữ liệu thật
- **THEN** cả hai lệnh lỗi "Nhật ký thao tác chỉ ghi thêm" **AND** số dòng nhật ký không đổi

#### Scenario: Không có API xóa nhật ký
- **WHEN** Giám đốc `minhanh` gửi `DELETE /api/activity` hoặc `PATCH /api/activity/<id>`
- **THEN** server trả 405 **AND** không dòng nào bị đổi

### Requirement: Nội dung một dòng nhật ký
Mỗi dòng nhật ký SHALL có: thời điểm (giờ server), người làm, vai trò của người đó **lúc làm**, thiết bị (Điện thoại hoặc Máy tính, kèm trình duyệt Edge / Chrome / Cốc Cốc / Safari / Firefox / Khác, đọc từ User-Agent của yêu cầu), thao tác, loại chứng từ, mã chứng từ (không có với đăng nhập), tóm tắt tiếng Việt tối đa 300 ký tự, danh sách trường đổi (mỗi trường có nhãn, giá trị trước, giá trị sau, đã viết sẵn theo cách hiển thị) và các cờ. Đổi vai trò về sau SHALL không đổi vai trò đã ghi.

#### Scenario: Dòng sửa đơn giá trên đơn thu mua
- **WHEN** `thuha` (Kế toán) trên Edge máy tính đổi đơn giá `GG-K17` của `PO-2026-055` từ 190.000 ₫ thành 185.000 ₫ lúc 28/10/2026 22:47:13 giờ VN
- **THEN** có một dòng: thời điểm 28/10/2026 22:47:13, người `thuha`, vai trò Kế toán, thiết bị "Máy tính · Edge", thao tác Sửa, chứng từ Đơn thu mua `PO-2026-055`, tóm tắt "Đơn giá GG-K17: 190.000 ₫ → 185.000 ₫", trường đổi "Đơn giá GG-K17" 190.000 ₫ → 185.000 ₫ và "Tổng tiền hàng của đơn" 52.942.500 ₫ → 51.942.500 ₫, cờ Ngoài giờ

#### Scenario: Vai trò lúc làm được giữ nguyên
- **WHEN** `lanphuong` (Kinh doanh) tạo `PO-2026-056` lúc 09:00 rồi Giám đốc đổi `lanphuong` sang Kế toán lúc 10:00
- **THEN** dòng tạo `PO-2026-056` vẫn ghi vai trò Kinh doanh **AND** dòng đổi vai trò ghi người làm là Giám đốc

#### Scenario: Thao tác trên điện thoại
- **WHEN** `vantung` (Thủ kho) ghi sổ `PN-2026-093` từ Chrome trên Android
- **THEN** dòng ghi thiết bị "Điện thoại · Chrome"

### Requirement: Thao tác trên chứng từ được ghi
Mỗi lệnh làm đổi chứng từ SHALL ghi đúng một dòng nhật ký cho mỗi thao tác: đơn thu mua (Tạo, Sửa, Đặt đơn, Hủy, Đóng đơn, Xóa nháp), phiếu nhập (Ghi sổ), phiếu sửa chữa (Tạo, Sửa, Xóa nháp, Ghi sổ), kiểm kê (Tạo, Gửi, Duyệt, Trả lại, Yêu cầu đếm lại, Hủy), phiếu điều chỉnh, tồn đầu kỳ và phiếu điều chỉnh giá trị (Tạo, Sửa, Xóa nháp, Gửi, Duyệt, Trả lại). Tóm tắt của phiếu điều chỉnh giá trị SHALL ghi chứng từ gốc, số dòng và tổng chênh lệch.

#### Scenario: Lưu đơn ghi hai thao tác
- **WHEN** `lanphuong` bấm "Lưu đơn" trên D3 tạo `PO-2026-056` và đặt đơn luôn
- **THEN** có hai dòng `PO-2026-056`: Tạo "Hòa Phát mẫu · 5 mã hàng · 52.942.500 ₫" và Đặt đơn "Dự kiến về 30/10/2026"

#### Scenario: Ghi sổ phiếu sửa chữa
- **WHEN** `thuha` ghi sổ `PSC-2026-024`: 56 cái về Tốt, 4 phế liệu, chi phí 2.220.000 ₫
- **THEN** có một dòng Ghi sổ `PSC-2026-024` với tóm tắt "56 cái về Tốt, 4 phế liệu · chi phí 2.220.000 ₫"

#### Scenario: Xóa nháp phiếu sửa
- **WHEN** `thuha` xóa nháp `PSC-2026-025` có 2 mã hàng
- **THEN** có một dòng Xóa nháp `PSC-2026-025` "Nháp có 2 mã hàng, chưa ghi sổ" **AND** dòng vẫn còn dù phiếu đã mất

#### Scenario: Gửi lại cùng mã nháp không ghi thêm
- **WHEN** điện thoại của `vantung` gửi lại phiếu nhập cùng mã nháp sau khi `PN-2026-093` đã ghi sổ
- **THEN** vẫn chỉ có một dòng Ghi sổ `PN-2026-093`

#### Scenario: Duyệt phiếu điều chỉnh giá trị
- **WHEN** Giám đốc duyệt `ĐCG-2026-001` sửa chi phí `PN-2026-094`, 2 dòng, tổng −31.500.000 ₫
- **THEN** có một dòng Duyệt `ĐCG-2026-001` với tóm tắt "Sửa PN-2026-094 · ghi sổ 2 dòng điều chỉnh giá · −31.500.000 ₫"

### Requirement: Thao tác trên hợp đồng được ghi
Mỗi lệnh làm đổi hợp đồng hoặc phụ lục hợp đồng (Tạo, Sửa, Gửi duyệt, Duyệt, Trả lại, Hủy) SHALL ghi đúng một dòng nhật ký. Lọc theo loại chứng từ trên D18 SHALL có Hợp đồng và Phụ lục hợp đồng.

#### Scenario: Trả lại hợp đồng
- **WHEN** Giám đốc trả lại `112026/ANPHAT-MINHPHAT` với lý do "Giá kích tăng U thấp quá, báo lại 450 ₫"
- **THEN** có một dòng Trả lại loại Hợp đồng `112026/ANPHAT-MINHPHAT` với tóm tắt là lý do đó

#### Scenario: Lọc phụ lục trên D18
- **WHEN** Giám đốc lọc D18 theo loại Phụ lục hợp đồng
- **THEN** bảng chỉ hiện các dòng có mã dạng `112026/ANPHAT-MINHPHAT/01`

### Requirement: Thao tác trên phiếu xuất được ghi
Mỗi lệnh làm đổi phiếu xuất (Tạo, Sửa, Bắt đầu nhặt, Trả lại, Hủy, Ghi sổ) SHALL ghi đúng một dòng nhật ký. Lọc theo loại chứng từ trên D18 SHALL có Phiếu xuất.

#### Scenario: Gửi lại cùng mã nháp phiếu xuất
- **WHEN** điện thoại của `vantung` gửi lại lần xác nhận `PX-2026-140` cùng mã nháp sau khi phiếu đã ghi sổ
- **THEN** vẫn chỉ có một dòng Ghi sổ `PX-2026-140`

#### Scenario: Lọc phiếu xuất trên D18
- **WHEN** Giám đốc lọc D18 theo loại Phiếu xuất
- **THEN** bảng chỉ hiện các dòng có mã dạng `PX-2026-140`, gồm cả thao tác "Bắt đầu nhặt"

### Requirement: Thao tác trên danh mục, người dùng và đăng nhập được ghi
Hệ thống SHALL ghi một dòng cho: tạo, sửa (cả ngừng dùng, dùng lại), xóa vật tư, nhóm hàng, bộ, nhà cung cấp, nhà thầu, công trình, kho/bãi/xưởng; tạo người dùng, đổi vai trò, khóa, mở khóa, đặt lại mật khẩu, tự đổi mật khẩu; sửa giá sắt vụn; mỗi lần đăng nhập thành công. Đăng nhập sai, đăng xuất, xem trang SHALL không ghi.

#### Scenario: Đăng nhập thành công và sai
- **WHEN** `vantung` nhập sai mật khẩu lúc 07:40 rồi đăng nhập đúng lúc 07:41
- **THEN** chỉ có một dòng Đăng nhập lúc 07:41 "Đăng nhập thành công", không có mã chứng từ

#### Scenario: Sửa giá sắt vụn
- **WHEN** Giám đốc đổi giá sắt vụn từ 7.500 ₫/kg thành 7.800 ₫/kg
- **THEN** có một dòng Sửa loại Giá sắt vụn với trường "Giá sắt vụn" 7.500 ₫/kg → 7.800 ₫/kg

### Requirement: Lệnh bị từ chối không ghi
Lệnh bị từ chối (lỗi kiểm tra 400, 403, 404, 409) SHALL không ghi dòng nhật ký nào.

#### Scenario: Lệnh bị từ chối không ghi
- **WHEN** `quocbao` (Kinh doanh) gửi `POST /api/repairs` và nhận 403, rồi `vantung` (Thủ kho) gửi phiếu nhập không có dòng nào và nhận 400
- **THEN** không có dòng nhật ký nào mới

### Requirement: Ghi trong cùng giao dịch với thao tác
Dòng nhật ký SHALL được ghi trong cùng transaction của thao tác. Thao tác không lưu được (lỗi giữa chừng, rollback) SHALL không để lại dòng nhật ký. Ghi nhật ký lỗi SHALL làm thao tác không lưu.

#### Scenario: Ghi sổ lỗi giữa chừng thì không có nhật ký
- **WHEN** duyệt `KK-2026-003` nhưng tồn `GG-CH` Tốt ở `BAI-01` chỉ còn 20 nên duyệt lỗi "Không đủ hàng"
- **THEN** phiên vẫn Chờ duyệt **AND** không có dòng Duyệt nào cho `KK-2026-003`

#### Scenario: Nhật ký lỗi thì thao tác không lưu
- **WHEN** tạo vật tư `GG-K19` mà câu ghi nhật ký lỗi
- **THEN** không có vật tư `GG-K19` **AND** người dùng nhận lỗi như lỗi lưu thường

### Requirement: Sửa chỉ ghi trường thật sự đổi
Thao tác Sửa SHALL so giá trị trước và sau trong cùng transaction và chỉ ghi các trường đã đổi. Sửa mà không trường nào đổi SHALL không ghi dòng nào. Dòng hàng thêm, bỏ SHALL ghi thành trường đổi có giá trị trước hoặc sau là "–". Một dòng nhật ký SHALL ghi tối đa 50 trường đổi; phần còn lại gộp thành một trường "Và N thay đổi khác".

#### Scenario: Lưu lại không đổi gì
- **WHEN** `lanphuong` mở sửa `NCC-0004` rồi bấm Lưu mà không đổi ô nào
- **THEN** không có dòng nhật ký mới cho `NCC-0004`

#### Scenario: Chỉ đổi số điện thoại
- **WHEN** `lanphuong` đổi số điện thoại `NCC-0004` từ 0903 123 456 thành 0903 123 457, các ô khác giữ nguyên
- **THEN** dòng Sửa `NCC-0004` có đúng một trường đổi "Số điện thoại" 0903 123 456 → 0903 123 457

#### Scenario: Thêm và bỏ dòng hàng trên đơn nháp
- **WHEN** sửa `PO-2026-056` nháp: thêm `PK-KU` 50 cái × 40.000 ₫, bỏ `GG-K12`
- **THEN** dòng Sửa có trường "Dòng PK-KU" – → "50 cái × 40.000 ₫" và "Dòng GG-K12" "20 cái × 150.000 ₫" → –

#### Scenario: Ngừng dùng vật tư
- **WHEN** Giám đốc chuyển `GG-K12` sang Ngừng dùng
- **THEN** dòng Sửa `GG-K12` có trường "Trạng thái" Đang dùng → Ngừng dùng

### Requirement: Che dữ liệu nhạy cảm
Nhật ký SHALL chỉ lưu CCCD và số tài khoản ở dạng đã che, 4 số cuối (`•••• •••• 2345`, `•••• 5678`), cả trong tóm tắt và trường đổi. Mật khẩu, mật khẩu tạm, mã phiên đăng nhập SHALL không bao giờ vào nhật ký, kể cả dạng đã che. Xuất Excel SHALL dùng đúng giá trị đã che.

#### Scenario: Số tài khoản bị che
- **WHEN** `ducthang` đổi số tài khoản `NCC-0004` từ 0451000312341234 thành 0451000312345678
- **THEN** dòng Sửa có trường "Số tài khoản" `•••• 1234` → `•••• 5678` **AND** chuỗi `0451000312345678` không có ở bất kỳ cột nào của dòng

#### Scenario: Đặt lại mật khẩu không lộ mật khẩu tạm
- **WHEN** Giám đốc đặt lại mật khẩu cho `thuha` và hệ thống tạo mật khẩu tạm
- **THEN** dòng Sửa ghi "Đặt lại mật khẩu cho thuha" **AND** mật khẩu tạm không có trong dòng nhật ký

### Requirement: Cờ Ngoài giờ
Dòng SHALL mang cờ "Ngoài giờ" khi thời điểm theo giờ `Asia/Ho_Chi_Minh` trước 06:00:00 hoặc từ 21:00:00 trở đi; giờ làm việc là [06:00, 21:00). Dòng có ít nhất một cờ là dòng "cần xem kỹ"; một dòng mang được nhiều cờ.

#### Scenario: Biên 21:00
- **WHEN** ba thao tác lúc 20:59:59, 21:00:00 và 22:47:13 ngày 28/10/2026 giờ VN
- **THEN** dòng 20:59:59 không có cờ Ngoài giờ **AND** dòng 21:00:00 và 22:47:13 có cờ Ngoài giờ

#### Scenario: Biên 06:00
- **WHEN** ba thao tác lúc 05:59:59, 06:00:00 và 07:41:00 ngày 28/10/2026 giờ VN
- **THEN** dòng 05:59:59 có cờ Ngoài giờ **AND** dòng 06:00:00 và 07:41:00 không có

#### Scenario: Giờ UTC khác ngày giờ VN
- **WHEN** thao tác lúc 27/10/2026 23:30 UTC (06:30 ngày 28/10 giờ VN)
- **THEN** dòng không có cờ Ngoài giờ **AND** nằm trong nhóm ngày 28/10/2026

### Requirement: Cờ Dữ liệu nhạy cảm
Dòng SHALL mang cờ "Dữ liệu nhạy cảm" khi thao tác sửa CCCD hoặc số tài khoản, đổi vai trò, khóa hoặc mở khóa tài khoản, đặt lại mật khẩu.

#### Scenario: Sửa số tài khoản ngoài giờ
- **WHEN** `ducthang` sửa số tài khoản `NCC-0004` lúc 27/10/2026 23:05 giờ VN
- **THEN** dòng có hai cờ Ngoài giờ và Dữ liệu nhạy cảm

#### Scenario: Sửa tên nhà cung cấp không nhạy cảm
- **WHEN** `lanphuong` chỉ đổi tên `NCC-0004` lúc 10:00
- **THEN** dòng không có cờ nào

#### Scenario: Khóa tài khoản
- **WHEN** Giám đốc khóa tài khoản `quocbao` lúc 10:00
- **THEN** dòng Sửa `quocbao` có cờ "Dữ liệu nhạy cảm" và trường "Trạng thái" Đang dùng → Đã khóa

### Requirement: Cờ Có xác nhận bất thường
Dòng SHALL mang cờ "Có xác nhận bất thường" khi ghi sổ phiếu nhập có xác nhận nhận dư hoặc chi phí vượt dự kiến, ghi sổ phiếu sửa có xác nhận chi phí cao, hoặc duyệt kiểm kê có ít nhất một dòng bị cờ cảnh báo.

#### Scenario: Phiếu nhập có xác nhận nhận dư
- **WHEN** `vantung` ghi sổ `PN-2026-093` sau khi xác nhận nhận dư 80 khung 1,7m
- **THEN** dòng Ghi sổ có cờ "Có xác nhận bất thường" và tóm tắt có "đã xác nhận nhận dư"

#### Scenario: Duyệt kiểm kê có dòng bị cờ
- **WHEN** Giám đốc duyệt `KK-2026-003` có 3 dòng cần xem kỹ, ghi 5 dòng điều chỉnh tổng −2.788.056 ₫
- **THEN** dòng Duyệt có cờ "Có xác nhận bất thường" và tóm tắt "Ghi sổ 5 dòng điều chỉnh · −2.788.056 ₫"

### Requirement: Ô tóm tắt và bộ lọc trên D18
Trang `/settings/activity` (D18) SHALL có bốn ô tóm tắt theo bộ lọc đang chọn: Thao tác (tổng, khoảng ngày, số người, số trên điện thoại), Duyệt / ghi sổ (Duyệt + Ghi sổ), Sửa / xóa / trả lại (Sửa, Trả lại, Hủy, Đóng đơn, Xóa nháp, Xóa), Cần xem kỹ. Bộ lọc SHALL gồm người làm, loại chứng từ, từ ngày, đến ngày (`dd/mm/yyyy`, tối đa 366 ngày), mã chứng từ, nhóm thao tác và "Chỉ cần xem kỹ (N)"; mặc định mọi người, mọi loại, 7 ngày gần nhất tính cả hôm nay theo giờ VN.

#### Scenario: Mở D18 mặc định
- **WHEN** Giám đốc mở `/settings/activity` ngày 28/10/2026
- **THEN** bộ lọc là 22/10/2026 – 28/10/2026, mọi người, mọi loại **AND** bảng hiện ngày 28/10/2026 trên cùng

#### Scenario: Bốn ô tóm tắt theo bộ lọc
- **WHEN** lọc 27/10/2026 – 28/10/2026 có 196 thao tác của 5 người, 88 trên điện thoại, 9 duyệt hoặc ghi sổ, 7 sửa / xóa / trả lại, 3 dòng có cờ
- **THEN** bốn ô hiện 196 "27–28/10 · 5 người · 88 trên điện thoại", 9, 7, 3 **AND** ô "Chỉ cần xem kỹ (3)"

#### Scenario: Lọc chỉ cần xem kỹ
- **WHEN** bật "Chỉ cần xem kỹ" trên khoảng 27–28/10/2026
- **THEN** bảng chỉ còn 3 dòng: sửa `PO-2026-055` lúc 22:47, ghi sổ `PN-2026-093` lúc 15:40, sửa `NCC-0004` lúc 23:05

#### Scenario: Lọc theo mã chứng từ
- **WHEN** nhập mã `KK-2026-003`
- **THEN** bảng chỉ hiện các dòng của `KK-2026-003`: Tạo 08:00, Gửi 11:40, Duyệt 16:05

#### Scenario: Khoảng ngày sai
- **WHEN** chọn từ 28/10/2026 đến 27/10/2026
- **THEN** trang báo "Từ ngày phải trước hoặc bằng đến ngày" và không tải bảng

#### Scenario: Không có thao tác
- **WHEN** lọc người `xuong` trong 7 ngày mà người đó chưa làm gì
- **THEN** bốn ô hiện 0 **AND** bảng hiện "Không có thao tác nào trong bộ lọc này"

### Requirement: Bảng nhật ký nhóm theo ngày
Bảng D18 SHALL sắp mới nhất trên cùng, nhóm theo ngày giờ VN với tiêu đề kiểu "Thứ Tư, 28/10/2026 · 84 thao tác", cột Giờ, Người làm (tên, vai trò · thiết bị), Thao tác, Chứng từ, Nội dung (tóm tắt + nhãn cờ), Chi tiết. Bấm một dòng SHALL mở bảng Trường / Trước / Sau cùng Thời điểm, Người làm, Thiết bị. Trang SHALL không có nút sửa hay xóa nhật ký.

#### Scenario: Xem trước sau
- **WHEN** bấm dòng sửa `PO-2026-055` lúc 22:47
- **THEN** mở bảng "Thay đổi trên PO-2026-055" với "Đơn giá GG-K17" 190.000 ₫ → 185.000 ₫, Thời điểm 28/10/2026 22:47:13, Người làm "Thu Hà (thuha)", Thiết bị "Máy tính · Edge"

### Requirement: Xem thêm theo con trỏ
D18 SHALL tải 50 dòng mỗi lần, hiện "Đang hiện N / M thao tác" và nút "Xem thêm" tải tiếp theo con trỏ, không trùng không sót dù có dòng mới ghi trong lúc xem.

#### Scenario: Xem thêm theo con trỏ
- **WHEN** bộ lọc có 196 dòng, đang hiện 50, rồi có 2 thao tác mới được ghi trước khi bấm "Xem thêm"
- **THEN** lần tải sau hiện dòng 51–100 của danh sách cũ, không lặp dòng nào **AND** hai dòng mới chỉ hiện khi tải lại trang

### Requirement: Xuất Excel nhật ký
Nút "Xuất Excel" SHALL tải về một tệp `.xlsx` gồm mọi dòng khớp bộ lọc đang chọn (không chỉ các dòng đang hiện), mới nhất trên cùng, tên tệp `nhat-ky-<từ>-<đến>.xlsx`. Cột: Thời điểm (dd/mm/yyyy hh:mm:ss giờ VN), Người làm, Tên đăng nhập, Vai trò, Thiết bị, Thao tác, Loại chứng từ, Mã chứng từ, Nội dung, Thay đổi (mỗi trường một dòng "Nhãn: trước → sau"), Cờ. Bộ lọc khớp quá 10.000 dòng SHALL bị từ chối với "Có <N> thao tác, quá 10.000 dòng. Thu hẹp khoảng ngày hoặc bộ lọc", không xuất một phần.

#### Scenario: Xuất theo bộ lọc
- **WHEN** Giám đốc lọc 27–28/10/2026 (196 thao tác) rồi bấm "Xuất Excel"
- **THEN** tải về `nhat-ky-2026-10-27-2026-10-28.xlsx` có dòng tiêu đề và 196 dòng **AND** dòng `NCC-0004` có Thay đổi "Số tài khoản: •••• 1234 → •••• 5678" và Cờ "Ngoài giờ, Dữ liệu nhạy cảm"

#### Scenario: Quá 10.000 dòng
- **WHEN** bộ lọc khớp 12.345 thao tác
- **THEN** không tải tệp **AND** trang báo "Có 12.345 thao tác, quá 10.000 dòng. Thu hẹp khoảng ngày hoặc bộ lọc"

#### Scenario: Đúng 10.000 dòng
- **WHEN** bộ lọc khớp đúng 10.000 thao tác
- **THEN** tải về tệp có 10.000 dòng dữ liệu

### Requirement: Quyền xem nhật ký
Chỉ vai trò có quyền `activity.view` (Giám đốc) SHALL mở được D18, gọi được API đọc và xuất nhật ký. Vai trò khác SHALL nhận 403 ở cả trang và API. Lối vào D18 SHALL nằm trong trang Cài đặt.

#### Scenario: Kế toán gọi API nhật ký
- **WHEN** `thuha` (Kế toán) gửi `GET /api/activity` và `GET /api/activity/export`
- **THEN** cả hai trả 403 "Bạn không có quyền thực hiện thao tác này" **AND** không có dữ liệu nhật ký nào trong câu trả lời

#### Scenario: Thủ kho mở trang nhật ký
- **WHEN** `vantung` (Thủ kho) mở thẳng `/settings/activity`
- **THEN** trang hiện "Bạn không có quyền xem trang này" với mã 403

#### Scenario: Giám đốc thấy lối vào
- **WHEN** Giám đốc mở `/settings`
- **THEN** có thẻ "Nhật ký thao tác" dẫn tới `/settings/activity`

### Requirement: Thao tác trên phiếu thu hồi và phiếu đền bù được ghi
Ghi sổ phiếu thu hồi SHALL ghi đúng một dòng nhật ký Ghi sổ của phiếu thu hồi và, nếu có phiếu đền bù, đúng một dòng Tạo của phiếu đền bù. Mỗi lệnh Sửa, Duyệt, Từ chối phiếu đền bù SHALL ghi đúng một dòng. Lọc theo loại chứng từ trên D18 SHALL có Phiếu thu hồi và Phiếu đền bù; nhóm "Trả lại, hủy, xóa" SHALL gồm thao tác "Từ chối".

#### Scenario: Ghi sổ có phiếu đền bù
- **WHEN** `vantung` lưu `PTH-2026-071` có hàng Chờ sửa và Mất
- **THEN** nhật ký có đúng một dòng "Ghi sổ PTH-2026-071" và một dòng "Tạo ĐB-2026-009"

#### Scenario: Gửi lại cùng mã nháp
- **WHEN** máy gửi lại lần lưu `PTH-2026-071` cùng mã nháp
- **THEN** vẫn chỉ có một dòng Ghi sổ `PTH-2026-071` và một dòng Tạo `ĐB-2026-009`

#### Scenario: Lọc phiếu đền bù trên D18
- **WHEN** Giám đốc lọc D18 theo loại Phiếu đền bù và nhóm "Trả lại, hủy, xóa"
- **THEN** bảng chỉ hiện các dòng "Từ chối" có mã dạng `ĐB-2026-009`

### Requirement: Thao tác tính tiền thuê và ngày nghỉ được ghi
Mỗi lệnh chốt kỳ tiền thuê (Chốt kỳ), tạo / sửa / xóa dòng điều chỉnh, tạo / sửa / xóa ngày nghỉ SHALL ghi đúng một dòng nhật ký trong cùng transaction. Tính, xem, in, xuất Excel SHALL không ghi nhật ký. Lệnh bị từ chối SHALL không ghi. Tóm tắt Chốt kỳ SHALL ghi kỳ, số dòng và phải thu; tóm tắt dòng điều chỉnh SHALL ghi kỳ được điều chỉnh, số tiền và lý do. Tạo hoặc sửa dòng điều chỉnh có số tiền âm SHALL gắn cờ "Có xác nhận bất thường" (0.2 #80).

#### Scenario: Chốt kỳ ghi một dòng
- **WHEN** `thuha` chốt kỳ 02/2027 của `102026/ANPHAT-MINHPHAT` có 8 dòng bảng kê, phải thu 7.283.304 ₫
- **THEN** có đúng một dòng Chốt kỳ "102026/ANPHAT-MINHPHAT · kỳ 02/2027 · 8 dòng · phải thu 7.283.304 ₫"

#### Scenario: Ghi dòng điều chỉnh
- **WHEN** `thuha` ghi dòng điều chỉnh 93.000 ₫ cho kỳ 01/2027 vào kỳ 02/2027
- **THEN** có đúng một dòng Tạo với tóm tắt "Điều chỉnh kỳ 01/2027 · 93.000 ₫ · Kỳ 01 thiếu 10 CHEO1,7 × 31 ngày (giao 31/12 chưa ghi)"

#### Scenario: Khoản điều chỉnh âm gắn cờ
- **WHEN** `thuha` ghi dòng điều chỉnh −50.000 ₫ cho kỳ 01/2027 vào kỳ 02/2027
- **THEN** dòng nhật ký Tạo gắn cờ "Có xác nhận bất thường" **AND** Giám đốc thấy dòng đó khi lọc "Cần xem kỹ" trên D18

#### Scenario: Sửa ngày nghỉ
- **WHEN** Giám đốc sửa "Tết Nguyên đán" từ 05/02 – 13/02/2027 thành 06/02 – 14/02/2027
- **THEN** có đúng một dòng Sửa ngày nghỉ ghi trường đổi "Từ ngày 05/02/2027 → 06/02/2027", "Đến ngày 13/02/2027 → 14/02/2027"

#### Scenario: Chốt bị từ chối không ghi
- **WHEN** lệnh chốt kỳ 02/2027 bị từ chối vì kỳ 01/2027 chưa chốt
- **THEN** nhật ký không có dòng mới

#### Scenario: Xem và xuất Excel không ghi
- **WHEN** `thuha` mở D7 kỳ 02/2027 rồi bấm Xuất Excel
- **THEN** nhật ký không có dòng mới

### Requirement: Loại chứng từ và thao tác Chốt kỳ trên D18
Lọc theo loại chứng từ trên D18 SHALL có Kỳ tiền thuê, Điều chỉnh tiền thuê và Ngày nghỉ. Thao tác mới "Chốt kỳ" SHALL thuộc nhóm "Duyệt, ghi sổ" và tính vào ô Duyệt / ghi sổ.

#### Scenario: Lọc nhóm Duyệt, ghi sổ
- **WHEN** Giám đốc lọc D18 theo nhóm "Duyệt, ghi sổ" ngày 02/03/2027
- **THEN** bảng có dòng Chốt kỳ của `102026/ANPHAT-MINHPHAT` **AND** ô Duyệt / ghi sổ đếm cả dòng đó

### Requirement: Thao tác trên phiếu chuyển công trình và phiếu mua lại được ghi
Mỗi lệnh làm đổi phiếu chuyển công trình (Tạo, Sửa, Gửi điện thoại, Rút về, Hủy, Ghi sổ) và phiếu mua lại (Tạo, Sửa, Duyệt, Từ chối) SHALL ghi đúng một dòng nhật ký. Ghi sổ phiếu chuyển làm hợp đồng nhận sang Đang thực hiện SHALL không ghi thêm dòng của hợp đồng. Lọc theo loại chứng từ trên D18 SHALL có Phiếu chuyển công trình và Phiếu mua lại.

#### Scenario: Gửi lại cùng mã nháp phiếu chuyển
- **WHEN** điện thoại của `vantung` gửi lại lần xác nhận `CCT-2026-004` cùng mã nháp sau khi phiếu đã ghi sổ
- **THEN** vẫn chỉ có một dòng Ghi sổ `CCT-2026-004`

#### Scenario: Lọc phiếu chuyển trên D18
- **WHEN** Giám đốc lọc D18 theo loại Phiếu chuyển công trình
- **THEN** bảng chỉ hiện các dòng có mã dạng `CCT-2026-004`

#### Scenario: Khác nhà thầu
- **WHEN** `quocbao` ghi sổ phiếu chuyển từ hợp đồng của Minh Phát sang hợp đồng của Phú Đạt đã tích xác nhận
- **THEN** dòng Ghi sổ gắn cờ "Có xác nhận bất thường"

### Requirement: Thao tác Gửi điện thoại và nhóm lọc
Thao tác mới "Gửi điện thoại" SHALL thuộc nhóm "Duyệt, ghi sổ" như "Gửi duyệt" và không tính vào ô Duyệt / ghi sổ. "Rút về" phiếu chuyển SHALL ghi là thao tác "Trả lại". "Trả lại", "Hủy", "Từ chối" SHALL thuộc nhóm "Trả lại, hủy, xóa".

#### Scenario: Gửi điện thoại
- **WHEN** `quocbao` gửi `CCT-2026-004` cho điện thoại xác nhận
- **THEN** có một dòng "Gửi điện thoại" `CCT-2026-004` **AND** ô Duyệt / ghi sổ trên D18 không tăng

#### Scenario: Lọc phiếu mua lại bị từ chối
- **WHEN** Giám đốc lọc D18 theo loại Phiếu mua lại và nhóm "Trả lại, hủy, xóa"
- **THEN** bảng chỉ hiện các dòng "Từ chối" có mã dạng `MLA-2026-003`
