## Purpose

Phiên kiểm kê bãi và xưởng: Thủ kho đếm mù trên điện thoại, văn phòng xem chênh lệch so với số sổ đúng lúc đếm, Giám đốc duyệt thì sổ kho ghi dòng điều chỉnh để cân sổ.

## ADDED Requirements

### Requirement: Phiên kiểm kê chỉ ở bãi hoặc xưởng
Phiên kiểm kê (mã `KK-<năm>-<số 3 chữ số>`, VD `KK-2026-003`) SHALL gắn với đúng một vị trí loại bãi (`YARD`) hoặc xưởng (`WORKSHOP`) đang dùng. Vị trí công trình (`SITE`) hoặc đã ngừng dùng SHALL bị từ chối. Mỗi vị trí SHALL có tối đa một phiên chưa xong (Đang đếm hoặc Chờ duyệt) tại một lúc.

#### Scenario: Bắt đầu ở bãi
- **WHEN** `vantung` (Thủ kho) bắt đầu kiểm kê `BAI-01` lúc 08:00 28/10/2026, đã có `KK-2026-002`
- **THEN** phiên `KK-2026-003` được tạo ở trạng thái Đang đếm, người đếm `vantung`, bắt đầu 08:00 28/10/2026

#### Scenario: Từ chối công trình
- **WHEN** gửi yêu cầu bắt đầu kiểm kê tại `CT-0003`
- **THEN** hệ thống từ chối với "Chỉ kiểm kê bãi và xưởng" **AND** không có phiên nào được tạo

#### Scenario: Vị trí đang có phiên
- **WHEN** `BAI-01` đang có `KK-2026-003` Chờ duyệt và Thủ kho bắt đầu phiên mới tại `BAI-01`
- **THEN** hệ thống từ chối với "BAI-01 đang có phiên KK-2026-003 chưa xong"

#### Scenario: Bấm bắt đầu hai lần
- **WHEN** điện thoại gửi yêu cầu bắt đầu hai lần với cùng mã yêu cầu (mất trả lời lần đầu)
- **THEN** chỉ có một phiên **AND** lần sau nhận lại đúng `KK-2026-003`

### Requirement: Phạm vi và dòng đếm của phiên
Lúc bắt đầu, Thủ kho SHALL chọn "Tất cả mã có tồn" hoặc một hay nhiều nhóm hàng. Phiên SHALL lập danh sách dòng đếm, mỗi dòng là một (mã hàng + tình trạng) đang có tồn khác 0 tại vị trí lúc bắt đầu, thuộc phạm vi đã chọn. Phạm vi không có dòng nào SHALL bị từ chối.

#### Scenario: Chọn ba nhóm
- **WHEN** `BAI-01` có 42 dòng có tồn, Thủ kho chọn nhóm Khung (8), Chéo (6), Kích và phụ kiện (14)
- **THEN** phiên có 28 dòng **AND** nút M6a hiện "Bắt đầu đếm 28 dòng"

#### Scenario: Dòng tồn 0 không vào danh sách
- **WHEN** `GG-K15` Chờ sửa tại `BAI-01` có tồn 0 lúc bắt đầu
- **THEN** danh sách không có dòng `GG-K15` Chờ sửa

#### Scenario: Nhóm không có hàng
- **WHEN** Thủ kho chỉ chọn nhóm Cây chống mà `XUONG-01` không có cây chống nào
- **THEN** hệ thống từ chối với "Phạm vi đã chọn không có hàng nào ở XUONG-01"

### Requirement: Thêm dòng ngoài danh sách
Trong lúc đếm, Thủ kho SHALL thêm được tình trạng khác của một mã đã có trong danh sách ("Thêm tình trạng") và một mã không có trong danh sách ("Thấy hàng không có trong danh sách", tìm theo mã, tên hoặc quét QR). Dòng thêm SHALL được đếm và so sổ như dòng có sẵn. Mã đã ngừng dùng SHALL không thêm được.

#### Scenario: Thêm tình trạng Phế liệu
- **WHEN** Thủ kho đếm `GG-CH` và thấy 6 cái bẹp hẳn, thêm tình trạng Phế liệu, nhập 6
- **THEN** phiên có dòng `GG-CH` Phế liệu đếm 6 **AND** sổ lúc đếm của dòng là tồn `GG-CH` Phế liệu tại `BAI-01` lúc "Xong mã này" (VD 0, chênh lệch +6)

