## Purpose

Phiếu thu hồi đưa hàng thuê từ công trình về bãi: thủ kho đếm và chia tình trạng trên điện thoại (M4), ghi sổ kho theo giá BQ hiện tại, và ghi hàng mất ra khỏi công trình.

## ADDED Requirements

### Requirement: Phiếu thu hồi của hợp đồng thuê
Mỗi phiếu thu hồi SHALL thuộc đúng một hợp đồng thuê Đang thực hiện và về đúng một bãi (`YARD`) đang dùng. Số phiếu SHALL có dạng `PTH-<năm>-<số 3 chữ số>`, đếm bằng bảng đếm chứng từ. Hợp đồng bán, hợp đồng chưa có phiếu xuất (Đã duyệt), Thanh lý hoặc Đã hủy SHALL bị từ chối. Phiếu SHALL lưu biển số xe (gõ tay, không bắt buộc) và ghi chú.

#### Scenario: Thu hồi cho hợp đồng đang thực hiện
- **WHEN** `vantung` lưu phiếu thu hồi của hợp đồng thuê `112026/ANPHAT-MINHPHAT` (Đang thực hiện) về `BAI-01`, xe `29C-456.78`
- **THEN** hệ thống tạo `PTH-2026-071` gắn hợp đồng đó, bãi `BAI-01`, biển số `29C-456.78`

#### Scenario: Hợp đồng bán
- **WHEN** gửi phiếu thu hồi cho hợp đồng bán `112026/ANPHAT-PDLONG`
- **THEN** hệ thống từ chối với "Chỉ thu hồi được hàng của hợp đồng thuê đang thực hiện"

#### Scenario: Nhận về xưởng
- **WHEN** gửi phiếu thu hồi với vị trí nhận là `XUONG-01`
- **THEN** hệ thống từ chối với "Hàng thu hồi phải về một bãi. Chọn bãi nhận hàng."

### Requirement: Chia tình trạng khi trả
Mỗi dòng phiếu SHALL là một mã có số Tốt, Chờ sửa, Phế liệu và Mất (số không âm, theo đơn vị của mã; đơn vị đếm phải là số nguyên). Tổng trả về SHALL bằng Tốt + Chờ sửa + Phế liệu. Dòng có tổng trả về và số Mất cùng bằng 0 SHALL bị bỏ. Phiếu không còn dòng nào SHALL bị từ chối. M4 SHALL báo phần chưa chia khi tổng trả về khác tổng đã chia.

#### Scenario: Chia đủ
- **WHEN** dòng `H1,7` có tổng trả về 100, chia Tốt 82, Chờ sửa 15, Phế liệu 3, Mất 2
- **THEN** M4 hiện "Đã chia đủ 100 cái" **AND** phiếu ghi 100 cái trả về và 2 cái mất

#### Scenario: Chưa chia hết
- **WHEN** dòng `CHEO1,7` có tổng trả về 260 nhưng mới chia Tốt 250, Chờ sửa 5
- **THEN** M4 hiện "Còn 5 cái chưa phân loại" **AND** nút "Lưu phiếu thu hồi" bị khóa

#### Scenario: Số lẻ với hàng đếm
- **WHEN** gửi dòng `MAM1,6` với Tốt 10,5 cái
- **THEN** hệ thống từ chối với "MAM1,6 tính theo cái, số lượng phải là số nguyên"

#### Scenario: Phiếu không có hàng
- **WHEN** mọi dòng đều có trả về 0 và mất 0
- **THEN** hệ thống từ chối với "Phiếu thu hồi chưa có hàng nào. Nhập số trả về hoặc số mất của ít nhất một mã."

### Requirement: Chỉ thu hồi hàng đang ở công trình của hợp đồng
Với mỗi mã, tổng trả về + Mất SHALL không vượt số đang ở công trình của hợp đồng lúc ghi sổ (đọc từ sổ kho, gộp Mới và Tốt). Mã không có ở công trình của hợp đồng SHALL bị chặn, kể cả mã đang ở công trình của hợp đồng khác của cùng nhà thầu. M4 SHALL chỉ cho thêm mã đang ở công trình và hiện "Đang ở công trình: N" trên từng mã.

#### Scenario: Trả quá số đang ở công trình
- **WHEN** công trình của hợp đồng đang có 120 `H1,7` và phiếu ghi trả về 115, mất 10
- **THEN** hệ thống từ chối với "H1,7: trả về và mất (125 cái) nhiều hơn số đang ở công trình (120 cái). Kiểm tra lại số đếm." **AND** không có dòng sổ nào

#### Scenario: Mã của hợp đồng khác
- **WHEN** xe trả kèm 20 `MAM1,6` nhưng hợp đồng này chưa từng xuất `MAM1,6`
- **THEN** hệ thống từ chối với "MAM1,6 không có ở công trình của hợp đồng 112026/ANPHAT-MINHPHAT. Hàng của hợp đồng khác cần lập phiếu thu hồi riêng."

