# deliveries Specification

## Purpose
Phiếu xuất theo đợt đưa hàng của hợp đồng đã duyệt ra khỏi bãi: văn phòng lập đợt, thủ kho nhặt và xác nhận xe rời bãi thì ghi sổ kho; hợp đồng thuê chuyển hàng tới công trình, hợp đồng bán là bán luôn. Phiếu giữ ngày giao, số giao, cước và giá bán để tính tiền thuê, thu hồi và công nợ sau này.

## Requirements

### Requirement: Phiếu xuất theo đợt của hợp đồng
Mỗi phiếu xuất SHALL thuộc đúng một hợp đồng và lấy hàng từ đúng một bãi đang dùng. Phiếu SHALL có số `PX-<năm>-<số>` tự sinh không trùng và số đợt "Đợt N" tăng dần trong hợp đồng; phiếu hủy giữ số, số không dùng lại.

#### Scenario: Lập đợt đầu
- **WHEN** `quocbao` lập đợt xuất cho hợp đồng thuê `112026/ANPHAT-MINHPHAT` (Đã duyệt) từ `BAI-01` ngày 03/11/2026
- **THEN** phiếu `PX-2026-001` được tạo ở trạng thái Chờ nhặt với "Đợt 1" và bãi `BAI-01`

#### Scenario: Đợt sau khi có đợt hủy
- **WHEN** hợp đồng đã có Đợt 1 (Đã xuất) và Đợt 2 (Đã hủy), rồi `quocbao` lập đợt mới
- **THEN** phiếu mới là "Đợt 3"

#### Scenario: Bãi ngừng dùng
- **WHEN** `quocbao` lập đợt từ `BAI-02` đã ngừng dùng
- **THEN** hệ thống từ chối với "Bãi BAI-02 đã ngừng dùng. Bạn chọn bãi khác." và không tạo phiếu

#### Scenario: Xuất từ xưởng
- **WHEN** có lệnh lập đợt với vị trí xuất là `XUONG-01`
- **THEN** hệ thống từ chối với "Phiếu xuất chỉ lấy hàng từ bãi." và không tạo phiếu

### Requirement: Chỉ xuất cho hợp đồng đang hiệu lực
Lập, sửa và ghi sổ phiếu xuất SHALL chỉ được khi hợp đồng ở trạng thái Đã duyệt hoặc Đang thực hiện. Các trạng thái khác SHALL bị từ chối với câu nêu rõ trạng thái.

#### Scenario: Hợp đồng chưa duyệt
- **WHEN** `quocbao` lập đợt cho hợp đồng `112026/ANPHAT-HOANGLONG` đang Chờ duyệt
- **THEN** hệ thống từ chối với "Hợp đồng chưa được duyệt nên chưa xuất hàng được." và không tạo phiếu

#### Scenario: Hợp đồng đã hủy
- **WHEN** có lệnh lập đợt cho hợp đồng Đã hủy
- **THEN** hệ thống từ chối với "Hợp đồng đã hủy nên không xuất hàng được."

#### Scenario: Hợp đồng đã thanh lý
- **WHEN** có lệnh ghi sổ phiếu Đang nhặt của hợp đồng đã chuyển Thanh lý
- **THEN** hệ thống từ chối với "Hợp đồng đã thanh lý nên không xuất hàng được." **AND** không có dòng sổ kho nào

### Requirement: Mã xuất phải có trên bản hợp đồng đang áp dụng
Mỗi mã trên phiếu SHALL có dòng trên bản hợp đồng (gốc hoặc phụ lục đã duyệt) đang áp dụng tại ngày lập và tại ngày ghi sổ. Mã thêm bằng phụ lục SHALL chỉ xuất được từ ngày hiệu lực của phụ lục.

#### Scenario: Mã không có trên hợp đồng
- **WHEN** `quocbao` thêm mã `CC3` vào đợt của `112026/ANPHAT-MINHPHAT` trong khi hợp đồng không có dòng `CC3`
- **THEN** hệ thống từ chối với "Mã CC3 chưa có trên hợp đồng. Bạn lập phụ lục nếu khách cần thêm mã này." và không lưu

#### Scenario: Mã thêm bằng phụ lục chưa tới ngày hiệu lực
- **WHEN** phụ lục `/01` đã duyệt thêm `CC3` hiệu lực từ 15/12/2026 và ngày 10/12/2026 `quocbao` lập đợt có `CC3`
- **THEN** hệ thống từ chối với "Mã CC3 chỉ có trên hợp đồng từ 15/12/2026."

#### Scenario: Mã thêm bằng phụ lục đã hiệu lực
- **WHEN** cùng phụ lục đó và ngày 15/12/2026 `quocbao` lập đợt 20 cái `CC3`
- **THEN** phiếu được lưu với dòng 20 cái `CC3`

### Requirement: Lập đợt theo bộ hoặc theo mã
Văn phòng SHALL lập đợt bằng bộ × số bộ hoặc mã + số lượng. Bộ SHALL tự tách thành linh kiện theo thành phần bộ trong danh mục lúc lưu và gộp với dòng lẻ cùng mã; phiếu SHALL lưu số theo mã và nhớ bộ đã chọn để hiện. Linh kiện không có trên hợp đồng SHALL làm cả lệnh bị từ chối.

