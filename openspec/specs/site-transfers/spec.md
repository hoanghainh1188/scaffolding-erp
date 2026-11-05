# site-transfers Specification

## Purpose
Phiếu chuyển công trình đưa hàng thuê thẳng từ công trình của một hợp đồng sang công trình của hợp đồng thuê khác, không qua bãi: với hợp đồng đi là một lần trả, với hợp đồng nhận là một lần giao.

## Requirements

### Requirement: Phiếu chuyển giữa hai hợp đồng thuê
Mỗi phiếu chuyển SHALL có một hợp đồng đi (thuê, Đang thực hiện) và một hợp đồng nhận (thuê, Đã duyệt hoặc Đang thực hiện, khác hợp đồng đi). Số phiếu SHALL có dạng `CCT-<năm>-<số 3 chữ số>`, đếm bằng bảng đếm chứng từ. Phiếu SHALL lưu biển số xe (gõ tay, không bắt buộc) và ghi chú.

#### Scenario: Lập phiếu chuyển
- **WHEN** `quocbao` lập phiếu chuyển từ `102026/ANPHAT-MINHPHAT` (An Phú – Block B, Đang thực hiện) sang `112026/ANPHAT-MINHPHAT` (Trường THCS Dương Nội, Đã duyệt) với 50 `H1,7`, 40 `CHEO1,7`
- **THEN** hệ thống tạo `CCT-2026-004` Nháp gắn hai hợp đồng đó

#### Scenario: Hợp đồng nhận là hợp đồng bán
- **WHEN** chọn hợp đồng nhận là hợp đồng bán `112026/ANPHAT-PDLONG`
- **THEN** hệ thống từ chối với "Chỉ chuyển sang hợp đồng thuê đã duyệt hoặc đang thực hiện."

#### Scenario: Chuyển sang chính nó
- **WHEN** hợp đồng nhận trùng hợp đồng đi
- **THEN** hệ thống từ chối với "Hợp đồng nhận phải khác hợp đồng đi."

#### Scenario: Hợp đồng đi chưa có hàng ở công trình
- **WHEN** `quocbao` mở D6b của hợp đồng thuê Đã duyệt chưa xuất lần nào
- **THEN** D6 không có nút "Chuyển công trình" **AND** API lập phiếu trả "Chỉ chuyển được hàng của hợp đồng thuê đang thực hiện."

### Requirement: Mã phải có trên hợp đồng nhận
Mỗi mã của phiếu SHALL có trên bản đang áp dụng hôm nay của hợp đồng nhận (dòng theo mã hoặc trong bộ). Mã chưa có SHALL bị chặn, kèm hướng dẫn lập phụ lục.

#### Scenario: Mã chưa có trên hợp đồng nhận
- **WHEN** phiếu chuyển có 20 `MAM1,6` mà bản đang áp dụng của `112026/ANPHAT-MINHPHAT` không có `MAM1,6`
- **THEN** hệ thống từ chối với "MAM1,6 chưa có trên hợp đồng 112026/ANPHAT-MINHPHAT. Bạn lập phụ lục cho hợp đồng đó trước."

#### Scenario: Phụ lục thêm mã đã có hiệu lực
- **WHEN** phụ lục `/01` đã duyệt, hiệu lực hôm nay, thêm `MAM1,6` vào `112026/ANPHAT-MINHPHAT`
- **THEN** phiếu chuyển 20 `MAM1,6` được lưu

### Requirement: Khác nhà thầu phải xác nhận
Khi hai hợp đồng thuộc hai nhà thầu khác nhau, lưu và ghi sổ phiếu SHALL cần ô xác nhận "Hàng chuyển sang nhà thầu khác" đã tích. Cùng nhà thầu SHALL không cần.

#### Scenario: Khác nhà thầu chưa tích
- **WHEN** hợp đồng đi của Minh Phát, hợp đồng nhận của Phú Đạt và ô xác nhận chưa tích
- **THEN** hệ thống từ chối với "Hai hợp đồng khác nhà thầu (Minh Phát → Phú Đạt). Bạn tích xác nhận trước khi chuyển."