#### Scenario: Hai phiếu cùng lúc
- **WHEN** công trình đang có 120 `H1,7` và hai điện thoại cùng ghi sổ hai phiếu, mỗi phiếu trả 70 `H1,7`
- **THEN** đúng một phiếu được ghi sổ **AND** phiếu kia bị từ chối với thông báo trả quá số đang ở công trình (50 cái)

### Requirement: Ngày trả là ngày ghi sổ
Ngày trả của phiếu SHALL là ngày ghi sổ theo giờ Việt Nam lúc thủ kho bấm "Lưu phiếu thu hồi", không nhập tay, không ghi lùi. Nháp gửi muộn SHALL mang ngày gửi được. Hàng Mất SHALL tính là trả cùng ngày đó. Giờ bấm trên máy SHALL lưu riêng chỉ để xem.

#### Scenario: Gửi muộn sang ngày sau
- **WHEN** `vantung` bấm lưu lúc 21:50 ngày 05/11/2026 khi mất sóng và máy gửi được lúc 07:10 ngày 06/11/2026
- **THEN** ngày trả của `PTH-2026-071` là 06/11/2026 **AND** phiếu hiện "Lưu trên máy 05/11/2026 21:50"

#### Scenario: Hàng mất cùng ngày trả
- **WHEN** `PTH-2026-071` ghi sổ ngày 05/11/2026 có 2 `H1,7` mất
- **THEN** dòng sổ hàng mất có ngày nghiệp vụ 05/11/2026

### Requirement: Ghi sổ thu hồi
Ghi sổ SHALL chạy trong một transaction (phiếu, sổ kho, phiếu đền bù, nhật ký). Hàng trả về SHALL ghi `RETURN_OUT` ở vị trí công trình và `RETURN_IN` ở bãi nhận, theo giá BQ hiện tại của (mã + tình trạng), không đổi giá BQ. Ở công trình SHALL rút Mới trước rồi Tốt, lần lượt cho Tốt, Chờ sửa, Phế liệu, Mất. Hàng Mất SHALL ghi `LOSS_OUT` ở vị trí công trình.

#### Scenario: Trả về đổi tình trạng
- **WHEN** công trình có 30 `H1,7` Mới (giá BQ 520.000 ₫) và 90 Tốt (400.000 ₫), giá BQ Chờ sửa 250.000 ₫, Phế liệu 60.000 ₫, và phiếu trả Tốt 80, Chờ sửa 15, Phế liệu 3, Mất 2
- **THEN** sổ có `RETURN_OUT` −30 Mới (−15.600.000 ₫) và −68 Tốt (−27.200.000 ₫) ở công trình **AND** `RETURN_IN` +80 Tốt (32.000.000 ₫), +15 Chờ sửa (3.750.000 ₫), +3 Phế liệu (180.000 ₫) ở `BAI-01` **AND** `LOSS_OUT` −2 Tốt (−800.000 ₫) ở công trình **AND** công trình còn 20 `H1,7` Tốt

#### Scenario: Giá BQ không đổi
- **WHEN** ghi sổ phiếu trên
- **THEN** giá BQ `H1,7` Mới vẫn 520.000 ₫, Tốt 400.000 ₫, Chờ sửa 250.000 ₫, Phế liệu 60.000 ₫ **AND** `npm run inventory:check` không báo lệch

#### Scenario: Giá trị giảm trên phiếu
- **WHEN** mở chi tiết `PTH-2026-071` ở trên
- **THEN** phiếu hiện "Giá trị giảm do đổi tình trạng: 6.870.000 ₫" và "Giá trị hàng mất: 800.000 ₫"

#### Scenario: Trả về đúng tình trạng
- **WHEN** công trình có 50 `CHEO1,7` Tốt (giá BQ 90.000 ₫) và phiếu trả Tốt 50
- **THEN** tổng tồn và giá trị `CHEO1,7` Tốt của công ty không đổi **AND** tồn công trình giảm 50, tồn `BAI-01` tăng 50

### Requirement: Một lần lưu chỉ ghi sổ một lần
Mỗi lần lưu từ điện thoại SHALL mang một mã nháp. Gửi lại cùng mã nháp sau khi đã ghi sổ SHALL trả về phiếu đã có, không ghi thêm dòng sổ, phiếu đền bù hay nhật ký. Mã nháp đã dùng cho người khác SHALL bị từ chối.

#### Scenario: Gửi lại vì mất mạng
- **WHEN** máy của `vantung` gửi lưu phiếu, server ghi sổ `PTH-2026-071` nhưng máy không nhận được trả lời và gửi lại cùng mã nháp
- **THEN** server trả `PTH-2026-071` **AND** sổ kho chỉ có một bộ dòng của phiếu **AND** chỉ có một `ĐB-2026-009`