#### Scenario: Rã bộ
- **WHEN** bộ `BO-1,7` gồm 2 `H1,7`, 2 `CHEO1,7`, 1 `MAM1,6` và `quocbao` lập đợt "60 bộ BO-1,7"
- **THEN** phiếu có 3 dòng: 120 `H1,7`, 120 `CHEO1,7`, 60 `MAM1,6` **AND** D6 hiện "60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm"

#### Scenario: Bộ và mã lẻ cùng mã
- **WHEN** `quocbao` lập "60 bộ BO-1,7" và thêm lẻ 40 `CHEO1,7`
- **THEN** phiếu có một dòng `CHEO1,7` 160 cái

#### Scenario: Danh mục đổi bộ sau khi lập
- **WHEN** phiếu đã lưu 60 bộ (120 `H1,7`) rồi danh mục đổi `BO-1,7` thành 4 `H1,7` mỗi bộ
- **THEN** phiếu vẫn có 120 `H1,7`

#### Scenario: Linh kiện không có trên hợp đồng
- **WHEN** hợp đồng không có dòng `MAM1,6` và `quocbao` lập đợt "60 bộ BO-1,7"
- **THEN** hệ thống từ chối với "Bộ BO-1,7 có mã MAM1,6 chưa có trên hợp đồng. Bạn chọn từng mã hoặc lập phụ lục thêm mã này."

### Requirement: Kế hoạch giao chỉ là gợi ý
Kế hoạch giao của hợp đồng SHALL chỉ dùng để điền sẵn khi lập đợt: người lập chọn một đợt kế hoạch thì phiếu điền sẵn hàng của đợt đó, sửa được. Phiếu SHALL không phải khớp ngày, số hay thứ tự của kế hoạch.

#### Scenario: Điền theo đợt kế hoạch
- **WHEN** hợp đồng có đợt kế hoạch 2 ngày 15/11/2026 "150 bộ BO-1,7 + 400 KICH-U" và `quocbao` chọn "Theo kế hoạch đợt 2"
- **THEN** form điền sẵn 150 bộ `BO-1,7` và 400 `KICH-U`

#### Scenario: Xuất khác kế hoạch
- **WHEN** kế hoạch đợt 1 là 150 bộ ngày 01/11/2026 và `quocbao` lập đợt 80 bộ ngày 05/11/2026
- **THEN** phiếu được lưu bình thường, không có cảnh báo về kế hoạch

### Requirement: Còn phải giao
Hệ thống SHALL tính "còn phải giao" mỗi lần đọc, không lưu, từ bản hợp đồng áp dụng hôm nay. Thuê: số trên hợp đồng − số đang ở công trình của hợp đồng (từ sổ kho, vào − ra), theo mã, gộp Mới/Tốt. Bán: số trên hợp đồng − tổng đã giao (phiếu Đã xuất), theo dòng hợp đồng; dòng theo kg tính bằng kg cân. Số âm SHALL hiện 0 kèm "đã giao vượt N". "Chưa lên phiếu" = còn phải giao − số cần của phiếu Chờ nhặt, Đang nhặt.

#### Scenario: Sau hai đợt
- **WHEN** hợp đồng thuê có 300 `CHEO1,7`, Đợt 1 đã xuất 120 (80 Mới + 40 Tốt), Đợt 2 Chờ nhặt cần 100
- **THEN** D6 hiện `CHEO1,7` còn phải giao 180 **AND** chưa lên phiếu 80

#### Scenario: Trả rồi lấy lại
- **WHEN** hợp đồng thuê có 300 `H1,7`, đã xuất 300, công trình trả 200 (phiếu thu hồi của hợp đồng), rồi `quocbao` lập đợt 200 `H1,7`
- **THEN** còn phải giao trước đợt đó là 200 **AND** phiếu được lưu không cần xác nhận xuất vượt **AND** nhật ký không gắn cờ "Có xác nhận bất thường"

#### Scenario: Phụ lục tăng số
- **WHEN** hợp đồng có 300 `H1,7`, đã xuất 300, rồi phụ lục đã duyệt hiệu lực hôm nay đổi thành 400
- **THEN** `H1,7` còn phải giao 100

#### Scenario: Bán theo kg
- **WHEN** hợp đồng bán có dòng `H1,7` Tốt theo kg 1.250,5 kg và một phiếu đã xuất cân 800 kg
- **THEN** dòng đó còn phải giao 450,5 kg

#### Scenario: Đã giao vượt
- **WHEN** hợp đồng thuê có 300 `CHEO1,7` và đã xuất 320
- **THEN** D6 hiện còn phải giao 0 kèm "đã giao vượt 20"

### Requirement: Số cần vượt số còn phải giao
Lập hoặc sửa đợt có số cần lớn hơn "chưa lên phiếu" SHALL: với hợp đồng thuê, cảnh báo và chỉ lưu khi người lập xác nhận xuất vượt; với hợp đồng bán, từ chối. Lúc ghi sổ, hợp đồng bán SHALL từ chối nếu số giao vượt số còn phải giao lúc đó. Dòng bán theo kg SHALL cho tổng đã giao (kể cả chuyến này và các phiếu đang mở khi lập) vượt số trên hợp đồng tới 10 % (đúng 10 % vẫn qua); vượt hơn mới từ chối.

