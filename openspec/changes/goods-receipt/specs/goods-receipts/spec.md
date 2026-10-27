# Spec Delta

## Purpose

Phiếu nhập ghi nhận hàng thực nhận theo từng chuyến xe của một đơn thu mua: Thủ kho đếm hoặc cân, tách tình trạng, nhập chi phí chuyến, và một lần xác nhận ghi sổ kho, tính giá vốn, đổi trạng thái đơn.

## ADDED Requirements

### Requirement: Mỗi chuyến xe một phiếu nhập
Mỗi lần Thủ kho xác nhận nhập kho SHALL tạo một phiếu nhập gắn với một đơn thu mua đang xử lý, có mã `PN-<năm>-<số>` cấp theo năm của ngày nghiệp vụ, số chuyến tăng dần trong đơn, bãi nhập, xe, giờ về, người nhập. Một đơn SHALL có nhiều phiếu. Phiếu đã ghi sổ SHALL không sửa, không xóa được.

#### Scenario: Chuyến đầu của đơn
- **WHEN** `vantung` (Thủ kho) xác nhận chuyến đầu của `PO-2026-052` ngày 26/10/2026, khi số phiếu nhập cuối năm 2026 là `PN-2026-093`
- **THEN** phiếu `PN-2026-094` được tạo với số chuyến 1 **AND** đơn hiện "1 chuyến đã nhập"

#### Scenario: Chuyến thứ hai
- **WHEN** chuyến sau của `PO-2026-052` được xác nhận
- **THEN** phiếu mới có số chuyến 2 và mã kế tiếp

#### Scenario: Đơn đã xong
- **WHEN** gửi phiếu cho `PO-2026-050` đã `DONE`
- **THEN** hệ thống từ chối với "Đơn PO-2026-050 đã xong, không nhập thêm được" **AND** không ghi gì

#### Scenario: Đơn chưa đặt
- **WHEN** gửi phiếu cho `PO-2026-054` đang Nháp
- **THEN** hệ thống từ chối với "Đơn PO-2026-054 chưa đặt, xóa đơn nháp nếu không cần nữa"

### Requirement: Mọi dòng còn mở phải đếm hoặc đánh dấu
Phiếu SHALL có đúng một dòng cho mỗi dòng còn mở của đơn, không thêm mã ngoài đơn. Mỗi dòng SHALL là "Đã đếm" (số > 0) hoặc "Chuyến này không có" (ghi 0). Phiếu SHALL có ít nhất một dòng đã đếm. Thiếu dòng thì không xác nhận được.

#### Scenario: Còn dòng chưa đếm
- **WHEN** đơn có 4 dòng mở, Thủ kho đã đếm Khung, Chéo, Phế liệu sắt lẫn, còn Mâm 1,6m chưa đếm và chưa đánh dấu
- **THEN** nút "Xác nhận nhập kho" bị vô hiệu kèm "Đếm Mâm 1,6m hoặc chọn "Chuyến này không có" để xác nhận" **AND** API cũng từ chối phiếu thiếu dòng đó với "Còn 1 mã chưa đếm hoặc đánh dấu "Chuyến này không có""

#### Scenario: Đánh dấu chuyến này không có
- **WHEN** Thủ kho chọn "Chuyến này không có" cho Mâm 1,6m và các dòng khác đã đếm
- **THEN** xác nhận được **AND** dòng Mâm lưu số 0, không ghi sổ kho

#### Scenario: Cả chuyến không có gì
- **WHEN** mọi dòng của phiếu đều "Chuyến này không có"
- **THEN** hệ thống từ chối với "Chuyến này chưa nhận mã nào"

#### Scenario: Đếm 0
- **WHEN** dòng Chéo chọn "Đã đếm" với số 0
- **THEN** dòng báo "Số đếm bằng 0 thì chọn "Chuyến này không có""

#### Scenario: Mã ngoài đơn
- **WHEN** phiếu của `PO-2026-052` gửi thêm dòng `GG-K15` không có trong đơn
- **THEN** hệ thống từ chối với "Đơn PO-2026-052 vừa thay đổi, mở lại đơn để đếm theo số mới"

### Requirement: Đơn vị khi nhận hàng
Số thực nhận SHALL theo đơn vị của mã: mã tính theo cái nhập số nguyên cái, mã tính theo kg nhập kg (tới 0,001). Dòng đặt theo kg của mã tính theo cái SHALL nhập cả số cái đếm và số kg cân; tồn kho tăng theo số cái, tiền hàng và "nhận đủ" theo kg cân. Hệ thống SHALL không tự quy kg ra cái.