#### Scenario: Thêm mã ngoài phạm vi
- **WHEN** phiên chỉ gồm nhóm Khung và Thủ kho thêm `PK-KU` Tốt đếm 12
- **THEN** dòng `PK-KU` Tốt được so với sổ `PK-KU` Tốt tại vị trí lúc đếm như mọi dòng khác

### Requirement: Đếm mù
Điện thoại SHALL không nhận và không hiện số sổ, giá vốn hay chênh lệch của bất kỳ dòng nào, trong lúc đếm và cả sau khi gửi. Mã tính theo cái SHALL đếm số nguyên không âm; mã tính theo kg SHALL nhập tối đa 3 chữ số thập phân.

#### Scenario: API đếm không lộ số sổ
- **WHEN** `vantung` mở M6 của `KK-2026-003` (tồn sổ `GG-CH` Tốt là 2.480)
- **THEN** dữ liệu trả về cho điện thoại chỉ có mã, tên, tình trạng, số đã đếm của chính phiên, không có trường số sổ, giá BQ hay chênh lệch

#### Scenario: Số lẻ cho mã tính theo cái
- **WHEN** Thủ kho nhập 12,5 cho `GG-K17` Tốt
- **THEN** hệ thống từ chối với "GG-K17 tính theo cái, số lượng phải là số nguyên"

### Requirement: Đếm theo mã, xong mã này
Thủ kho SHALL đếm từng mã: bấm "Đếm mã này" (ghi giờ bắt đầu đếm mã), nhập số cho mọi tình trạng của mã bằng stepper, rồi bấm "Xong mã này" (ghi giờ xong). "Xong mã này" SHALL cần có số (kể cả 0) cho mọi dòng của mã đang cần đếm. Mã đã xong SHALL sửa được trước khi gửi; sửa thì ghi lại giờ xong.

#### Scenario: Thiếu một tình trạng
- **WHEN** `GG-CH` có dòng Tốt và Chờ sửa, Thủ kho nhập Tốt 2.450 rồi bấm "Xong mã này" khi Chờ sửa còn trống
- **THEN** M6 không cho xong mã, báo "Nhập số cho Chờ sửa (0 nếu không có)"

#### Scenario: Tiến độ đếm
- **WHEN** đã xong 17 trong 28 dòng
- **THEN** M6 hiện "17 / 28 dòng", tab "Chưa đếm (11)" và "Đã đếm (17)"

#### Scenario: Sửa mã đã đếm
- **WHEN** `GG-K17` đã xong lúc 09:12 với Tốt 1.226, Thủ kho bấm "Sửa", đổi thành 1.228 và xong lại lúc 10:05
- **THEN** dòng `GG-K17` Tốt đếm 1.228, giờ xong 10:05

### Requirement: Số sổ lúc đếm và chênh lệch
Khi phiên được gửi, hệ thống SHALL tính cho mỗi dòng đã đếm số sổ lúc đếm = tồn của (mã + tình trạng) tại vị trí, gồm mọi dòng sổ ghi trước giờ "Xong mã này" của mã đó, và chênh lệch = đếm − sổ lúc đếm. Xuất nhập vẫn làm bình thường trong lúc kiểm kê; biến động ghi sau giờ xong mã SHALL không vào số sổ lúc đếm.

#### Scenario: Có nhập trước khi xong mã
- **WHEN** `GG-K17` Tốt tại `BAI-01` có tồn 1.200 lúc bắt đầu phiên 08:00, phiếu nhập +30 lúc 08:30, Thủ kho xong mã lúc 09:12 với 1.226
- **THEN** sổ lúc đếm là 1.230 **AND** chênh lệch là −4

#### Scenario: Có xuất sau khi xong mã
- **WHEN** tiếp ca trên, phiếu xuất −100 `GG-K17` Tốt từ `BAI-01` lúc 10:00, rồi phiên được gửi lúc 11:40
- **THEN** sổ lúc đếm vẫn là 1.230 và chênh lệch vẫn là −4 **AND** sau khi duyệt, tồn `GG-K17` Tốt tại `BAI-01` là 1.126 (= 1.226 − 100)