#### Scenario: Thuê vượt chưa xác nhận
- **WHEN** `CHEO1,7` chưa lên phiếu 80 và `quocbao` lưu đợt cần 100 mà không tích xác nhận
- **THEN** hệ thống từ chối với "Đợt này xuất CHEO1,7 nhiều hơn số còn phải giao 20 cái. Bạn tích xác nhận nếu vẫn muốn xuất." và không lưu

#### Scenario: Thuê vượt có xác nhận
- **WHEN** `quocbao` lưu lại đợt đó có tích "Tôi xác nhận xuất vượt số trên hợp đồng"
- **THEN** phiếu được lưu **AND** dòng nhật ký Tạo gắn cờ "Có xác nhận bất thường" với tóm tắt có "vượt hợp đồng 20 CHEO1,7"

#### Scenario: Bán vượt
- **WHEN** hợp đồng bán còn phải giao 150 cái `H1,7` Mới và `thuyvy` lập đợt 160 cái
- **THEN** hệ thống từ chối với "Hợp đồng bán chỉ còn phải giao 150 cái H1,7 Mới. Bạn lập phụ lục nếu khách mua thêm." và không lưu

#### Scenario: Cân lệch trong dung sai
- **WHEN** dòng bán `H1,7` Tốt theo kg còn phải giao 1.250,5 kg, phiếu cần 1.250,5 kg và thủ kho cân được 1.258 kg
- **THEN** phiếu ghi sổ được với kg cân 1.258 **AND** tiền dòng tính theo 1.258 kg

#### Scenario: Cân vượt dung sai
- **WHEN** cùng dòng đó và thủ kho cân được 1.400 kg (hơn 1.375,55 kg = 1.250,5 + 10 %)
- **THEN** hệ thống từ chối với "Kg cân của H1,7 Tốt (1.400 kg) vượt số cần 1.250,5 kg quá 10 %. Văn phòng cần sửa phiếu hoặc lập phụ lục." **AND** không ghi sổ

#### Scenario: Chuyến cuối nặng hơn phần còn lại
- **WHEN** hợp đồng bán 1.000 kg `H1,7` Tốt đã giao 980 kg, văn phòng lập chuyến cuối 25 kg và thủ kho cân 25 kg
- **THEN** phiếu được lập và ghi sổ (tổng 1.005 kg ≤ 1.100 kg)
- **AND WHEN** sau đó văn phòng lập thêm 100 kg (tổng 1.105 kg)
- **THEN** hệ thống từ chối với "Hợp đồng bán chỉ còn phải giao 0 kg H1,7 Tốt. Bạn lập phụ lục nếu khách mua thêm."

#### Scenario: Bán vượt lúc ghi sổ
- **WHEN** hai phiếu bán Đang nhặt cùng cần 100 cái `H1,7` Mới khi còn phải giao 150, phiếu A đã ghi sổ 100, rồi thủ kho xác nhận phiếu B nhặt 100
- **THEN** phiếu B bị từ chối với "Hợp đồng bán chỉ còn phải giao 50 cái H1,7 Mới." **AND** không có dòng sổ của phiếu B

### Requirement: Trạng thái phiếu xuất
Phiếu SHALL có một trong các trạng thái: Chờ nhặt, Đang nhặt, Đã xuất, Đã hủy. Chuyển SHALL theo bảng: Chờ nhặt → Đang nhặt (thủ kho bắt đầu nhặt); Đang nhặt → Đã xuất (xác nhận xe rời bãi); Đang nhặt → Chờ nhặt (thủ kho trả lại văn phòng, hoặc văn phòng rút về để sửa, kèm lý do); Chờ nhặt, Đang nhặt → Đã hủy (kèm lý do). Chuyển khác SHALL bị từ chối.

#### Scenario: Bắt đầu nhặt
- **WHEN** `vantung` bấm "Bắt đầu nhặt" trên `PX-2026-140` đang Chờ nhặt lúc 09:40
- **THEN** phiếu sang Đang nhặt **AND** D6 hiện "PX-2026-140 · Đợt 3 · Văn Tùng đang nhặt hàng"

#### Scenario: Thủ kho trả lại văn phòng
- **WHEN** `vantung` trả lại `PX-2026-140` với lý do "Bãi hết chéo, văn phòng đổi đợt"
- **THEN** phiếu về Chờ nhặt **AND** D6 hiện lý do cho người lập

#### Scenario: Trả lại thiếu lý do
- **WHEN** `vantung` bấm trả lại mà để trống lý do
- **THEN** hệ thống từ chối với "Bạn ghi lý do để văn phòng biết cần đổi gì." và phiếu vẫn Đang nhặt

#### Scenario: Hủy phiếu đã xuất
- **WHEN** `quocbao` hủy `PX-2026-139` đã xuất
- **THEN** hệ thống từ chối với "Phiếu PX-2026-139 đã xuất nên không hủy được. Hàng xuất nhầm thì lập phiếu thu hồi." và không đổi dữ liệu

#### Scenario: Hủy phiếu chờ nhặt
- **WHEN** `quocbao` hủy `PX-2026-141` Chờ nhặt với lý do "Công trình dời lịch"
- **THEN** phiếu sang Đã hủy, giữ số **AND** không có dòng sổ kho nào