#### Scenario: Mua khung theo cân
- **WHEN** dòng `GG-K17` đặt 2.000 kg giá 14.000 ₫/kg, Thủ kho đếm 146 cái và cân 1.987,5 kg
- **THEN** tồn `GG-K17` tăng 146 cái **AND** tiền hàng dòng là 27.825.000 ₫ **AND** dòng còn thiếu 12,5 kg so với đơn
- **AND** M3 hiện gợi ý "≈ 147 cái theo trọng lượng chuẩn" cạnh ô đếm mà không điền sẵn

#### Scenario: Thiếu số kg cân
- **WHEN** dòng đặt theo kg của `GG-K17` có số cái 146 nhưng chưa nhập số kg cân
- **THEN** dòng báo "Nhập số kg cân thực tế"

#### Scenario: Số lẻ với mã tính theo cái
- **WHEN** dòng Chéo nhập 399,5 cái
- **THEN** dòng báo "GG-CH tính theo cái, số lượng phải là số nguyên"

#### Scenario: Phế liệu tính theo kg
- **WHEN** dòng `PL-SAT` cân 1.250,5 kg
- **THEN** tồn `PL-SAT` Phế liệu tăng 1.250,5 kg

### Requirement: Tách tình trạng khi nhận
Đơn hàng mới SHALL nhập toàn bộ số thực nhận vào tình trạng Mới. Đơn hàng cũ SHALL chia số thực nhận của mỗi mã tính theo cái ra Tốt, Chờ sửa, Phế liệu, tổng các phần bằng đúng số thực nhận. Mã tính theo kg trong đơn hàng cũ SHALL vào thẳng Phế liệu.

#### Scenario: Đơn hàng mới
- **WHEN** đơn `PO-2026-055` (hàng mới) nhận 300 cái `GG-K15`
- **THEN** M3 không hiện ô chia tình trạng **AND** cả 300 cái vào `GG-K15` Mới

#### Scenario: Chia khớp
- **WHEN** Khung thực nhận 196, chia 150 Tốt / 34 Chờ sửa / 12 Phế liệu
- **THEN** dòng hiện "Đã chia đủ 196 cái"

#### Scenario: Chia chưa khớp
- **WHEN** Khung thực nhận 196, chia 150 Tốt / 30 Chờ sửa / 12 Phế liệu
- **THEN** thẻ dòng có viền cảnh báo kèm "Còn 4 chưa phân loại" **AND** chưa xác nhận được

### Requirement: Chi phí chuyến
Phiếu SHALL có các khoản chi phí của chuyến (tên 1–60 ký tự, số tiền nguyên > 0), có thể không có khoản nào. Chuyến đầu của đơn SHALL điền sẵn các khoản chi phí dự kiến của đơn; chuyến sau để trống. Thủ kho SHALL sửa, thêm, xóa được các khoản trước khi xác nhận.

#### Scenario: Chuyến đầu điền sẵn
- **WHEN** Thủ kho mở chuyến đầu của `PO-2026-052` có chi phí dự kiến Cước xe tải 3.500.000, Bốc xếp 1.200.000, Cầu đường 180.000
- **THEN** khối "Chi phí chuyến này" có sẵn 3 khoản đó **AND** "Tổng chi phí chuyến" là 4.880.000 ₫

#### Scenario: Chuyến sau để trống
- **WHEN** Thủ kho mở chuyến 2 của `PO-2026-052`
- **THEN** khối "Chi phí chuyến này" chưa có khoản nào **AND** tổng là 0 ₫

#### Scenario: Chi phí bằng 0
- **WHEN** một khoản chi phí nhập 0
- **THEN** ô báo "Chi phí phải lớn hơn 0"

### Requirement: Giá nhập của chuyến
Giá trị ghi sổ của mỗi dòng SHALL là tiền hàng thực nhận cộng phần chi phí của chính chuyến đó, chia theo cách chia ghi trên đơn và theo luật `landed-cost` (lô hàng cũ chia ra tình trạng theo giá sắt vụn). Tổng giá trị ghi sổ của phiếu SHALL bằng đúng tiền hàng thực nhận + tổng chi phí chuyến.

#### Scenario: Chia chi phí chuyến theo giá trị
- **WHEN** chuyến 1 của `PO-2026-052` (chia theo giá trị) có Khung 196 × 185.000, Chéo 400 × 32.000, `PL-SAT` 1.250,5 kg × 7.500, Mâm không có, chi phí 4.880.000 ₫
- **THEN** chi phí chia Khung 3.027.936 ₫, Chéo 1.068.880 ₫, `PL-SAT` 783.184 ₫ **AND** Mâm không nhận chi phí **AND** tổng giá trị ghi sổ là 63.318.750 ₫