#### Scenario: Khác nhà thầu đã tích
- **WHEN** cùng phiếu đó có ô xác nhận đã tích
- **THEN** phiếu được lưu **AND** dòng nhật ký của phiếu gắn cờ "Có xác nhận bất thường"

### Requirement: Không chuyển quá số đang ở công trình
Với mỗi mã, số chuyển SHALL không vượt số đang ở công trình của hợp đồng đi lúc ghi sổ (Mới + Tốt). Lúc lập phiếu, D6b SHALL hiện số đang ở công trình theo tình trạng và chặn số vượt; lúc ghi sổ SHALL kiểm lại.

#### Scenario: Chuyển quá
- **WHEN** An Phú đang có 120 `H1,7` (20 Mới, 100 Tốt) và phiếu chuyển 130 `H1,7`
- **THEN** hệ thống từ chối với "H1,7: số chuyển (130 cái) nhiều hơn số đang ở công trình An Phú – Block B (120 cái)." **AND** không có dòng sổ nào

#### Scenario: Hàng đã trả về trước khi ghi sổ
- **WHEN** `CCT-2026-004` Nháp chuyển 50 `H1,7`, rồi phiếu thu hồi trả về bãi 100 `H1,7` làm An Phú còn 20, rồi văn phòng bấm "Xác nhận chuyển"
- **THEN** hệ thống từ chối với "H1,7: số chuyển (50 cái) nhiều hơn số đang ở công trình An Phú – Block B (20 cái)." **AND** phiếu vẫn Nháp