### Requirement: Chỉ sửa phiếu Chờ nhặt
Văn phòng SHALL chỉ sửa hàng, bãi, ngày dự kiến, cước và ghi chú của phiếu Chờ nhặt. Lệnh sửa SHALL kèm thời điểm sửa lần trước; lệch SHALL trả 409 và giữ bản đã lưu. Phiếu Đã xuất, Đã hủy SHALL không sửa được, kể cả bằng SQL.

#### Scenario: Sửa phiếu đang nhặt
- **WHEN** `quocbao` sửa số `H1,7` của `PX-2026-140` đang Đang nhặt
- **THEN** hệ thống từ chối với "Thủ kho đang nhặt phiếu PX-2026-140. Bạn rút phiếu về để sửa." và không đổi dữ liệu

#### Scenario: Hai người sửa cùng lúc
- **WHEN** `quocbao` và Giám đốc cùng mở `PX-2026-141`, Giám đốc lưu trước, rồi `quocbao` lưu
- **THEN** lệnh của `quocbao` nhận 409 với "Phiếu vừa được người khác sửa. Bạn tải lại để xem bản mới." **AND** phiếu giữ bản của Giám đốc

#### Scenario: Sửa phiếu đã xuất bằng SQL
- **WHEN** chạy `UPDATE delivery_note_line SET requested_quantity = 200` trên dòng của phiếu Đã xuất
- **THEN** DB từ chối lệnh đó

### Requirement: Rút phiếu về để sửa
Người có quyền sửa hợp đồng loại đó SHALL rút được phiếu Đang nhặt về Chờ nhặt, kèm lý do. Sau đó lần xác nhận của nháp đang nhặt trên điện thoại SHALL bị từ chối, nháp giữ số đã nhặt.

#### Scenario: Rút về khi thủ kho đang nhặt
- **WHEN** `vantung` đang nhặt `PX-2026-140` thì `quocbao` rút về với lý do "Khách đổi sang 50 bộ", sửa còn 50 bộ, rồi `vantung` bấm "Xác nhận xe rời bãi"
- **THEN** lệnh xác nhận bị từ chối với "Văn phòng đã đổi phiếu PX-2026-140 sau khi bạn bắt đầu nhặt. Bạn mở lại phiếu để nhặt theo số mới." **AND** không có dòng sổ kho nào **AND** nháp trên máy vẫn còn số đã nhặt

### Requirement: Ngày giao là ngày ghi sổ
Ngày giao của phiếu SHALL là ngày (giờ Việt Nam) server ghi sổ khi thủ kho xác nhận xe rời bãi; SHALL không nhập tay và không sớm hơn ngày đó. Giờ bấm trên điện thoại SHALL lưu để xem. Ngày giao là ngày tính thuê: không tính ngày giao, tính từ hôm sau.

#### Scenario: Xác nhận trong ngày
- **WHEN** `vantung` xác nhận `PX-2026-140` lúc 10:42 ngày 03/11/2026 và có mạng
- **THEN** phiếu có ngày giao 03/11/2026 **AND** các dòng sổ có ngày nghiệp vụ 03/11/2026

#### Scenario: Xe đi tối
- **WHEN** xe rời bãi và `vantung` xác nhận lúc 21:30 ngày 03/11/2026, xe tới công trình sáng 04/11/2026
- **THEN** ngày giao là 03/11/2026 **AND** hàng trả ngày 18/12/2026 có 45 ngày thuê (04/11 → 18/12)

#### Scenario: Gửi muộn qua ngày
- **WHEN** `vantung` bấm xác nhận lúc 22:10 ngày 05/11/2026 khi mất sóng và nháp được gửi lúc 06:30 ngày 06/11/2026
- **THEN** ngày giao là 06/11/2026 **AND** D6 hiện "Xác nhận trên máy lúc 22:10 05/11/2026"

### Requirement: Ghi sổ xuất thuê
Xác nhận phiếu của hợp đồng thuê SHALL ghi sổ, mỗi (mã + tình trạng) đã nhặt hai dòng: xuất khỏi bãi (số âm) và vào vị trí công trình của hợp đồng (số dương), cùng số lượng và tình trạng, đơn giá = giá vốn BQ hiện tại. Giá BQ và tổng tồn của (mã + tình trạng) SHALL không đổi. Thuê SHALL chỉ xuất Mới hoặc Tốt.

#### Scenario: Xuất cho công trình
- **WHEN** `H1,7` Tốt giá BQ 195.000 ₫, tồn `BAI-01` 1.240, và `PX-2026-140` của công trình `CT-0003` nhặt 120 `H1,7` Tốt
- **THEN** sổ có `DELIVERY_OUT` −120 tại `BAI-01` và `DELIVERY_IN` +120 tại `CT-0003`, đơn giá 195.000 ₫ **AND** giá BQ `H1,7` Tốt vẫn 195.000 ₫ **AND** tồn `BAI-01` còn 1.120 **AND** tồn `CT-0003` tăng 120

#### Scenario: Một mã hai tình trạng
- **WHEN** dòng `CHEO1,7` cần 120 và thủ kho nhặt 80 Mới + 40 Tốt
- **THEN** sổ có bốn dòng: ra/vào 80 `CHEO1,7` Mới và ra/vào 40 `CHEO1,7` Tốt, mỗi tình trạng theo giá BQ của nó