#### Scenario: Dòng khớp
- **WHEN** `GG-M16` Tốt sổ lúc đếm 300, đếm 300
- **THEN** chênh lệch 0 **AND** dòng thuộc nhóm "Khớp"

### Requirement: Giờ trên điện thoại được chỉnh theo giờ server
Giờ "Đếm mã này" và "Xong mã này" do điện thoại ghi SHALL được chỉnh theo độ lệch giữa đồng hồ điện thoại và server lúc gửi, rồi kẹp trong khoảng từ lúc bắt đầu phiên tới lúc server nhận. Giờ đã chỉnh SHALL là giờ dùng để tính số sổ lúc đếm và cờ biến động.

#### Scenario: Đồng hồ điện thoại chậm 5 phút
- **WHEN** điện thoại gửi lúc máy ghi 11:35 nhưng server nhận lúc 11:40, mã `GG-K17` xong lúc máy ghi 09:07
- **THEN** giờ xong dùng để tính là 09:12

#### Scenario: Đồng hồ điện thoại sai ngày
- **WHEN** giờ xong sau khi chỉnh rơi trước giờ bắt đầu phiên 08:00
- **THEN** giờ xong dùng để tính là 08:00

### Requirement: Cờ cảnh báo của dòng
Mỗi dòng đã đếm SHALL có các cờ sau khi tính được: "Có nhập/xuất trong lúc đếm" khi sổ có dòng của (mã + tình trạng) tại vị trí ghi trong khoảng từ "Đếm mã này" tới "Xong mã này"; "Lệch x %" khi |chênh lệch| > 1 % sổ lúc đếm, hoặc sổ lúc đếm 0 mà đếm có hàng; "Nghi nhầm tình trạng" khi cùng mã có dòng thiếu và dòng thừa. Một dòng có thể có nhiều cờ.

#### Scenario: Lệch trên 1 %
- **WHEN** `GG-CH` Tốt sổ 2.480, đếm 2.450
- **THEN** dòng có cờ "Lệch 1,2 %"

#### Scenario: Lệch dưới 1 %
- **WHEN** `GG-K15` Tốt sổ 860, đếm 852 (0,93 %)
- **THEN** dòng không có cờ lệch

#### Scenario: Nhập trong lúc đếm mã
- **WHEN** Thủ kho bấm "Đếm mã này" cho `PK-KU` lúc 09:20, phiếu nhập +50 `PK-KU` Tốt vào `BAI-01` lúc 09:25, xong mã lúc 09:30
- **THEN** dòng `PK-KU` Tốt có cờ "Có nhập/xuất trong lúc đếm"

#### Scenario: Thiếu Tốt thừa Chờ sửa
- **WHEN** `GG-CH` Tốt lệch −30 và `GG-CH` Chờ sửa lệch +10
- **THEN** cả hai dòng có cờ "Nghi nhầm tình trạng"

### Requirement: Gửi văn phòng
Thủ kho SHALL gửi phiên về văn phòng khi đã đếm ít nhất một dòng; phiên chuyển sang Chờ duyệt. Gửi khi còn dòng chưa đếm SHALL hỏi lại "Còn N dòng chưa đếm. Gửi luôn thì các dòng đó không điều chỉnh." Dòng chưa đếm SHALL không có số sổ lúc đếm và không bao giờ sinh dòng điều chỉnh.

#### Scenario: Gửi khi còn dòng chưa đếm
- **WHEN** Thủ kho gửi `KK-2026-003` lúc 17 / 28 dòng và xác nhận
- **THEN** phiên Chờ duyệt **AND** D13 hiện "Đã đếm 17 / 28 dòng" **AND** 11 dòng chưa đếm hiện "Chưa đếm", không có chênh lệch

#### Scenario: Chưa đếm dòng nào
- **WHEN** Thủ kho gửi phiên chưa xong mã nào
- **THEN** hệ thống từ chối với "Đếm ít nhất một mã trước khi gửi"

### Requirement: Nháp đếm trên máy và gửi chống trùng
Số đếm SHALL lưu thành nháp trên điện thoại sau mỗi thay đổi, theo đúng các quy tắc nháp của khu Mobile (chỉ người tạo thấy, mất sóng vẫn đếm, tự gửi lại khi có mạng). Mỗi lần gửi SHALL mang mã lần gửi; server nhận lại cùng mã SHALL trả kết quả đã có, không ghi lần hai. Bắt đầu phiên SHALL cần mạng.