#### Scenario: Chia chi phí chuyến theo trọng lượng
- **WHEN** cùng chuyến đó nhưng đơn chia theo trọng lượng
- **THEN** Khung nhận 2.574.002 ₫, Chéo 1.089.524 ₫, `PL-SAT` 1.216.474 ₫

#### Scenario: Lô cũ chia tình trạng
- **WHEN** Khung chuyến 1 có T = 39.287.936 ₫, chia 150 Tốt / 34 Chờ sửa / 12 Phế liệu, giá sắt vụn 7.500 ₫/kg
- **THEN** Phế liệu ghi 1.215.000 ₫, Tốt ghi 31.037.720 ₫, Chờ sửa ghi 7.035.216 ₫

#### Scenario: Chuyến không có chi phí
- **WHEN** chuyến 2 nhận 150 Mâm × 145.000 ₫ (146 Tốt / 4 Chờ sửa) và không có khoản chi phí nào
- **THEN** giá trị ghi sổ là 21.170.000 ₫ Tốt và 580.000 ₫ Chờ sửa

#### Scenario: Thiếu giá sắt vụn
- **WHEN** lô cũ có 12 Phế liệu cùng 184 Tốt/Chờ sửa và chưa có giá sắt vụn tham khảo
- **THEN** hệ thống từ chối với "Chưa có giá sắt vụn tham khảo, nhờ Giám đốc nhập ở Cài đặt" **AND** không ghi gì

#### Scenario: Chia theo giá trị khi tiền hàng bằng 0
- **WHEN** chuyến chỉ có hàng đơn giá 0 ₫ và chi phí 500.000 ₫, đơn chia theo giá trị
- **THEN** hệ thống từ chối với "Tiền hàng bằng 0 nên không chia chi phí theo giá trị được, chọn chia theo trọng lượng"

### Requirement: Xác nhận nhập kho ghi sổ kho trong một transaction
Xác nhận nhập kho SHALL trong cùng một transaction: lưu phiếu, ghi một dòng `PURCHASE_IN` vào bãi nhập cho mỗi (mã + tình trạng) có số > 0 với ngày nghiệp vụ hôm nay, cập nhật giá vốn bình quân, đổi trạng thái đơn và ghi lịch sử đơn. Lỗi ở bất kỳ bước nào SHALL làm không ghi gì.

#### Scenario: Dòng sổ của chuyến 1
- **WHEN** chuyến 1 của `PO-2026-052` được xác nhận vào `BAI-01`
- **THEN** sổ kho có 6 dòng `PURCHASE_IN` của chứng từ `PN-2026-094`: `GG-K17` Tốt +150 (31.037.720 ₫), Chờ sửa +34 (7.035.216 ₫), Phế liệu +12 (1.215.000 ₫); `GG-CH` Tốt +380 (13.175.436 ₫), Chờ sửa +20 (693.444 ₫); `PL-SAT` Phế liệu +1.250,5 kg (10.161.934 ₫)

#### Scenario: Giá vốn bình quân sau phiếu
- **WHEN** `GG-K17` Tốt tổng tồn 1.220 cái giá BQ 195.000 ₫ và phiếu nhập 150 cái Tốt giá trị 31.037.720 ₫
- **THEN** giá BQ mới = (1.220 × 195.000 + 31.037.720) ÷ 1.370 = 196.304,9 → 196.305 ₫

#### Scenario: Lỗi sổ kho làm hỏng cả phiếu
- **WHEN** `GG-CH` vừa bị ngừng dùng trước khi phiếu được ghi
- **THEN** hệ thống từ chối với "Vật tư GG-CH đã ngừng dùng" **AND** không có phiếu, dòng sổ hay đổi trạng thái đơn nào

#### Scenario: Dòng chuyến này không có không ghi sổ
- **WHEN** Mâm là "Chuyến này không có"
- **THEN** sổ kho không có dòng nào của `GG-M16` cho phiếu đó

### Requirement: Chờ giao bù theo từng dòng
Mỗi dòng còn thiếu sau chuyến SHALL có ô "Chờ giao bù phần thiếu". Dòng đếm thiếu SHALL mặc định không tích (dòng chốt theo số đã nhận); dòng "Chuyến này không có" SHALL mặc định tích "Chờ chuyến sau". Dòng đã chốt SHALL không hiện ở chuyến sau; dòng còn chờ SHALL hiện với số còn lại theo đơn.

#### Scenario: Đếm thiếu không chờ
- **WHEN** Khung đặt 200, chuyến 1 nhận 196 và Thủ kho để nguyên ô "Chờ giao bù 4 cái thiếu"
- **THEN** dòng hiện "Không tích: đơn tính theo 196 cái thực nhận" **AND** chuyến 2 không có dòng Khung