#### Scenario: Xuất hàng Chờ sửa cho thuê
- **WHEN** lệnh ghi sổ phiếu thuê có dòng nhặt 10 `H1,7` Chờ sửa
- **THEN** hệ thống từ chối với "Hợp đồng thuê chỉ xuất hàng Mới hoặc Tốt." **AND** không có dòng sổ nào

#### Scenario: Xuất phế liệu cho thuê
- **WHEN** lệnh ghi sổ phiếu thuê có dòng nhặt 5 `H1,7` Phế liệu
- **THEN** hệ thống từ chối với cùng câu đó **AND** không có dòng sổ nào

#### Scenario: Tồn bãi không đủ
- **WHEN** `MAM1,6` Tốt tại `BAI-01` còn 50 và thủ kho xác nhận nhặt 60 `MAM1,6` Tốt
- **THEN** hệ thống từ chối với "Không đủ hàng: MAM1,6 Tốt tại BAI-01 còn 50 cái" **AND** không dòng nào của phiếu được ghi **AND** phiếu vẫn Đang nhặt

#### Scenario: Đối chiếu sau khi xuất
- **WHEN** chạy `npm run inventory:check` ngay sau khi ghi sổ `PX-2026-140`
- **THEN** lệnh in "Sổ kho khớp: 0 lệch"

### Requirement: Ghi sổ xuất bán
Xác nhận phiếu của hợp đồng bán SHALL ghi một dòng bán (số âm) ở bãi cho mỗi dòng đã nhặt, tình trạng theo dòng hợp đồng bán (Mới, Tốt hoặc Phế liệu), đơn giá = giá vốn BQ hiện tại, không có dòng ở công trình. Số lượng ghi sổ SHALL theo đơn vị của mã; dòng bán theo kg SHALL có số kg cân trên dòng sổ.

#### Scenario: Bán theo cái
- **WHEN** hợp đồng bán có dòng `H1,7` Mới 200 cái × 320.000 ₫ và phiếu nhặt 200 cái
- **THEN** sổ có `SALE_OUT` −200 `H1,7` Mới tại `BAI-01` theo giá BQ **AND** giá BQ `H1,7` Mới không đổi **AND** tiền dòng của phiếu là 64.000.000 ₫

#### Scenario: Bán mã tính theo cái theo kg
- **WHEN** dòng bán `H1,7` Tốt theo kg giá 14.000 ₫/kg và thủ kho nhặt 90 cái, cân 1.250,5 kg
- **THEN** sổ có `SALE_OUT` −90 `H1,7` Tốt kèm kg cân 1.250,5 **AND** tiền dòng là 17.507.000 ₫

#### Scenario: Bán phế liệu theo kg
- **WHEN** dòng bán `H1,7` Phế liệu theo kg 7.500 ₫/kg (trọng lượng chuẩn 13,6 kg/cái) và thủ kho nhặt 42 cái, cân 570,5 kg
- **THEN** sổ có `SALE_OUT` −42 `H1,7` Phế liệu kèm kg cân 570,5 **AND** tiền dòng là 4.278.750 ₫

#### Scenario: Thiếu kg cân
- **WHEN** dòng bán theo kg được xác nhận mà không có số kg cân
- **THEN** hệ thống từ chối với "Dòng H1,7 Tốt bán theo kg, bạn nhập số kg cân." và không ghi sổ

#### Scenario: Bán không có công trình
- **WHEN** hợp đồng bán "Nhận hàng tại bãi" của anh Phạm Đức Long được xác nhận xuất 50 `PK-KU` Mới
- **THEN** sổ chỉ có dòng `SALE_OUT` −50 `PK-KU` Mới tại bãi, không có dòng vào vị trí nào

### Requirement: Phế liệu không đếm được số cái
Dòng bán Phế liệu của mã tính theo cái SHALL cho thủ kho nhập kg cân trước; hệ thống điền sẵn số cái ước tính = kg cân ÷ trọng lượng chuẩn, làm tròn tới số nguyên gần nhất, tối thiểu 1, không quá tồn Phế liệu của mã ở bãi xuất, thủ kho sửa được. Phiếu SHALL đánh dấu số cái là ước tính và D6, phiếu in hiện rõ điều đó.

#### Scenario: Ước tính từ kg
- **WHEN** `H1,7` có trọng lượng chuẩn 13,6 kg/cái và thủ kho nhập kg cân 570,5 cho dòng Phế liệu mà không đếm số cái
- **THEN** số cái điền sẵn là 42 **AND** sau khi ghi sổ D6 hiện "≈ 42 cái (ước tính từ 570,5 kg)"

#### Scenario: Ước tính nhiều hơn tồn bãi
- **WHEN** `H1,7` Phế liệu tại `BAI-01` còn 42 cái và thủ kho cân 612 kg (ước tính 45 cái)
- **THEN** M5 điền 42 cái và báo "Ước tính 45 cái nhưng bãi chỉ còn 42 cái Phế liệu, máy điền 42."

#### Scenario: Ít hơn một cái
- **WHEN** kg cân là 5 với trọng lượng chuẩn 13,6 kg/cái
- **THEN** số cái ước tính là 1