#### Scenario: Mất sóng giữa chừng
- **WHEN** điện thoại mất mạng sau khi xong 17 dòng, Thủ kho đếm tiếp 11 dòng rồi bấm "Gửi văn phòng"
- **THEN** M6 báo "Chưa gửi được, sẽ tự gửi khi có mạng" **AND** có mạng lại thì phiên được gửi với đủ 28 dòng

#### Scenario: Mất trả lời rồi gửi lại
- **WHEN** server đã nhận lần gửi của `KK-2026-003` nhưng điện thoại không nhận được trả lời và gửi lại cùng mã lần gửi
- **THEN** điện thoại nhận "Đã gửi KK-2026-003 về văn phòng" **AND** số sổ lúc đếm không bị tính lại

#### Scenario: Bắt đầu khi mất mạng
- **WHEN** Thủ kho bấm "Bắt đầu đếm" trên M6a khi không có mạng
- **THEN** M6a báo "Cần có mạng để bắt đầu phiên kiểm kê" **AND** không có phiên nào được tạo

### Requirement: Kết quả kiểm kê trên D13
Trang chi tiết phiên SHALL hiện thông tin phiên (vị trí, người đếm, bắt đầu, gửi văn phòng, phạm vi, đã đếm), bốn ô Thiếu, Thừa, Khớp, Cần xem kỹ, tổng chênh lệch giá trị, và bảng kết quả lọc Dòng lệch / Khớp / Tất cả trên URL. Mỗi dòng: hàng, tình trạng, sổ lúc đếm, đếm thực tế, chênh lệch, giá BQ, giá trị lệch, cảnh báo. Giá trị lệch = chênh lệch × giá BQ hiện tại; sau khi ghi sổ thì lấy từ dòng sổ.

#### Scenario: Tóm tắt phiên
- **WHEN** `KK-2026-003` có 5 dòng lệch: `GG-CH` Tốt −30 (31.000 ₫), `GG-CH` Chờ sửa +10 (18.000 ₫), `GG-K15` Tốt −8 (167.116 ₫), `GG-K17` Tốt −4 (195.282 ₫), `PK-KU` Tốt +2 (40.000 ₫), còn 23 dòng khớp
- **THEN** ô Thiếu hiện "−42 cái", "−3.048.056 ₫ · 3 dòng" **AND** ô Thừa "+12 cái", "+260.000 ₫ · 2 dòng" **AND** ô Khớp "23 dòng" **AND** tổng chênh lệch giá trị "−2.788.056 ₫"

#### Scenario: Lọc dòng lệch
- **WHEN** Giám đốc chọn tab "Dòng lệch (5)"
- **THEN** URL có `?filter=diff` **AND** bảng chỉ có 5 dòng lệch, dòng "Cộng" hiện "−2.788.056 ₫"

#### Scenario: Cần xem kỹ
- **WHEN** 3 dòng có ít nhất một cờ cảnh báo
- **THEN** ô Cần xem kỹ hiện "3 dòng · có cờ cảnh báo"

### Requirement: Danh sách phiên kiểm kê
Trang `/inventory/stocktakes` SHALL liệt kê mọi phiên (mã, vị trí, ngày, người đếm, dòng đã đếm / tổng, số dòng lệch, giá trị lệch, trạng thái), phiên Chờ duyệt trên cùng rồi mới nhất trước, lọc theo trạng thái trên URL. Phiên Đang đếm SHALL hiện tiến độ nhưng không hiện số sổ hay chênh lệch.

#### Scenario: Thứ tự danh sách
- **WHEN** có `KK-2026-003` Chờ duyệt (28/10), `KK-2026-002` và `KK-2026-001` Đã ghi sổ (30/09)
- **THEN** `KK-2026-003` đứng đầu với "28 / 28", "5", "−2.788.056 ₫", "Chờ duyệt"

#### Scenario: Phiên đang đếm
- **WHEN** `KK-2026-004` tại `XUONG-01` đang đếm
- **THEN** dòng của nó hiện trạng thái "Đang đếm", cột dòng lệch và giá trị lệch để "–"