#### Scenario: Đếm thiếu có chờ
- **WHEN** Mâm đặt 100, chuyến 1 nhận 60 và Thủ kho tích "Chờ giao bù 40 cái thiếu"
- **THEN** chuyến 2 có dòng Mâm "Theo đơn: còn 40 cái"

#### Scenario: Chuyến này không có mặc định chờ
- **WHEN** Thủ kho chọn "Chuyến này không có" cho Mâm
- **THEN** ô "Chờ chuyến sau" đã tích sẵn **AND** bỏ tích được

#### Scenario: Nhận dư
- **WHEN** `PL-SAT` đặt 200 kg, chuyến nhận 212,5 kg
- **THEN** dòng hiện "Nhiều hơn đơn 12,5 kg" **AND** vẫn xác nhận được **AND** không có ô chờ giao bù

### Requirement: Trạng thái đơn sau mỗi phiếu
Sau mỗi phiếu, đơn SHALL: chuyển "Đã nhận đủ" khi mọi dòng đã nhận ít nhất bằng số đặt (dòng kg so kg cân); giữ "Đang nhận" khi còn dòng chờ giao bù; chuyển "Đã đóng" với lý do "Nhận thiếu, không chờ giao bù" khi còn dòng thiếu nhưng không dòng nào chờ.

#### Scenario: Nhận thiếu, có dòng chờ
- **WHEN** chuyến 1 của `PO-2026-052`: Khung thiếu 4 không chờ, Mâm "Chuyến này không có" và chờ
- **THEN** đơn vẫn `IN_PROGRESS`, hiện "Đang xử lý · Đang nhận"

#### Scenario: Chuyến cuối, có dòng đã chốt thiếu
- **WHEN** chuyến 2 nhận đủ 150 Mâm, Khung đã chốt ở 196/200
- **THEN** đơn chuyển `DONE` + `CLOSED` với lý do "Nhận thiếu, không chờ giao bù" **AND** hiện "Hoàn thành · Đã đóng"

#### Scenario: Nhận đủ
- **WHEN** `PO-2026-055` đặt 300 `GG-K15` và chuyến 1 nhận 300
- **THEN** đơn chuyển `DONE` + `RECEIVED`, hiện "Hoàn thành · Đã nhận đủ"

#### Scenario: Đóng đơn còn chờ giao bù từ văn phòng
- **WHEN** đơn đang chờ giao bù 40 mâm và Kinh doanh bấm "Đóng đơn, không chờ nữa"
- **THEN** đơn chuyển `DONE` + `CLOSED` **AND** không còn hiện ở "Xe sắp về" trên M1 **AND** gửi tiếp phiếu cho đơn đó bị từ chối

### Requirement: Tiền phải trả người bán
Tiền phải trả người bán của đơn SHALL bằng tổng tiền hàng thực nhận của mọi phiếu: mỗi dòng phiếu = số thực nhận (dòng kg: số kg cân) × đơn giá trên đơn, làm tròn đến 1 ₫ (0,5 lên). Chi phí chuyến SHALL không cộng vào số này.

#### Scenario: Sau chuyến 1
- **WHEN** chuyến 1 của `PO-2026-052` đã ghi sổ (chi phí chuyến 4.880.000 ₫)
- **THEN** "Phải trả người bán" là 58.438.750 ₫ kèm "chưa chốt vì còn chờ giao bù"

#### Scenario: Sau chuyến 2
- **WHEN** chuyến 2 nhận 150 Mâm × 145.000 ₫
- **THEN** "Phải trả người bán" là 80.188.750 ₫

### Requirement: Đồng thời và chống tạo trùng ở server
Mỗi phiếu SHALL mang mã nháp do máy sinh. Gửi lại cùng mã nháp SHALL trả về phiếu đã tạo, không tạo phiếu mới, không ghi thêm sổ kho. Hai phiếu khác nhau cho cùng một đơn gửi cùng lúc SHALL ghi lần lượt, mỗi phiếu một số chuyến.

#### Scenario: Gửi lại sau khi mất trả lời
- **WHEN** phiếu nháp `7f3c…` đã được ghi thành `PN-2026-094` nhưng máy không nhận được trả lời và gửi lại cùng mã nháp
- **THEN** API trả 200 với `PN-2026-094` **AND** chỉ có một phiếu và 6 dòng sổ kho của chuyến đó

#### Scenario: Hai lần gửi cùng lúc cùng mã nháp
- **WHEN** hai yêu cầu cùng mã nháp tới server cùng lúc
- **THEN** đúng một phiếu được tạo **AND** cả hai yêu cầu nhận cùng mã phiếu