### Requirement: Hợp đồng chuyển Đang thực hiện khi xuất lần đầu
Phiếu xuất đầu tiên ghi sổ của hợp đồng Đã duyệt SHALL chuyển hợp đồng sang Đang thực hiện trong cùng transaction. Phiếu sau đó SHALL không đổi trạng thái hợp đồng.

#### Scenario: Phiếu đầu tiên
- **WHEN** `112026/ANPHAT-MINHPHAT` Đã duyệt, chưa có phiếu xuất ghi sổ, và `vantung` xác nhận `PX-2026-001`
- **THEN** hợp đồng sang Đang thực hiện **AND** D4 vẫn đếm hợp đồng trong "Đang hiệu lực"

#### Scenario: Ghi sổ lỗi không đổi hợp đồng
- **WHEN** lệnh xác nhận `PX-2026-001` bị từ chối vì tồn bãi không đủ
- **THEN** hợp đồng vẫn Đã duyệt

### Requirement: Xuất thiếu
Thủ kho SHALL xác nhận được phiếu với số nhặt của một dòng nhỏ hơn số cần, kể cả 0, sau khi được hỏi lại. Phần thiếu SHALL không mất mà nằm trong "còn phải giao" của hợp đồng để lập đợt sau; hệ thống SHALL không tự tạo phiếu mới. Số nhặt lớn hơn số cần của dòng SHALL bị từ chối; dòng bán theo kg so kg cân với số cần (kg), được vượt tới 10 %. Phiếu không nhặt được dòng nào SHALL không xác nhận được.

#### Scenario: Thiếu 40 chéo
- **WHEN** `PX-2026-140` cần 120 khung, 120 chéo, 60 mâm và thủ kho nhặt 120, 80, 60 rồi xác nhận
- **THEN** phiếu Đã xuất với 260 cái **AND** D6 hiện "Đợt 3 · xuất thiếu 40 chéo" **AND** còn phải giao `CHEO1,7` tăng 40 so với khi đủ **AND** không có phiếu mới nào được tạo

#### Scenario: Đợt sau nhận phần thiếu
- **WHEN** sau đợt thiếu đó `quocbao` bấm "Tạo đợt xuất" khi không còn phiếu nào chưa xong
- **THEN** form điền sẵn `CHEO1,7` theo "chưa lên phiếu", gồm cả 40 cái còn thiếu

#### Scenario: Nhặt hơn số cần
- **WHEN** dòng `H1,7` cần 120 và có lệnh xác nhận nhặt 130
- **THEN** hệ thống từ chối với "Bạn nhặt 130 cái H1,7, nhiều hơn số cần 120 cái. Văn phòng cần sửa phiếu nếu muốn xuất thêm."

#### Scenario: Không nhặt được gì
- **WHEN** có lệnh xác nhận mà mọi dòng nhặt 0
- **THEN** hệ thống từ chối với "Phiếu chưa có hàng nào được nhặt. Bạn trả lại văn phòng nếu không xuất được." và không ghi sổ

### Requirement: Cước vận chuyển chiều đi và biển số xe
Phiếu SHALL lưu "công ty gọi xe", cước chiều đi (₫, số nguyên ≥ 0, chỉ khi công ty gọi xe) và biển số xe. Khi lập đợt, "công ty gọi xe" và cước SHALL điền sẵn từ bản hợp đồng đang áp dụng; văn phòng sửa được khi phiếu Chờ nhặt. Biển số gõ tay, văn phòng hoặc thủ kho nhập. Phiếu SHALL lưu cước và đơn giá bán từng dòng; tiền tính ra từ các số đó, không lưu số cộng dồn.

#### Scenario: Cước mặc định
- **WHEN** hợp đồng có "Công ty gọi xe", cước một chiều 1.800.000 ₫ và `quocbao` lập đợt
- **THEN** phiếu điền sẵn công ty gọi xe và cước 1.800.000 ₫

#### Scenario: Sửa cước trên phiếu
- **WHEN** đợt này đi xe lớn và `quocbao` sửa cước thành 2.400.000 ₫
- **THEN** phiếu lưu cước 2.400.000 ₫ **AND** hợp đồng vẫn ghi 1.800.000 ₫

#### Scenario: Khách tự chở
- **WHEN** hợp đồng không gọi xe và khách tự chở bằng xe `51C-456.78`
- **THEN** phiếu không có cước **AND** lưu biển số `51C-456.78`

#### Scenario: Cước âm
- **WHEN** `quocbao` nhập cước −100.000 ₫
- **THEN** hệ thống từ chối với "Cước vận chuyển không được âm." và không lưu

### Requirement: Một lần xác nhận chỉ ghi sổ một lần
Mỗi lần xác nhận SHALL mang mã nháp của điện thoại. Gửi lại cùng mã nháp SHALL trả về phiếu đã ghi, không ghi sổ và không ghi nhật ký thêm. Hai lần xác nhận cùng phiếu cùng lúc SHALL chỉ một lần ghi sổ; lần kia nhận câu báo phiếu đã xuất.