### Requirement: Duyệt là ghi sổ điều chỉnh
Giám đốc duyệt phiên Chờ duyệt SHALL, trong một transaction cùng việc chuyển phiên sang Đã ghi sổ, ghi mỗi dòng có chênh lệch khác 0 thành một dòng sổ: `ADJUST_OUT` cho thiếu, `ADJUST_IN` cho thừa, tại vị trí của phiên, theo giá BQ lúc duyệt, chứng từ là mã phiên, ngày nghiệp vụ là ngày duyệt. Giá BQ SHALL không đổi. Dòng khớp và dòng chưa đếm SHALL không ghi gì.

#### Scenario: Chênh lệch sinh đúng dòng điều chỉnh
- **WHEN** Giám đốc duyệt `KK-2026-003` ngày 28/10/2026 với 5 dòng lệch như D13
- **THEN** sổ có đúng 5 dòng mới chứng từ `KK-2026-003`, ngày 28/10/2026, tại `BAI-01`: `ADJUST_OUT` −30 `GG-CH` Tốt 31.000 ₫, `ADJUST_IN` +10 `GG-CH` Chờ sửa 18.000 ₫, `ADJUST_OUT` −8 `GG-K15` Tốt 167.116 ₫, `ADJUST_OUT` −4 `GG-K17` Tốt 195.282 ₫, `ADJUST_IN` +2 `PK-KU` Tốt 40.000 ₫ **AND** giá BQ năm dòng đó không đổi **AND** tổng giá trị sổ giảm 2.788.056 ₫

#### Scenario: Giá BQ đổi giữa lúc gửi và lúc duyệt
- **WHEN** D13 hiện `GG-K17` Tốt giá BQ 195.282 ₫, rồi một phiếu nhập làm giá BQ thành 196.000 ₫ trước khi Giám đốc duyệt
- **THEN** dòng `ADJUST_OUT` −4 `GG-K17` Tốt ghi theo 196.000 ₫

#### Scenario: Phiên khớp hết
- **WHEN** Giám đốc duyệt phiên có 9 dòng đã đếm, cả 9 dòng khớp
- **THEN** phiên chuyển Đã ghi sổ **AND** sổ kho không có dòng nào mới

#### Scenario: Dòng thừa chưa từng có giá
- **WHEN** dòng `GG-K12` Mới thừa +5 mà `GG-K12` Mới chưa từng có giá BQ, Giám đốc bấm duyệt không nhập đơn giá
- **THEN** hệ thống từ chối với "GG-K12 Mới chưa có giá vốn, nhập đơn giá" **AND** nhập 150.000 ₫ rồi duyệt thì ghi `ADJUST_IN` +5 theo 150.000 ₫

### Requirement: Kiểm tồn lại và chống duyệt hai lần
Duyệt SHALL kiểm tồn tại lúc duyệt: dòng thiếu làm tồn của (mã + tình trạng) tại vị trí xuống dưới 0 thì từ chối cả phiên và phiên vẫn Chờ duyệt. Vật tư hay vị trí đã ngừng dùng cũng từ chối cả phiên. Phiên Đã ghi sổ SHALL không duyệt lại, trả lại, đếm lại hay hủy được, kể cả khi hai lệnh duyệt tới cùng lúc.

#### Scenario: Tồn đã xuất hết trước khi duyệt
- **WHEN** dòng `GG-CH` Tốt lệch −30 nhưng trước lúc duyệt tồn `GG-CH` Tốt tại `BAI-01` chỉ còn 20
- **THEN** duyệt bị từ chối với "Không đủ hàng: GG-CH Tốt tại BAI-01 còn 20 cái" **AND** sổ không có dòng nào của `KK-2026-003` **AND** phiên vẫn Chờ duyệt

#### Scenario: Duyệt hai lần
- **WHEN** Giám đốc bấm "Duyệt và ghi sổ" `KK-2026-003` ở hai tab cùng lúc
- **THEN** sổ chỉ có một bộ 5 dòng của `KK-2026-003` **AND** lần sau nhận "Phiên kiểm kê đã được ghi sổ"

### Requirement: Yêu cầu đếm lại một số dòng
Giám đốc SHALL chọn một hay nhiều dòng đã đếm của phiên Chờ duyệt và bấm "Yêu cầu đếm lại N dòng". Phiên SHALL về Đang đếm; các dòng chọn xóa số đếm và hiện "Cần đếm lại" trên điện thoại của người đếm; các dòng khác giữ nguyên số đếm và số sổ lúc đếm. Lần gửi sau chỉ tính lại các dòng được đếm lại.