#### Scenario: Hai chuyến cùng lúc
- **WHEN** hai Thủ kho cùng gửi hai phiếu khác nhau cho `PO-2026-052`, mỗi phiếu nhận một phần Khung
- **THEN** hai phiếu có số chuyến 1 và 2 **AND** phiếu ghi sau thấy số đã nhận của phiếu trước

#### Scenario: Văn phòng sửa đơn trong lúc đếm
- **WHEN** Kinh doanh sửa dòng đơn `PO-2026-055` (chưa có chuyến nhập) trong lúc Thủ kho đang đếm, rồi Thủ kho xác nhận
- **THEN** hệ thống từ chối với "Đơn PO-2026-055 vừa thay đổi, mở lại đơn để đếm theo số mới" **AND** nháp trên máy giữ nguyên số đã đếm

### Requirement: Quyền với phiếu nhập
Lập phiếu nhập và đọc đơn cần nhận trên điện thoại SHALL cần quyền `receiving.manage` (Giám đốc, Thủ kho). Xem phiếu đã ghi sổ SHALL cần `receiving.manage` hoặc `purchasing.view`. Server SHALL kiểm quyền ở mọi lệnh.

#### Scenario: Thủ kho lập phiếu
- **WHEN** `vantung` (Thủ kho) gửi `POST /api/receiving/receipts` hợp lệ
- **THEN** phiếu được tạo

#### Scenario: Kinh doanh không lập phiếu
- **WHEN** `quocbao` (Kinh doanh) gửi `POST /api/receiving/receipts`
- **THEN** API trả 403 "Bạn không có quyền thực hiện thao tác này"

#### Scenario: Kế toán xem phiếu
- **WHEN** `thuha` (Kế toán) gửi `GET /api/receiving/receipts/PN-2026-090`
- **THEN** API trả phiếu

#### Scenario: Xưởng không xem phiếu
- **WHEN** người dùng vai trò Xưởng gửi `GET /api/receiving/receipts/PN-2026-090`
- **THEN** API trả 403

#### Scenario: Chưa đăng nhập
- **WHEN** gửi `POST /api/receiving/receipts` không có phiên đăng nhập
- **THEN** API trả 401

### Requirement: Màn nhập hàng M3
Trang `/m/receive/<mã đơn>` SHALL hiện như bản vẽ M3: đầu trang "Nhập hàng <mã đơn>", "Chuyến N · x/y mã xong", người bán, xe, giờ về, loại hàng; một thẻ cho mỗi dòng còn mở; khối "Chi phí chuyến này" với khối `primary` "Tổng chi phí chuyến"; nút "Lưu nháp" và "Xác nhận nhập kho". Thẻ chưa đếm hoặc chưa chia đủ SHALL có viền cảnh báo.

#### Scenario: Mở chuyến đầu
- **WHEN** `vantung` mở `/m/receive/PO-2026-052` lần đầu
- **THEN** trang hiện "Chuyến 1 · 0/4 mã xong" và 4 thẻ có viền cảnh báo

#### Scenario: Đơn không còn nhận được
- **WHEN** mở `/m/receive/PO-2026-050` đã `DONE`
- **THEN** trang hiện "Đơn PO-2026-050 đã xong, không nhập thêm được" và nút về Việc hôm nay

#### Scenario: Giá sắt vụn trên M3
- **WHEN** đơn hàng cũ có dòng chia Phế liệu và giá sắt vụn hiện hành là 7.500 ₫/kg cập nhật 20/10/2026
- **THEN** M3 hiện "Giá sắt vụn 7.500 ₫/kg, cập nhật 20/10/2026"

### Requirement: Phiếu nhập chỉ xem
Trang `/m/receipts/<mã phiếu>` SHALL hiện phiếu đã ghi sổ: mã, đơn, chuyến, ngày giờ, xe, người nhập, bãi; từng dòng với số thực nhận, kg cân, số theo tình trạng hoặc "Chuyến này không có", chờ giao bù; các khoản chi phí và tổng. Trang SHALL không có nút sửa. Mã không có SHALL trả trang 404.

#### Scenario: Xem phiếu vừa nhập
- **WHEN** xác nhận xong `PN-2026-094`
- **THEN** trình duyệt mở `/m/receipts/PN-2026-094` **AND** hiện "Đã nhập kho PN-2026-094"

#### Scenario: Mã phiếu không có
- **WHEN** mở `/m/receipts/PN-2026-999`
- **THEN** trang 404 "Không tìm thấy phiếu nhập"