#### Scenario: Gửi lại cùng mã nháp
- **WHEN** server đã ghi sổ `PX-2026-140` cho mã nháp của `vantung` nhưng điện thoại mất mạng trước khi nhận trả lời rồi tự gửi lại
- **THEN** điện thoại nhận "Đã xuất PX-2026-140" **AND** sổ kho chỉ có một bộ dòng của `PX-2026-140` **AND** chỉ có một dòng nhật ký Ghi sổ

#### Scenario: Hai thủ kho xác nhận cùng lúc
- **WHEN** `vantung` và `ducthang` cùng bấm xác nhận `PX-2026-140` từ hai điện thoại (hai mã nháp khác nhau) cùng lúc
- **THEN** đúng một lệnh ghi sổ **AND** lệnh kia bị từ chối với "Phiếu PX-2026-140 đã xuất lúc 10:42 do Văn Tùng xác nhận." **AND** tồn bãi chỉ giảm một lần

### Requirement: Không hủy hợp đồng còn phiếu xuất
Hủy hợp đồng SHALL bị từ chối khi hợp đồng có phiếu xuất Đã xuất, hoặc còn phiếu Chờ nhặt, Đang nhặt.

#### Scenario: Có phiếu đã xuất
- **WHEN** Giám đốc hủy `112026/ANPHAT-MINHPHAT` đã có `PX-2026-001` Đã xuất
- **THEN** hệ thống từ chối với "Hợp đồng đã xuất hàng nên không hủy được." và không đổi dữ liệu

#### Scenario: Còn phiếu chưa xong
- **WHEN** hợp đồng Đã duyệt chỉ có `PX-2026-141` Chờ nhặt và Giám đốc hủy hợp đồng
- **THEN** hệ thống từ chối với "Hợp đồng còn phiếu xuất PX-2026-141 chưa xong. Bạn hủy phiếu xuất đó trước rồi hủy hợp đồng."

#### Scenario: Phiếu đã hủy hết
- **WHEN** hợp đồng Đã duyệt chỉ có `PX-2026-141` Đã hủy và Giám đốc hủy hợp đồng với lý do
- **THEN** hợp đồng sang Đã hủy

### Requirement: Quyền với phiếu xuất
Lập, sửa, rút về và hủy phiếu SHALL cần quyền sửa hợp đồng của đúng loại (vai trò và phạm vi hợp đồng của tài khoản Kinh doanh). Xem D6 và chi tiết phiếu SHALL cần quyền xem hợp đồng loại đó. Bắt đầu nhặt, trả lại văn phòng và xác nhận xe rời bãi SHALL cần quyền nhặt hàng (Giám đốc, Thủ kho). Server SHALL kiểm mọi lệnh và trả 403 khi thiếu quyền.

#### Scenario: Kinh doanh chỉ bán lập đợt thuê
- **WHEN** `thuyvy` có phạm vi "Chỉ bán" gửi `POST /api/deliveries` cho hợp đồng thuê `112026/ANPHAT-MINHPHAT`
- **THEN** API trả 403 **AND** không có phiếu nào được tạo

#### Scenario: Kinh doanh chỉ bán mở D6 thuê
- **WHEN** `thuyvy` mở thẳng `/sales/contracts/<id>/deliveries` của hợp đồng thuê
- **THEN** trang hiện "Bạn không có quyền xem trang này" với mã 403

#### Scenario: Kinh doanh không xác nhận thay thủ kho
- **WHEN** `quocbao` gửi `POST /api/m/deliveries/PX-2026-140/post`
- **THEN** API trả 403 **AND** không có dòng sổ nào

#### Scenario: Thủ kho không lập đợt
- **WHEN** `vantung` gửi `POST /api/deliveries`
- **THEN** API trả 403

#### Scenario: Kế toán xem nhưng không sửa
- **WHEN** `thuha` (Kế toán) mở D6 của hợp đồng thuê rồi gửi `PUT /api/deliveries/<id>`
- **THEN** trang mở được **AND** API trả 403

### Requirement: Nhật ký thao tác phiếu xuất
Mỗi lệnh làm đổi phiếu xuất SHALL ghi đúng một dòng nhật ký loại Phiếu xuất trong cùng transaction: Tạo, Sửa (chỉ khi có trường đổi), Bắt đầu nhặt, Trả lại, Hủy, Ghi sổ. Lệnh bị từ chối SHALL không ghi. Tóm tắt Ghi sổ SHALL có số đã xuất, phần thiếu và việc hợp đồng chuyển Đang thực hiện.

#### Scenario: Ghi sổ đợt đầu
- **WHEN** `vantung` xác nhận `PX-2026-001` xuất 120 khung, 80 chéo, 60 mâm, thiếu 40 chéo, là phiếu đầu tiên của hợp đồng
- **THEN** có đúng một dòng Ghi sổ `PX-2026-001` "Xuất 120 khung, 80 chéo, 60 mâm · thiếu 40 chéo · hợp đồng sang Đang thực hiện" **AND** không có dòng nhật ký riêng cho hợp đồng

#### Scenario: Lập đợt
- **WHEN** `quocbao` lập `PX-2026-140` "Đợt 3 · 60 bộ giàn giáo 1,7m", cước 1.800.000 ₫
- **THEN** có một dòng Tạo `PX-2026-140` "Đợt 3 · 60 bộ giàn giáo 1,7m = 3 mã · cước 1.800.000 ₫"