### Requirement: Vượt còn phải giao của hợp đồng nhận
Khi số chuyển một mã lớn hơn "còn phải giao" của hợp đồng nhận, hệ thống SHALL chỉ cảnh báo và cần người lập xác nhận, như phiếu xuất thuê (0.2 #56); nhật ký SHALL gắn cờ "Có xác nhận bất thường".

#### Scenario: Chuyển vượt
- **WHEN** Dương Nội còn phải giao 30 `CHEO1,7` và phiếu chuyển 40 `CHEO1,7` chưa xác nhận vượt
- **THEN** hệ thống từ chối với "CHEO1,7: chuyển 40 cái, hợp đồng nhận chỉ còn phải giao 30 cái. Bạn xác nhận nếu đúng."

#### Scenario: Đã xác nhận vượt
- **WHEN** cùng phiếu đó có xác nhận vượt
- **THEN** phiếu được lưu **AND** nhật ký gắn cờ "Có xác nhận bất thường"

### Requirement: Trạng thái phiếu chuyển
Phiếu SHALL có một trong: Nháp, Chờ xác nhận (đã gửi điện thoại), Đã chuyển, Đã hủy. Chuyển trạng thái: Nháp → Đã chuyển (văn phòng xác nhận); Nháp → Chờ xác nhận (gửi điện thoại); Chờ xác nhận → Đã chuyển (xác nhận trên M9); Chờ xác nhận → Nháp (văn phòng rút về); Nháp hoặc Chờ xác nhận → Đã hủy (bắt buộc lý do). Chuyển khác SHALL bị từ chối. Phiếu Đã chuyển, Đã hủy SHALL không sửa được.

#### Scenario: Gửi điện thoại
- **WHEN** `quocbao` chọn "Gửi điện thoại xác nhận" và bấm gửi `CCT-2026-004`
- **THEN** phiếu sang Chờ xác nhận **AND** không có dòng sổ nào

#### Scenario: Sửa phiếu đã gửi
- **WHEN** `quocbao` sửa số `H1,7` của `CCT-2026-004` đang Chờ xác nhận
- **THEN** hệ thống từ chối với "Phiếu đã gửi điện thoại. Bạn rút về rồi sửa."

#### Scenario: Hủy không lý do
- **WHEN** `quocbao` hủy `CCT-2026-004` Nháp mà để trống lý do
- **THEN** hệ thống từ chối với "Bạn ghi lý do hủy phiếu chuyển."

#### Scenario: Sửa cùng lúc
- **WHEN** hai người mở `CCT-2026-004` Nháp, người thứ nhất lưu trước, người thứ hai lưu với `updatedAt` cũ
- **THEN** lệnh của người thứ hai trả 409 "Phiếu vừa được người khác sửa. Bạn tải lại để xem bản mới."

### Requirement: Văn phòng xác nhận ngay
Trên D6b, "Xác nhận chuyển" với cách "Văn phòng xác nhận ngay" SHALL lưu phiếu và ghi sổ trong một transaction với số văn phòng nhập. Ngày chuyển SHALL là ngày ghi sổ theo giờ Việt Nam, không nhập tay.

#### Scenario: Xác nhận trên D6b
- **WHEN** `quocbao` bấm "Xác nhận chuyển" `CCT-2026-004` lúc 15:30 ngày 05/11/2026
- **THEN** phiếu Đã chuyển, ngày chuyển 05/11/2026 **AND** sổ có các dòng của phiếu ngày 05/11/2026

### Requirement: Người đi xe xác nhận trên M9
M9 SHALL hiện số phiếu, công trình lấy, công trình nhận (tên, địa chỉ), từng mã với số văn phòng ghi và ô "Thực chở" (stepper), biển số xe. Thực chở SHALL được bằng hoặc nhỏ hơn số văn phòng ghi, không lớn hơn; phần chở ít SHALL ở lại công trình đi. Bấm "Xác nhận đã chuyển tới <công trình nhận>" SHALL ghi sổ với số thực chở; ngày chuyển = ngày ghi sổ (giờ Việt Nam).

#### Scenario: Chở ít hơn
- **WHEN** `CCT-2026-004` ghi 50 `H1,7`, 40 `CHEO1,7` và `vantung` nhập thực chở 50 `H1,7`, 36 `CHEO1,7` rồi xác nhận
- **THEN** phiếu Đã chuyển 86 cái **AND** M9 đã hiện "Chở ít hơn 4 cái. 4 cái còn ở An Phú." trước khi bấm **AND** An Phú vẫn còn 4 `CHEO1,7` của số định chuyển

#### Scenario: Chở nhiều hơn
- **WHEN** lệnh xác nhận gửi thực chở 55 `H1,7` cho dòng văn phòng ghi 50
- **THEN** hệ thống từ chối với "Bạn chở 55 cái H1,7, nhiều hơn số văn phòng ghi 50 cái. Văn phòng cần sửa phiếu nếu muốn chuyển thêm."

#### Scenario: Không chở gì
- **WHEN** mọi dòng thực chở 0
- **THEN** hệ thống từ chối với "Phiếu chưa có hàng nào được chở. Bạn báo văn phòng hủy phiếu nếu không chuyển."

#### Scenario: Gửi muộn sang ngày sau
- **WHEN** `vantung` bấm xác nhận lúc 21:40 ngày 05/11/2026 khi mất sóng và máy gửi được lúc 06:50 ngày 06/11/2026
- **THEN** ngày chuyển là 06/11/2026 **AND** phiếu hiện "Xác nhận trên máy 05/11/2026 21:40"

### Requirement: M9 không hiện giá
M9 và mọi API dưới `/api/m/site-transfers` SHALL không trả giá thuê, giá vốn hay tiền.

#### Scenario: Đọc API M9
- **WHEN** `vantung` gửi `GET /api/m/site-transfers/CCT-2026-004`
- **THEN** dữ liệu có công trình, mã, tên, đơn vị, số văn phòng ghi **AND** không có trường giá hay tiền nào

### Requirement: Một lần xác nhận chỉ ghi sổ một lần
Mỗi lần xác nhận trên M9 SHALL mang mã nháp của điện thoại. Gửi lại cùng mã nháp sau khi đã ghi sổ SHALL trả về phiếu đã có, không ghi thêm dòng sổ hay nhật ký. Hai lần xác nhận cùng phiếu cùng lúc (văn phòng và điện thoại, hoặc hai điện thoại) SHALL chỉ một lần ghi sổ.

#### Scenario: Gửi lại vì mất mạng
- **WHEN** server đã ghi sổ `CCT-2026-004` nhưng điện thoại không nhận được trả lời và gửi lại cùng mã nháp
- **THEN** điện thoại nhận "Đã chuyển CCT-2026-004" **AND** sổ kho chỉ có một bộ dòng của phiếu **AND** chỉ có một dòng nhật ký Ghi sổ

#### Scenario: Văn phòng rút về khi điện thoại đang xác nhận
- **WHEN** `CCT-2026-004` đã ghi sổ từ M9 rồi `quocbao` bấm "Rút về"
- **THEN** hệ thống từ chối với "Phiếu CCT-2026-004 đã chuyển lúc 16:05 do Văn Tùng xác nhận."

### Requirement: Ghi sổ chuyển công trình
Ghi sổ SHALL chạy trong một transaction (phiếu, sổ kho, trạng thái hợp đồng nhận, nhật ký). Mỗi (mã + tình trạng) SHALL có `TRANSFER_OUT` ở vị trí công trình đi và `TRANSFER_IN` cùng số, cùng tình trạng ở vị trí công trình nhận, đơn giá = giá BQ hiện tại. Ở công trình đi SHALL rút Mới trước rồi Tốt. Giá BQ và tổng tồn công ty SHALL không đổi.

#### Scenario: Chuyển rút Mới trước
- **WHEN** An Phú có 20 `H1,7` Mới (giá BQ 520.000 ₫) và 100 Tốt (400.000 ₫), và phiếu chuyển 50 `H1,7`
- **THEN** sổ có `TRANSFER_OUT` −20 Mới (−10.400.000 ₫) và −30 Tốt (−12.000.000 ₫) ở An Phú **AND** `TRANSFER_IN` +20 Mới và +30 Tốt ở Dương Nội cùng giá **AND** An Phú còn 70 `H1,7` Tốt

#### Scenario: Giá BQ và tổng tồn không đổi
- **WHEN** ghi sổ phiếu trên
- **THEN** giá BQ `H1,7` Mới vẫn 520.000 ₫, Tốt vẫn 400.000 ₫ **AND** tổng tồn và tổng giá trị `H1,7` của công ty không đổi **AND** `npm run inventory:check` in "Sổ kho khớp: 0 lệch"

#### Scenario: Ghi sổ lỗi không ghi gì
- **WHEN** một dòng của phiếu bị từ chối vì chuyển quá số đang ở công trình
- **THEN** không dòng nào của phiếu được ghi **AND** phiếu và hai hợp đồng giữ nguyên trạng thái

### Requirement: Ngày chuyển với tiền thuê hai hợp đồng
Với hợp đồng đi, hàng chuyển SHALL tính là trả vào ngày chuyển (tính thuê đến hết ngày đó). Với hợp đồng nhận, hàng SHALL tính là giao vào ngày chuyển (tính thuê từ hôm sau). D6b SHALL hiện trước ảnh hưởng này.

#### Scenario: Ảnh hưởng trên D6b
- **WHEN** phiếu chuyển 50 `H1,7` (giá ngày 1.200 ₫ ở An Phú) và 40 `CHEO1,7` (300 ₫) dự kiến ghi sổ 05/11/2026, Dương Nội còn phải giao 600 `H1,7`
- **THEN** D6b hiện "An Phú (hợp đồng đi) tính đến hết 05/11", "Dương Nội (hợp đồng nhận) tính từ 06/11", "Tiền thuê 1 ngày ở An Phú giảm 72.000 ₫", "Còn phải giao ở Dương Nội H1,7 600 → 550"

### Requirement: Thuê tối thiểu khi chuyển công trình
Khi hai hợp đồng cùng nhà thầu, phần hàng chuyển SHALL không áp thuê tối thiểu 45 ngày ở hợp đồng đi (chỉ tính số ngày thật tới hết ngày chuyển). Khác nhà thầu, tối thiểu SHALL áp riêng từng hợp đồng. Phiếu đã chuyển SHALL lưu cờ cùng nhà thầu lúc ghi sổ. D6b SHALL ghi luật đang áp cho phiếu.

#### Scenario: Cùng nhà thầu
- **WHEN** 50 `H1,7` xuất cho An Phú (Minh Phát) ngày 01/11/2026 và chuyển sang Dương Nội (Minh Phát) ngày 11/11/2026
- **THEN** phiếu lưu cờ cùng nhà thầu **AND** với An Phú, 50 cái đó chỉ tính 10 ngày thật (11/11 − 01/11), không kéo tới 45 ngày **AND** D6b hiện "Cùng nhà thầu: hàng chuyển không tính tối thiểu 45 ngày ở An Phú, thuê nối tiếp sang Dương Nội."

#### Scenario: Khác nhà thầu
- **WHEN** cùng số hàng đó chuyển sang hợp đồng của Phú Đạt ngày 11/11/2026, đã tích xác nhận khác nhà thầu
- **THEN** phiếu lưu cờ khác nhà thầu **AND** An Phú vẫn áp tối thiểu 45 ngày cho 50 cái đó **AND** D6b hiện "Khác nhà thầu: mỗi hợp đồng tính tối thiểu 45 ngày riêng."

#### Scenario: Số ngày thuê
- **WHEN** 50 `H1,7` xuất cho An Phú ngày 01/09/2026 và chuyển sang Dương Nội ngày 05/11/2026, rồi Dương Nội trả về bãi ngày 30/11/2026
- **THEN** số ngày thực của 50 cái đó ở An Phú là 65 (05/11 − 01/09) **AND** ở Dương Nội là 25 (30/11 − 05/11) **AND** ngày 05/11 chỉ tính cho An Phú

### Requirement: Hợp đồng nhận chuyển Đang thực hiện
Phiếu chuyển đầu tiên ghi sổ vào hợp đồng nhận Đã duyệt (chưa có phiếu xuất nào Đã xuất) SHALL chuyển hợp đồng đó sang Đang thực hiện trong cùng transaction.

#### Scenario: Hợp đồng nhận chưa xuất lần nào
- **WHEN** `112026/ANPHAT-MINHPHAT` Đã duyệt, chưa có phiếu xuất Đã xuất, và `CCT-2026-004` ghi sổ
- **THEN** `112026/ANPHAT-MINHPHAT` sang Đang thực hiện **AND** không có dòng nhật ký riêng cho hợp đồng

### Requirement: Hai lệnh chuyển ngược chiều không kẹt
Ghi sổ phiếu chuyển SHALL khóa hai hợp đồng theo thứ tự cố định (id tăng dần) trước khi khóa phiếu, để hai lệnh A → B và B → A chạy cùng lúc đều xong, lần lượt, không lỗi deadlock.

#### Scenario: Ngược chiều cùng lúc
- **WHEN** `CCT-2026-004` (An Phú → Dương Nội, 10 `H1,7`) và `CCT-2026-005` (Dương Nội → An Phú, 10 `H1,7`) được xác nhận cùng lúc
- **THEN** cả hai phiếu Đã chuyển **AND** không lệnh nào lỗi deadlock **AND** số đang ở công trình của mỗi hợp đồng bằng trước khi chuyển

### Requirement: Không ghi sổ sang hợp đồng chưa khóa
Ghi sổ SHALL chỉ ghi vào đúng hai hợp đồng đang giữ khóa. Sau khi khóa phiếu, nếu hợp đồng đi hoặc nhận của phiếu khác cặp đã khóa (phiếu vừa được sửa), lệnh SHALL trả 409 và không ghi gì. Sửa nháp đổi hợp đồng nhận SHALL khóa hợp đồng cũ và mới theo id tăng dần trước khi khóa phiếu.

#### Scenario: Đổi hợp đồng nhận xen giữa
- **WHEN** `quocbao` sửa `CCT-2026-004` Nháp đổi hợp đồng nhận từ Dương Nội sang Mỹ Đình trong lúc `ngocanh` bấm "Xác nhận chuyển" với dữ liệu cũ
- **THEN** hoặc phiếu ghi sổ sang Dương Nội rồi lệnh sửa bị từ chối vì phiếu đã chuyển, hoặc lệnh sửa xong trước rồi lệnh xác nhận trả 409 "Phiếu vừa được người khác sửa. Bạn tải lại để xem bản mới." **AND** không có dòng sổ nào ở hợp đồng Mỹ Đình khi chưa khóa nó

### Requirement: Hàng hỏng không chuyển
Phiếu chuyển SHALL chỉ chuyển hàng Mới, Tốt và giữ nguyên tình trạng. D6b và M9 SHALL nhắc: hàng hỏng phát hiện khi chuyển không chuyển được, đưa về bãi bằng phiếu thu hồi để tính đền bù.

#### Scenario: Phát hiện hàng hỏng trên M9
- **WHEN** người đi xe thấy 4 `CHEO1,7` cong và giảm thực chở từ 40 xuống 36
- **THEN** 4 cái đó còn ở công trình An Phú **AND** M9 hiện "Hàng hỏng không chuyển: để lại xe, chở về bãi làm thu hồi."

### Requirement: Quyền với phiếu chuyển
Lập, sửa, gửi điện thoại, rút về, hủy và xác nhận văn phòng SHALL cần quyền sửa hợp đồng thuê (vai trò và phạm vi hợp đồng của tài khoản Kinh doanh). Mở M9 và xác nhận trên điện thoại SHALL cần quyền nhặt hàng (Giám đốc, Thủ kho). Xem phiếu SHALL cần quyền xem hợp đồng thuê. Server SHALL kiểm mọi lệnh và trả 403 khi thiếu quyền.

#### Scenario: Kinh doanh chỉ bán lập phiếu chuyển
- **WHEN** `thuyvy` (phạm vi "Chỉ bán") gửi `POST /api/site-transfers`
- **THEN** API trả 403 **AND** không có phiếu nào được tạo

#### Scenario: Thủ kho lập phiếu chuyển
- **WHEN** `vantung` gửi `POST /api/site-transfers`
- **THEN** API trả 403

#### Scenario: Kinh doanh xác nhận thay người đi xe
- **WHEN** `quocbao` gửi `POST /api/m/site-transfers/CCT-2026-004/post`
- **THEN** API trả 403 **AND** không có dòng sổ nào

#### Scenario: Kế toán xem phiếu
- **WHEN** `thuha` mở `/sales/site-transfers/CCT-2026-004`
- **THEN** trang hiện phiếu chỉ xem, không có nút sửa, gửi, xác nhận

### Requirement: Nhật ký phiếu chuyển
Mỗi lệnh làm đổi phiếu chuyển SHALL ghi đúng một dòng nhật ký loại Phiếu chuyển công trình trong cùng transaction: Tạo, Sửa (chỉ khi có trường đổi), Gửi điện thoại, Rút về, Hủy, Ghi sổ. Văn phòng xác nhận ngay một phiếu chưa lưu SHALL ghi một dòng Ghi sổ, không ghi thêm dòng Tạo. Lệnh bị từ chối SHALL không ghi.

#### Scenario: Ghi sổ từ M9
- **WHEN** `vantung` xác nhận `CCT-2026-004` chở 86 cái
- **THEN** có đúng một dòng Ghi sổ `CCT-2026-004` "An Phú – Block B → Dương Nội · 50 khung, 36 chéo · chở ít hơn 4 cái"

#### Scenario: Xác nhận ngay khi chưa lưu nháp
- **WHEN** `quocbao` mở D6b, nhập số rồi bấm "Xác nhận chuyển" luôn
- **THEN** có đúng một dòng nhật ký: Ghi sổ `CCT-2026-005`

#### Scenario: Xác nhận bị từ chối
- **WHEN** lệnh xác nhận bị từ chối vì chuyển quá số đang ở công trình
- **THEN** không có dòng nhật ký Ghi sổ

### Requirement: Phiếu chuyển trên Desktop
D6b SHALL mở từ D6 của hợp đồng đi (nút "Chuyển công trình", chỉ khi hợp đồng Đang thực hiện còn hàng ở công trình). Chọn hợp đồng nhận SHALL chỉ liệt kê hợp đồng thuê Đã duyệt, Đang thực hiện. Bảng hàng SHALL có mã, số đang ở công trình theo tình trạng, số chuyển, "Rút từ" (tính ra, Mới trước) và giá ngày ở hợp đồng nhận. Trang chi tiết phiếu đã chuyển SHALL chỉ xem.

#### Scenario: Cột rút từ
- **WHEN** An Phú có 20 `H1,7` Mới, 100 Tốt và `quocbao` nhập số chuyển 50
- **THEN** cột "Rút từ" hiện "20 Mới · 30 Tốt"

#### Scenario: Danh sách hợp đồng nhận
- **WHEN** `quocbao` mở ô "Công trình nhận"
- **THEN** danh sách không có hợp đồng bán, hợp đồng Nháp, Chờ duyệt, Thanh lý, Đã hủy và không có hợp đồng đi
