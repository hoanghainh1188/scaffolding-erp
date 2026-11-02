# Spec Delta

## Purpose

Màn nhặt hàng xuất kho trên điện thoại (M5) cho Thủ kho: danh sách đã rã bộ, chọn Mới hoặc Tốt, nhập số thực nhặt và kg cân, lưu nháp khi mất sóng, rồi xác nhận xe rời bãi để ghi sổ. Màn không hiện giá.

## ADDED Requirements

### Requirement: Mở phiếu nhặt hàng
Trang `/m/deliveries/<số phiếu>` SHALL hiện đầu trang "Xuất <số phiếu>", công trình (hoặc nhà thầu với hợp đồng bán) và giờ dự kiến, tiến độ "Đã nhặt X / Y" theo từng đơn vị, câu nhắc bộ đã tự tách và luật tình trạng, ô biển số xe, danh sách nhặt và hai nút "Lưu nháp", "Xác nhận xe rời bãi". Phiếu Chờ nhặt SHALL có nút "Bắt đầu nhặt" và chưa cho nhập số.

#### Scenario: Phiếu đang nhặt
- **WHEN** `vantung` mở `/m/deliveries/PX-2026-140` (An Phú – Block B, xe 10:00, 60 bộ 1,7m, đã nhặt 200 / 300 cái)
- **THEN** trang hiện "Xuất PX-2026-140", "An Phú – Block B · xe 10:00", "Đã nhặt 200 / 300 cái" và "60 bộ giàn giáo 1,7m đã tự tách thành linh kiện. Chỉ lấy hàng Mới hoặc Tốt."

#### Scenario: Phiếu chờ nhặt
- **WHEN** `vantung` mở `PX-2026-141` đang Chờ nhặt
- **THEN** trang có nút "Bắt đầu nhặt" **AND** các ô số chưa nhập được

#### Scenario: Bắt đầu nhặt khi mất sóng
- **WHEN** `vantung` bấm "Bắt đầu nhặt" khi không có mạng
- **THEN** trang báo "Bạn cần có mạng để bắt đầu nhặt phiếu này." **AND** phiếu vẫn Chờ nhặt

#### Scenario: Phiếu đã xuất
- **WHEN** `vantung` mở `PX-2026-139` đã xuất
- **THEN** trang hiện phiếu chỉ xem với ngày giao, số đã xuất, người xác nhận

### Requirement: M5 không hiện giá
M5 và dữ liệu server trả cho M5 SHALL không có đơn giá thuê, giá bán, giá vốn, cước hay tiền. M5 SHALL hiện tồn Mới và Tốt (hoặc tình trạng của dòng bán) tại bãi xuất của phiếu.

#### Scenario: Dữ liệu trả cho điện thoại
- **WHEN** `vantung` mở M5 của phiếu bán có đơn giá 14.000 ₫/kg và cước 1.800.000 ₫
- **THEN** trang không có số tiền nào **AND** trả lời của `GET /api/m/deliveries/<số phiếu>` không có trường giá, cước hay tiền

#### Scenario: Tồn ở bãi
- **WHEN** `CHEO1,7` tại `BAI-01` có Mới 300, Tốt 2.480 và dòng cần 120
- **THEN** dòng hiện "Mới tồn 300 · Tốt tồn 2.480 · cần 120 cái"

### Requirement: Nhặt theo tình trạng cho hợp đồng thuê
Mỗi dòng của phiếu thuê SHALL cho nhập số nhặt Mới và số nhặt Tốt riêng (mặc định chỉ hiện tình trạng còn tồn nhiều hơn, thêm được tình trạng kia). Dòng SHALL có nút "Nhặt đủ" điền đúng số cần và stepper +/-. Dòng nhặt đủ SHALL hiện "Đã nhặt đủ N cái"; dòng thiếu hiện "Còn N cái". Tổng nhặt của dòng SHALL không vượt số cần.

#### Scenario: Nhặt đủ
- **WHEN** dòng `H1,7` cần 120, `vantung` bấm "Nhặt đủ" với tình trạng Tốt
- **THEN** dòng hiện "Đã nhặt đủ 120 cái"

#### Scenario: Chia hai tình trạng
- **WHEN** dòng `CHEO1,7` cần 120, `vantung` nhập Mới 80 và thêm Tốt 40
- **THEN** dòng hiện "Đã nhặt đủ 120 cái" với "Mới 80 · Tốt 40"

#### Scenario: Nhập vượt số cần
- **WHEN** dòng `MAM1,6` cần 60 và `vantung` nhập Tốt 70
- **THEN** ô báo "Dòng này chỉ cần 60 cái." **AND** không cho xác nhận tới khi sửa

#### Scenario: Không có Chờ sửa để chọn
- **WHEN** `vantung` mở danh sách tình trạng của một dòng phiếu thuê
- **THEN** chỉ có Mới và Tốt