#### Scenario: Lưu không đổi gì
- **WHEN** `quocbao` bấm Lưu trên `PX-2026-141` mà không sửa trường nào
- **THEN** không có dòng nhật ký mới

#### Scenario: Xác nhận bị từ chối
- **WHEN** lệnh xác nhận bị từ chối vì tồn bãi không đủ
- **THEN** không có dòng nhật ký Ghi sổ

### Requirement: Tiến độ cấp hàng D6
D6 SHALL là màn theo hợp đồng, mở từ D5 khi hợp đồng Đã duyệt hoặc Đang thực hiện. Hợp đồng thuê SHALL hiện bảng hàng đang ở công trình (đã xuất, đã trả, đang ở công trình, tiền 1 ngày) và ô "Đang cho thuê"; hợp đồng bán SHALL hiện đã giao và còn phải giao. D6 SHALL có còn phải giao từng mã, dòng thời gian các đợt mới nhất trước và nút "Tạo đợt xuất". Bảng chỉ tính phiếu Đã xuất.

#### Scenario: Bảng hàng ở công trình
- **WHEN** công trình đã nhận 320 `H1,7`, 360 `CHEO1,7`, 160 `MAM1,6` (giá ngày 450 ₫, 300 ₫, 375 ₫) và chưa thu hồi
- **THEN** D6 hiện từng dòng đã xuất, đã trả 0, đang ở công trình, tiền 1 ngày **AND** ô "Đang cho thuê" hiện "840 cái" và tiền một ngày của 840 cái

#### Scenario: Phiếu chưa xuất không cộng
- **WHEN** `PX-2026-140` cần 120 `H1,7` đang Đang nhặt
- **THEN** cột đã xuất chưa cộng 120 đó **AND** dưới bảng hiện "Chỉ tính phiếu đã xác nhận. Phiếu xuất đang nhặt hàng chưa được cộng."

#### Scenario: Dòng thời gian
- **WHEN** hợp đồng có `PX-2026-061` Đợt 1 xuất 15/06/2026, `PX-2026-074` Đợt 2 xuất 02/07/2026 và `PX-2026-140` Đợt 3 Đang nhặt
- **THEN** dòng thời gian hiện Đợt 3 "Đang nhặt" trên cùng, rồi Đợt 2, Đợt 1 "Đã xuất", mỗi dòng có số đã xuất và cước

#### Scenario: Nhắc phiếu gửi muộn
- **WHEN** `PX-2026-142` có ngày giao 06/11/2026 nhưng được xác nhận trên máy lúc 22:10 ngày 05/11/2026
- **THEN** D6 có khối "Cần kiểm tra" với dòng "PX-2026-142 · ngày giao 06/11/2026, xác nhận trên máy 05/11/2026"

#### Scenario: Hợp đồng chưa duyệt
- **WHEN** người dùng mở D5 của hợp đồng Nháp
- **THEN** D5 không có nút "Tiến độ cấp hàng"

#### Scenario: Hợp đồng bán
- **WHEN** hợp đồng bán `112026/ANPHAT-PDLONG` đã giao 50 / 200 cái `PK-KU` Mới
- **THEN** D6 có tiêu đề "Giao hàng · 112026/ANPHAT-PDLONG" và hiện `PK-KU` Mới đã giao 50, còn phải giao 150

### Requirement: In phiếu xuất
Phiếu Đã xuất SHALL in được. Đầu trang in SHALL lấy tên, mã số thuế, địa chỉ, điện thoại và logo từ Cài đặt công ty, không viết cứng. Bản in SHALL có số phiếu, đợt, số hợp đồng, nhà thầu, công trình (hoặc "Nhận hàng tại bãi"), ngày giao, bãi, biển số, các dòng hàng, cước khi công ty gọi xe và chỗ ký. Phiếu bán in thêm đơn giá và thành tiền. Phiếu Chờ nhặt, Đang nhặt SHALL in ra phiếu nhặt hàng không có giá và cước.

#### Scenario: In phiếu xuất thuê
- **WHEN** `quocbao` in `PX-2026-140` Đã xuất
- **THEN** bản in có tiêu đề "Phiếu xuất kho PX-2026-140", đầu trang là tên và mã số thuế công ty trong Cài đặt, số hợp đồng `112026/ANPHAT-MINHPHAT`, ngày giao, cước 1.800.000 ₫ và bốn chỗ ký Người lập phiếu, Thủ kho, Lái xe, Người nhận hàng

#### Scenario: In phiếu nhặt hàng
- **WHEN** `quocbao` in `PX-2026-141` Chờ nhặt
- **THEN** bản in có tiêu đề "Phiếu nhặt hàng PX-2026-141", số cần từng mã, cột trống ghi số nhặt **AND** không có giá hay cước

#### Scenario: In phiếu bán
- **WHEN** in phiếu bán đã xuất 90 cái `H1,7` Tốt cân 1.250,5 kg × 14.000 ₫/kg
- **THEN** bản in có tiêu đề "Phiếu giao hàng", dòng "90 cái · 1.250,5 kg", đơn giá 14.000 ₫/kg, thành tiền 17.507.000 ₫

#### Scenario: Phiếu đã hủy
- **WHEN** mở trang in của phiếu Đã hủy
- **THEN** trang báo "Phiếu đã hủy nên không in được."