### Requirement: Nháp thu hồi trên máy
M4 SHALL tự lưu nháp trên máy (số đếm, chia tình trạng, biển số, ảnh) và hiện "Nháp · đã lưu trên máy lúc HH:mm". Khi mất sóng, "Lưu phiếu thu hồi" SHALL xếp nháp vào hàng chờ gửi cùng ảnh và gửi lại khi có mạng. Nháp chỉ thuộc người tạo trên máy đó.

#### Scenario: Mở lại nháp
- **WHEN** `vantung` đếm xong 2 / 3 mã, đóng app rồi mở lại M4 của hợp đồng đó
- **THEN** M4 hiện lại số đã đếm và "2/3 mã đã đếm"

#### Scenario: Mất sóng khi lưu
- **WHEN** `vantung` bấm "Lưu phiếu thu hồi" với 4 ảnh lúc không có mạng
- **THEN** nháp chuyển sang "Chờ gửi" trên M1 và M7 **AND** khi có mạng, ảnh và phiếu được gửi, phiếu được ghi sổ một lần

### Requirement: M4 không hiện giá
M4 và mọi API dưới `/api/m/returns` SHALL không trả đơn giá thuê, giá vốn, giá đền bù hay tiền đền bù.

#### Scenario: Đọc API M4
- **WHEN** `vantung` gửi `GET /api/m/returns/contracts/<id>`
- **THEN** dữ liệu có mã, tên, đơn vị, số đang ở công trình của từng mã **AND** không có trường giá hay tiền nào

### Requirement: Chọn công trình trên M4
M4 SHALL bắt đầu bằng danh sách công trình có hợp đồng thuê Đang thực hiện còn hàng ở công trình, tìm được theo tên công trình, nhà thầu hoặc số hợp đồng. Mỗi dòng SHALL hiện công trình, nhà thầu, số hợp đồng và tổng số đang ở công trình theo đơn vị. Bãi nhận SHALL mặc định là bãi duy nhất khi chỉ có một bãi.

#### Scenario: Tìm công trình
- **WHEN** `vantung` gõ "An Phú" trên M4
- **THEN** danh sách có "Chung cư An Phú – Block B · Cty TNHH Xây dựng Minh Phát · 112026/ANPHAT-MINHPHAT · 440 cái"

#### Scenario: Hợp đồng đã trả hết
- **WHEN** hợp đồng thuê Đang thực hiện không còn hàng nào ở công trình
- **THEN** công trình đó không có trong danh sách M4

### Requirement: Quyền với phiếu thu hồi
Mở M4, gửi ảnh và lưu phiếu thu hồi SHALL cần quyền nhập thu hồi (Giám đốc, Thủ kho). Xem chi tiết phiếu trên Desktop SHALL cần quyền xem hợp đồng thuê (vai trò và phạm vi hợp đồng của tài khoản Kinh doanh). Thủ kho SHALL xem lại phiếu đã ghi sổ trên M7 không có giá. Server SHALL kiểm mọi lệnh và trả 403 khi thiếu quyền.

#### Scenario: Kinh doanh lưu phiếu thu hồi
- **WHEN** `quocbao` gửi `POST /api/m/returns`
- **THEN** API trả 403 **AND** không có dòng sổ nào

#### Scenario: Kinh doanh chỉ bán xem phiếu thu hồi
- **WHEN** `thuyvy` (phạm vi "Chỉ bán") mở `/sales/returns/PTH-2026-071`
- **THEN** trang hiện "Bạn không có quyền xem trang này" với mã 403

#### Scenario: Kế toán xem phiếu
- **WHEN** `thuha` mở `/sales/returns/PTH-2026-071`
- **THEN** trang hiện các dòng, chia tình trạng, ảnh và giá trị giảm

### Requirement: Chi tiết phiếu thu hồi trên Desktop
Trang chi tiết SHALL hiện số phiếu, hợp đồng, công trình, bãi nhận, ngày trả, người đếm, biển số, các dòng chia Tốt / Chờ sửa / Phế liệu / Mất, ảnh, giá trị giảm do đổi tình trạng, giá trị hàng mất và liên kết tới phiếu đền bù (nếu có). Phiếu SHALL chỉ xem, không có nút sửa hay hủy.

#### Scenario: Liên kết phiếu đền bù
- **WHEN** `minhanh` mở `/sales/returns/PTH-2026-071` có phiếu đền bù `ĐB-2026-009` Chờ duyệt
- **THEN** trang có liên kết "ĐB-2026-009 · Chờ duyệt" mở D8

#### Scenario: Phiếu không có hàng hỏng
- **WHEN** mở phiếu thu hồi chỉ có hàng Tốt
- **THEN** trang hiện "Không có hàng hỏng hay mất, không có phiếu đền bù."