### Requirement: Nhặt dòng bán
Dòng của phiếu bán SHALL dùng đúng tình trạng của dòng hợp đồng, không đổi được. Dòng bán theo kg SHALL có ô số cái và ô kg cân, cả hai bắt buộc trước khi xác nhận. Dòng Phế liệu của mã tính theo cái SHALL điền sẵn số cái ước tính từ kg cân khi thủ kho chưa nhập số cái.

#### Scenario: Dòng bán theo kg
- **WHEN** dòng bán `H1,7` Tốt theo kg và `vantung` nhập 90 cái, 1.250,5 kg
- **THEN** dòng hiện "90 cái · 1.250,5 kg"

#### Scenario: Phế liệu chỉ cân
- **WHEN** dòng bán `H1,7` Phế liệu (13,6 kg/cái) và `vantung` chỉ nhập 570,5 kg
- **THEN** ô số cái điền sẵn 42 với nhãn "ước tính" **AND** `vantung` sửa được thành 41

### Requirement: Biển số xe trên M5
M5 SHALL có ô biển số xe, điền sẵn biển số văn phòng đã nhập nếu có. Biển số SHALL bắt buộc khi xác nhận xe rời bãi.

#### Scenario: Thiếu biển số
- **WHEN** `vantung` bấm "Xác nhận xe rời bãi" mà để trống biển số
- **THEN** trang báo "Bạn nhập biển số xe chở hàng." và không gửi

#### Scenario: Biển số văn phòng đã nhập
- **WHEN** văn phòng đã ghi biển số `51X-000.01` trên phiếu
- **THEN** ô biển số trên M5 điền sẵn `51X-000.01`

### Requirement: Xác nhận xe rời bãi
Bấm "Xác nhận xe rời bãi" SHALL gửi số đã nhặt để ghi sổ. Khi còn dòng chưa nhặt đủ, M5 SHALL hỏi lại trước khi gửi với câu nêu số còn thiếu. Gửi xong SHALL báo "Đã xuất <số phiếu>", xóa nháp và về Việc hôm nay.

#### Scenario: Còn thiếu
- **WHEN** phiếu cần 300 cái, `vantung` nhặt 200 rồi bấm "Xác nhận xe rời bãi"
- **THEN** M5 hiện "Còn 100 cái chưa nhặt. Xác nhận luôn thì phần thiếu chuyển sang đợt sau." với hai nút "Nhặt tiếp" và "Vẫn xác nhận"

#### Scenario: Đủ hàng
- **WHEN** mọi dòng đã nhặt đủ và có biển số, `vantung` bấm xác nhận khi có mạng
- **THEN** app báo "Đã xuất PX-2026-140" **AND** nháp biến khỏi M7 **AND** trình duyệt về `/m`

#### Scenario: Bấm hai lần
- **WHEN** `vantung` bấm "Xác nhận xe rời bãi" hai lần liên tiếp
- **THEN** chỉ một yêu cầu được gửi **AND** chỉ có một lần ghi sổ

### Requirement: Nháp nhặt hàng trên máy
Số đã nhặt, tình trạng, kg cân và biển số SHALL tự lưu thành nháp trên máy sau mỗi thay đổi, theo luật nháp điện thoại chung. Xác nhận lúc mất mạng SHALL giữ nháp "Chờ gửi" và tự gửi lại; server từ chối SHALL mở lại nháp kèm lý do, không mất số đã nhặt.

#### Scenario: Tắt trang giữa chừng
- **WHEN** `vantung` đã nhặt `H1,7` 120 Tốt và `CHEO1,7` 80 Mới trên `PX-2026-140` rồi đóng trình duyệt
- **THEN** mở lại `/m/deliveries/PX-2026-140` hiện lại đúng các số đó

#### Scenario: Xác nhận lúc mất sóng
- **WHEN** `vantung` bấm "Vẫn xác nhận" khi không có mạng
- **THEN** M5 hiện "Chưa gửi được, sẽ tự gửi khi có mạng" **AND** M7 hiện nháp "Xuất · PX-2026-140" với nhãn "Chờ gửi"

#### Scenario: Văn phòng đã rút phiếu về
- **WHEN** nháp "Chờ gửi" của `PX-2026-140` được gửi lại sau khi văn phòng rút phiếu về để sửa
- **THEN** nháp chuyển "Bị từ chối" kèm "Văn phòng đã đổi phiếu PX-2026-140 sau khi bạn bắt đầu nhặt. Bạn mở lại phiếu để nhặt theo số mới." **AND** số đã nhặt vẫn còn

### Requirement: Trả lại văn phòng từ M5
Thủ kho SHALL trả lại được phiếu Đang nhặt cho văn phòng từ M5, kèm lý do, khi không xuất được (bãi hết hàng, xe không tới). Trả lại xong SHALL xóa nháp của phiếu đó trên máy.

#### Scenario: Bãi hết hàng
- **WHEN** `vantung` bấm "Trả lại văn phòng" trên `PX-2026-140` với lý do "Bãi hết chéo, văn phòng đổi đợt"
- **THEN** phiếu về Chờ nhặt **AND** nháp `PX-2026-140` biến khỏi máy **AND** M1 vẫn hiện thẻ phiếu với nhãn "Chờ nhặt"