#### Scenario: Đếm lại một dòng
- **WHEN** Giám đốc chọn `GG-CH` Chờ sửa của `KK-2026-003` và bấm "Yêu cầu đếm lại 1 dòng"
- **THEN** phiên về Đang đếm **AND** M6 của `vantung` chỉ có dòng `GG-CH` Chờ sửa cần đếm, nhãn "Cần đếm lại" **AND** 27 dòng khác vẫn giữ số cũ

#### Scenario: Gửi lại sau khi đếm lại
- **WHEN** Thủ kho đếm lại `GG-CH` Chờ sửa được 42, xong mã lúc 14:10 rồi gửi
- **THEN** dòng đó có sổ lúc đếm tính theo 14:10 và chênh lệch mới **AND** dòng `GG-K17` Tốt vẫn sổ 1.230, đếm 1.226

#### Scenario: Không chọn dòng nào
- **WHEN** Giám đốc bấm "Yêu cầu đếm lại" khi chưa chọn dòng
- **THEN** nút không bấm được

### Requirement: Trả lại phiên
Giám đốc SHALL trả lại phiên Chờ duyệt kèm lý do (không để trống, tối đa 500 ký tự). Phiên SHALL về Đang đếm, giữ mọi số đã đếm, hiện lý do trên điện thoại; Thủ kho sửa bất kỳ mã nào rồi gửi lại.

#### Scenario: Trả lại có lý do
- **WHEN** Giám đốc trả lại `KK-2026-003` với lý do "Đếm lại cả khu chéo sau xưởng"
- **THEN** phiên Đang đếm **AND** M6 hiện "Văn phòng trả lại: Đếm lại cả khu chéo sau xưởng" **AND** số đã đếm vẫn còn

#### Scenario: Trả lại không lý do
- **WHEN** Giám đốc bấm "Trả lại" để trống lý do
- **THEN** hệ thống từ chối với "Nhập lý do trả lại"

### Requirement: Hủy phiên
Phiên chưa ghi sổ SHALL hủy được kèm lý do: người đếm (hoặc người có `stocktake.count`) hủy phiên Đang đếm; Giám đốc hủy phiên Đang đếm hoặc Chờ duyệt. Phiên đã hủy SHALL không ghi gì vào sổ, vẫn hiện trong danh sách với trạng thái "Đã hủy", và vị trí được bắt đầu phiên mới.

#### Scenario: Thủ kho hủy phiên bắt đầu nhầm
- **WHEN** `vantung` hủy `KK-2026-004` đang đếm với lý do "Chọn nhầm xưởng"
- **THEN** phiên "Đã hủy" **AND** `XUONG-01` bắt đầu được phiên mới

#### Scenario: Thủ kho hủy phiên chờ duyệt
- **WHEN** `vantung` gửi lệnh hủy `KK-2026-003` đang Chờ duyệt
- **THEN** hệ thống từ chối với "Phiên đã gửi văn phòng, nhờ Giám đốc hủy"

### Requirement: Quyền kiểm kê
Bắt đầu, đếm, gửi và hủy phiên Đang đếm SHALL cần `stocktake.count` (`DIRECTOR`, `WAREHOUSE`). Xem danh sách và D13 SHALL cần `inventory.view`. Duyệt, trả lại, yêu cầu đếm lại và hủy phiên Chờ duyệt SHALL cần `inventory.approve`. Server SHALL kiểm quyền ở mọi API, trả 403 "Bạn không có quyền thực hiện thao tác này".

#### Scenario: Kế toán xem nhưng không duyệt
- **WHEN** `thuha` (Kế toán) mở `/inventory/stocktakes/KK-2026-003` rồi gửi `POST /api/stocktakes/KK-2026-003/approve`
- **THEN** trang mở được, không có nút "Duyệt và ghi sổ" **AND** API trả 403 **AND** sổ kho không đổi

#### Scenario: Kinh doanh bắt đầu kiểm kê
- **WHEN** `quocbao` (Kinh doanh) gửi `POST /api/stocktakes`
- **THEN** API trả 403 **AND** không có phiên nào được tạo

#### Scenario: Thủ kho đọc D13
- **WHEN** `vantung` (Thủ kho) gửi `GET /api/stocktakes/KK-2026-003`
- **THEN** API trả 403
