## Purpose

Tính tiền thuê của hợp đồng thuê theo kỳ tháng từ sổ kho, cho Kế toán kiểm từng dòng, chốt kỳ để khóa số và lưu số phải thu cùng hạn trả cho công nợ; in bảng kê và xuất Excel.

## ADDED Requirements

### Requirement: Kỳ tính tiền thuê theo tháng
Kỳ tính tiền thuê SHALL là một tháng dương lịch, từ ngày 1 đến ngày cuối tháng (28, 29, 30 hoặc 31 ngày), cho mọi hợp đồng thuê (`billing_cycle` "Hàng tháng · ngày cuối tháng"). Một hợp đồng thuê SHALL có trong danh sách của một kỳ khi kỳ đó có ít nhất một dòng tiền thuê, dòng bù tối thiểu, dòng điều chỉnh hoặc cước vận chuyển của hợp đồng. Hợp đồng bán SHALL không có trong danh sách.

#### Scenario: Kỳ tháng 2 năm thường
- **WHEN** Kế toán chọn kỳ 02/2027 trên D7
- **THEN** D7 hiện "Kỳ 02/2027 · 01/02 – 28/02" và kỳ có 28 ngày

#### Scenario: Hợp đồng đã trả hết hàng
- **WHEN** hợp đồng thuê trả hết hàng ngày 20/01/2027, không có cước hay dòng điều chỉnh nào ở kỳ 02/2027
- **THEN** hợp đồng không có trong danh sách kỳ 02/2027

#### Scenario: Hợp đồng bán không vào danh sách
- **WHEN** hợp đồng bán theo kg có phiếu xuất ngày 10/02/2027
- **THEN** danh sách kỳ 02/2027 không có hợp đồng bán đó

### Requirement: Giao và trả đọc từ sổ kho
Hệ thống SHALL tính tiền thuê chỉ từ dòng sổ kho thuộc hợp đồng (phiếu xuất, phiếu thu hồi, phiếu chuyển công trình theo dấu dòng, phiếu mua lại đã duyệt), không từ số lưu cộng dồn. Dòng `DELIVERY_IN`, `TRANSFER_IN` SHALL là "giao"; `RETURN_OUT`, `LOSS_OUT`, `TRANSFER_OUT`, `SALE_OUT` của phiếu mua lại SHALL là "trả". Ngày giao, ngày trả SHALL là ngày nghiệp vụ của chứng từ, không phải giờ bấm trên máy. Tình trạng Mới hay Tốt SHALL không đổi tiền thuê.

#### Scenario: Nháp gửi muộn sang ngày sau
- **WHEN** thủ kho bấm xác nhận phiếu thu hồi trên máy lúc 23:50 ngày 28/02/2027 khi mất sóng, nháp gửi được lúc 07:10 ngày 01/03/2027
- **THEN** ngày trả là 01/03/2027 và kỳ 02/2027 tính hàng đó tới hết 28/02/2027

#### Scenario: Phiếu mua lại chưa duyệt
- **WHEN** phiếu mua lại 50 `MAM1,6` Chờ duyệt lập ngày 10/02/2027 và chưa duyệt tới hết tháng
- **THEN** kỳ 02/2027 vẫn tính 50 `MAM1,6` đủ tới 28/02/2027

#### Scenario: Hai hợp đồng cùng công trình
- **WHEN** công trình An Phú – Block B có hợp đồng A đang thuê 100 `H1,7` và hợp đồng B đang thuê 40 `H1,7`
- **THEN** bảng kê của A chỉ có 100 `H1,7` và bảng kê của B chỉ có 40 `H1,7`

### Requirement: Lượng hàng và thứ tự rút khi trả
Mỗi dòng "giao" của một mã SHALL là một lượng hàng có ngày giao và chứng từ giao. Hàng "trả" của một mã SHALL rút lần lượt từ lượng hàng có ngày giao sớm nhất (cùng ngày thì chứng từ có mã nhỏ hơn trước), không theo tình trạng. Mỗi phần lượng hàng (cùng ngày giao, cùng ngày trả hoặc còn ở công trình) SHALL là một dòng trên bảng kê.

#### Scenario: Trả một phần, rút lượng giao sớm nhất
- **WHEN** hợp đồng giao 100 `H1,7` ngày 01/11/2026 (`PX-2026-001`) và 50 `H1,7` ngày 10/11/2026 (`PX-2026-004`), rồi trả 120 `H1,7` ngày 20/11/2026
- **THEN** 100 cái của `PX-2026-001` và 20 cái của `PX-2026-004` là hàng trả ngày 20/11/2026 **AND** 30 cái của `PX-2026-004` còn ở công trình

#### Scenario: Số lượng 0
- **WHEN** lượng hàng 100 `H1,7` giao 01/10/2026 đã trả hết ngày 31/10/2026
- **THEN** bảng kê kỳ 11/2026 không có dòng nào của lượng hàng đó và không có dòng bù

### Requirement: Số ngày tính trong kỳ
Với mỗi phần lượng hàng, trong một kỳ hệ thống SHALL tính: Từ = max(ngày đầu kỳ, hôm sau ngày giao); Đến = min(ngày cuối kỳ, ngày trả) (gồm ngày trả); hàng còn ở công trình thì Đến = ngày cuối kỳ. Ngày lịch = Đến − Từ + 1; Từ sau Đến thì phần đó không có dòng trong kỳ. Thành tiền SHALL = số lượng × ngày tính × giá ngày, làm tròn tới 1 ₫ (nửa lên) cho từng dòng. Một ngày có cả giao và trả của cùng hàng (đổi hàng, chuyển đi rồi chuyển về) SHALL chỉ tính cho bên trả.

#### Scenario: Giao trước kỳ, chưa trả
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày giao 15/10/2026, chưa trả, không có ngày nghỉ, tính kỳ 11/2026
- **THEN** dòng có Từ 01/11, Đến 30/11, 30 ngày, thành tiền 3.600.000 ₫

#### Scenario: Giao trong kỳ, tính từ hôm sau
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày giao 10/11/2026, chưa trả, tính kỳ 11/2026
- **THEN** dòng có Từ 11/11, Đến 30/11, 20 ngày, thành tiền 2.400.000 ₫

#### Scenario: Trả trong kỳ, gồm ngày trả
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày giao 15/10/2026, trả 20/11/2026, tính kỳ 11/2026
- **THEN** dòng có Từ 01/11, Đến 20/11, 20 ngày, thành tiền 2.400.000 ₫

#### Scenario: Trả đúng ngày đầu kỳ
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày giao 15/10/2026, trả 01/11/2026
- **THEN** kỳ 10/2026 có dòng 16/10 – 31/10, 16 ngày, 1.920.000 ₫ **AND** kỳ 11/2026 có dòng 01/11 – 01/11, 1 ngày, 120.000 ₫

#### Scenario: Giao ngày cuối kỳ
- **WHEN** 100 `H1,7` giao 30/11/2026
- **THEN** kỳ 11/2026 không có dòng tiền thuê của lượng hàng đó **AND** kỳ 12/2026 tính từ 01/12/2026

#### Scenario: Hàng mất thôi tính từ ngày lập phiếu thu hồi
- **WHEN** 2 `KU0,5` giá 400 ₫/ngày giao 01/09/2026, ghi mất ở `PTH-2026-012` ngày 20/11/2026
- **THEN** kỳ 11/2026 có dòng "Mất" 01/11 – 20/11, 20 ngày, 16.000 ₫ **AND** kỳ 12/2026 không còn dòng của 2 cái đó

#### Scenario: Hàng mua lại thôi tính từ ngày duyệt
- **WHEN** 50 `MAM1,6` giá 900 ₫/ngày giao 01/09/2026, phiếu mua lại `MLA-2026-003` được duyệt ngày 18/11/2026
- **THEN** kỳ 11/2026 có dòng 01/11 – 18/11, 18 ngày, 810.000 ₫ ghi "Mua lại"

#### Scenario: Đổi hàng cùng ngày
- **WHEN** ngày 22/02/2027 hợp đồng giao 100 `CHEO1,2` (`PX-2027-018`, đổi hàng) và thu hồi 100 `CHEO1,7` giá 300 ₫/ngày đang thuê từ trước kỳ
- **THEN** `CHEO1,7` tính 01/02 – 22/02 **AND** `CHEO1,2` tính từ 23/02, ngày 22/02 không tính cho `CHEO1,2`

### Requirement: Trừ ngày nghỉ chung
Ngày nằm trong bảng ngày nghỉ chung (capability `rental-holidays`) và nằm trong [Từ, Đến] của một dòng SHALL bị trừ khỏi số ngày tính của dòng đó, cho mọi hợp đồng thuê. Ngày tính = ngày lịch − ngày nghỉ trong [Từ, Đến]. Bảng kê SHALL hiện cột "Trừ nghỉ" trên từng dòng. Ngày giao trùng ngày nghỉ SHALL không trừ thêm (ngày giao vốn không tính); ngày trả trùng ngày nghỉ SHALL bị trừ.

#### Scenario: Kỳ có Tết 9 ngày
- **WHEN** bảng ngày nghỉ có "Tết Nguyên đán" 05/02 – 13/02/2027 và 100 `H1,7` giá 1.400 ₫/ngày đang thuê từ trước kỳ, chưa trả
- **THEN** dòng kỳ 02/2027 có 28 ngày lịch, trừ nghỉ −9, 19 ngày tính, thành tiền 2.660.000 ₫

#### Scenario: Ngày nghỉ trùng ngày giao
- **WHEN** bảng ngày nghỉ có "Tết Dương lịch" 01/01/2027 và 100 `H1,7` giá 1.200 ₫/ngày giao 01/01/2027, chưa trả
- **THEN** dòng kỳ 01/2027 có Từ 02/01, Đến 31/01, 30 ngày lịch, không trừ nghỉ, 3.600.000 ₫

#### Scenario: Ngày nghỉ trùng ngày trả
- **WHEN** bảng ngày nghỉ có "Giải phóng miền Nam, Quốc tế lao động" 30/04 – 01/05/2027 và 100 `H1,7` giá 1.200 ₫/ngày thuê từ 01/02/2027, trả 30/04/2027
- **THEN** dòng kỳ 04/2027 có 01/04 – 30/04, 30 ngày lịch, trừ nghỉ −1, 29 ngày tính, 3.480.000 ₫

### Requirement: Đổi giá giữa kỳ theo phụ lục
Giá ngày của mỗi ngày SHALL là giá của mã trên bản hợp đồng đang áp dụng tại ngày đó (bản đã duyệt có ngày hiệu lực lớn nhất không sau ngày đó). Khi một phụ lục có ngày hiệu lực nằm trong [Từ, Đến] của một dòng, dòng SHALL được tách tại ngày hiệu lực: phần trước giữ giá cũ, phần từ ngày hiệu lực theo giá mới, mỗi phần có Trừ nghỉ riêng. Dòng sau SHALL ghi "Đổi giá" và mã phụ lục. Phụ lục có ngày hiệu lực ngoài dòng SHALL không tách dòng.

#### Scenario: Phụ lục đổi giá giữa kỳ có Tết
- **WHEN** 100 `H1,7` giao 15/11/2026 theo giá 1.400 ₫/ngày của phụ lục `/01`, phụ lục `/02` hiệu lực 15/02/2027 đổi giá còn 1.300 ₫/ngày, kỳ 02/2027 có Tết 05/02 – 13/02
- **THEN** bảng kê có dòng 01/02 – 14/02, 14 ngày lịch, −9, 5 ngày, 700.000 ₫ **AND** dòng "Đổi giá" theo `/02` 15/02 – 28/02, 14 ngày, 1.820.000 ₫

#### Scenario: Đổi giá không có ngày nghỉ
- **WHEN** 600 `H1,7` giá 1.200 ₫/ngày đang thuê, phụ lục hiệu lực 15/12/2026 đổi giá thành 1.400 ₫/ngày, tính kỳ 12/2026
- **THEN** dòng 01/12 – 14/12 có 14 ngày, 10.080.000 ₫ **AND** dòng 15/12 – 31/12 có 17 ngày, 14.280.000 ₫

### Requirement: Thuê tối thiểu theo từng lượng hàng
Mỗi phần lượng hàng khi rời hợp đồng bằng trả về bãi (cả Tốt, Chờ sửa, Phế liệu), mua lại hoặc chuyển sang hợp đồng của nhà thầu khác SHALL được tính ít nhất số ngày thuê tối thiểu của bản hợp đồng tại ngày trả (mặc định 45 ngày). Tổng ngày tính của phần đó qua mọi kỳ (đã trừ ngày nghỉ) nhỏ hơn tối thiểu thì kỳ có ngày trả SHALL có **dòng bù** = số lượng × (tối thiểu − tổng ngày tính) × giá ngày tại ngày trả. Hàng còn ở công trình và phần đủ đúng tối thiểu SHALL không có dòng bù.

#### Scenario: Trả sau 20 ngày, bù 25 ngày
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày giao 05/11/2026, trả 25/11/2026, không có ngày nghỉ
- **THEN** kỳ 11/2026 có dòng 06/11 – 25/11, 20 ngày, 2.400.000 ₫ **AND** dòng bù 25 ngày, 3.000.000 ₫

#### Scenario: Đúng ngày thứ 45 không bù
- **WHEN** 100 `H1,7` giá 1.200 ₫/ngày giao 01/11/2026, trả 16/12/2026, không có ngày nghỉ
- **THEN** kỳ 11/2026 tính 29 ngày, kỳ 12/2026 tính 16 ngày **AND** không có dòng bù

#### Scenario: Lượng hàng trả sớm qua hai kỳ
- **WHEN** 60 `MAM1,6` giá 900 ₫/ngày giao 10/01/2027 (Đợt 3), trả 04/02/2027, không có ngày nghỉ trước 05/02/2027
- **THEN** kỳ 01/2027 tính 21 ngày **AND** kỳ 02/2027 có dòng 01/02 – 04/02, 4 ngày, 216.000 ₫ và dòng bù "lượng này mới thuê 25 ngày" 20 ngày, 1.080.000 ₫

#### Scenario: Ngày nghỉ không được tính vào tối thiểu
- **WHEN** Tết 05/02 – 13/02/2027 và 100 `H1,7` giá 1.400 ₫/ngày giao 01/02/2027, trả 20/02/2027
- **THEN** dòng 02/02 – 20/02 có 19 ngày lịch, −9, 10 ngày tính, 1.400.000 ₫ **AND** dòng bù 35 ngày, 4.900.000 ₫

#### Scenario: Hàng trả về Phế liệu vẫn bù
- **WHEN** 10 `H1,7` giá 1.200 ₫/ngày giao 05/11/2026, trả về bãi ngày 25/11/2026 với tình trạng Phế liệu, không có ngày nghỉ
- **THEN** dòng 20 ngày, 240.000 ₫ **AND** dòng bù 25 ngày, 300.000 ₫

#### Scenario: Hàng mua lại trước 45 ngày
- **WHEN** 50 `MAM1,6` giá 900 ₫/ngày giao 01/11/2026, phiếu mua lại duyệt 21/11/2026
- **THEN** kỳ 11/2026 có dòng 20 ngày, 900.000 ₫ **AND** dòng bù 25 ngày, 1.125.000 ₫

#### Scenario: Phần còn lại vẫn đang thuê
- **WHEN** 100 `H1,7` giao 05/11/2026, trả 40 cái ngày 25/11/2026, 60 cái còn ở công trình tới hết kỳ
- **THEN** dòng bù kỳ 11/2026 chỉ tính cho 40 cái **AND** 60 cái không có dòng bù

#### Scenario: Hợp đồng đặt tối thiểu 30 ngày
- **WHEN** bản hợp đồng tại ngày trả ghi thuê tối thiểu 30 ngày và 100 `H1,7` giá 1.200 ₫/ngày trả sau 20 ngày tính
- **THEN** dòng bù 10 ngày, 1.200.000 ₫

### Requirement: Hàng mất và hàng trả cùng ngày không bù
Hàng **mất** SHALL không có dòng bù tối thiểu: thôi tính thuê từ ngày lập phiếu thu hồi, chỉ tính đền bù (0.2 #21, #76). Phần trả cùng ngày giao gốc (0 ngày thuê) SHALL được miễn tối thiểu (0.2 #76).

#### Scenario: Hàng mất không bù tối thiểu
- **WHEN** 2 `KU0,5` giá 400 ₫/ngày giao 01/02/2027, ghi mất ở phiếu thu hồi ngày 20/02/2027, không có ngày nghỉ
- **THEN** kỳ 02/2027 có dòng "Mất" 02/02 – 20/02, 19 ngày, 15.200 ₫ **AND** không có dòng bù


#### Scenario: Giao và trả cùng ngày miễn tối thiểu
- **WHEN** 50 `CHEO1,2` giao ngày 10/11/2026 (`PX-2026-020`) bị xuất nhầm và thu hồi ngay ngày 10/11/2026
- **THEN** bảng kê không có dòng thuê và không có dòng bù cho 50 cái đó

### Requirement: Dòng bù tối thiểu trên bảng kê
Dòng bù SHALL nằm ngay dưới dòng thuê cuối của phần lượng hàng đó, ghi "Tối thiểu N ngày" và "Bù đủ N ngày: lượng này mới thuê M ngày". Dòng bù SHALL không có Từ, Đến, Ngày lịch, Trừ nghỉ; chỉ có số lượng, ngày tính, giá ngày, thành tiền.

#### Scenario: Dòng bù của MAM1,6 trên D7
- **WHEN** 60 `MAM1,6` giá 900 ₫/ngày thuê 25 ngày rồi trả 04/02/2027
- **THEN** dòng bù hiện "Tối thiểu 45 ngày", "Bù đủ 45 ngày: lượng này mới thuê 25 ngày", Từ và Đến để "–", ngày tính 20, thành tiền 1.080.000 ₫

### Requirement: Chuyển công trình và thuê tối thiểu
Hàng chuyển công trình SHALL thôi tính ở hợp đồng đi từ hết ngày chuyển và tính ở hợp đồng nhận từ hôm sau ngày chuyển. Khi phiếu chuyển ghi **cùng nhà thầu**: hợp đồng đi SHALL không có dòng bù cho phần chuyển; phần hàng sang hợp đồng nhận SHALL giữ ngày giao gốc, và khi rời hợp đồng nhận thì dòng bù = tối thiểu − tổng ngày tính ở **cả hai** hợp đồng, giá của hợp đồng nhận. Khi **khác nhà thầu**: hợp đồng đi SHALL bù như hàng trả; hợp đồng nhận SHALL coi như giao mới ngày chuyển.

#### Scenario: Chuyển cùng nhà thầu
- **WHEN** hợp đồng A của Minh Phát giao 100 `H1,7` giá 1.200 ₫/ngày ngày 01/11/2026, chuyển cả 100 sang hợp đồng B của Minh Phát (giá 1.300 ₫/ngày) ngày 11/11/2026, B trả về bãi 26/11/2026, không có ngày nghỉ
- **THEN** A tính 02/11 – 11/11, 10 ngày, 1.200.000 ₫, không có dòng bù **AND** B tính 12/11 – 26/11, 15 ngày, 1.950.000 ₫ và dòng bù 20 ngày (đã thuê 25 ngày từ 01/11/2026), 2.600.000 ₫

#### Scenario: Chuyển khác nhà thầu
- **WHEN** cùng số liệu trên nhưng B là hợp đồng của Phú Đạt
- **THEN** A có dòng 10 ngày 1.200.000 ₫ và dòng bù 35 ngày 4.200.000 ₫ **AND** B có dòng 15 ngày 1.950.000 ₫ và dòng bù 30 ngày 3.900.000 ₫

#### Scenario: Chuyển cùng nhà thầu sau 45 ngày
- **WHEN** 100 `H1,7` giao ở A ngày 01/10/2026, chuyển cùng nhà thầu sang B ngày 20/11/2026, B trả 25/11/2026
- **THEN** A và B đều không có dòng bù

### Requirement: Dòng điều chỉnh kỳ trước
Kế toán hoặc Giám đốc SHALL ghi được dòng điều chỉnh cho một hợp đồng thuê vào một kỳ chưa chốt, kèm: kỳ được điều chỉnh (đã chốt, trước kỳ ghi), số tiền khác 0 (âm được), lý do bắt buộc. Dòng điều chỉnh SHALL sửa, xóa được khi kỳ ghi chưa chốt (gửi kèm `updatedAt`, lệch thì 409), và bị khóa khi kỳ ghi đã chốt. Dòng điều chỉnh SHALL không cần Giám đốc duyệt và SHALL không sửa kỳ cũ (0.2 #80). Bảng kê SHALL hiện dòng điều chỉnh ở cuối, với lý do, người lập và ngày lập.

#### Scenario: Ghi thiếu của kỳ trước
- **WHEN** kỳ 01/2027 đã chốt và `thuha` ghi vào kỳ 02/2027 dòng điều chỉnh 93.000 ₫ cho kỳ 01/2027, lý do "Kỳ 01 thiếu 10 CHEO1,7 × 31 ngày (giao 31/12 chưa ghi)"
- **THEN** bảng kê kỳ 02/2027 có dòng "Điều chỉnh kỳ 01/2027" 93.000 ₫ **AND** số của kỳ 01/2027 đã chốt không đổi

#### Scenario: Điều chỉnh giảm
- **WHEN** `thuha` ghi dòng điều chỉnh −50.000 ₫ cho kỳ 01/2027 vào kỳ 02/2027, lý do "Kỳ 01 tính thừa 1 ngày nghỉ"
- **THEN** "Điều chỉnh kỳ trước" của kỳ 02/2027 giảm 50.000 ₫ **AND** dòng nhật ký Tạo của khoản đó gắn cờ "Có xác nhận bất thường"

#### Scenario: Thiếu lý do
- **WHEN** `thuha` lưu dòng điều chỉnh 93.000 ₫ để trống lý do
- **THEN** hệ thống từ chối với "Bạn ghi lý do điều chỉnh để người xem biết vì sao số đổi." và không lưu

#### Scenario: Số tiền bằng 0
- **WHEN** `thuha` lưu dòng điều chỉnh 0 ₫
- **THEN** hệ thống từ chối với "Số tiền điều chỉnh phải khác 0 ₫." và không lưu

#### Scenario: Điều chỉnh kỳ chưa chốt
- **WHEN** kỳ 01/2027 chưa chốt và `thuha` ghi dòng điều chỉnh cho kỳ 01/2027
- **THEN** hệ thống từ chối với "Kỳ 01/2027 chưa chốt nên không cần dòng điều chỉnh. Bạn xem lại số của kỳ đó trên D7 rồi chốt." và không lưu

#### Scenario: Ghi vào kỳ đã chốt
- **WHEN** kỳ 02/2027 đã chốt và `thuha` ghi dòng điều chỉnh vào kỳ 02/2027
- **THEN** hệ thống từ chối với "Kỳ 02/2027 đã chốt nên không thêm được dòng. Bạn ghi vào kỳ sau." và không lưu

#### Scenario: Sửa sau khi kỳ ghi đã chốt
- **WHEN** dòng điều chỉnh 93.000 ₫ thuộc kỳ 02/2027 và kỳ 02/2027 vừa được chốt, rồi `thuha` sửa thành 95.000 ₫
- **THEN** hệ thống từ chối với "Kỳ 02/2027 đã chốt nên dòng điều chỉnh này không sửa được." và dòng giữ 93.000 ₫

#### Scenario: Hai người sửa cùng lúc
- **WHEN** hai tab cùng mở dòng điều chỉnh, tab đầu lưu 95.000 ₫, tab sau lưu 90.000 ₫ với `updatedAt` cũ
- **THEN** tab sau nhận 409 với "Dòng điều chỉnh vừa được người khác sửa. Bạn tải lại để xem số mới." và dòng giữ 95.000 ₫

### Requirement: Cước vận chuyển trong kỳ
Kỳ SHALL cộng cước chiều đi của các phiếu xuất của hợp đồng ghi sổ trong kỳ (ngày giao trong kỳ) khi công ty gọi xe, đọc từ phiếu xuất. Cước SHALL thuộc kỳ của ngày giao, kể cả khi tiền thuê của hàng đó bắt đầu ở kỳ sau.

#### Scenario: Cước của đợt đổi hàng
- **WHEN** `PX-2027-018` (Đợt 5, đổi hàng, xe 51X-000.02) ghi sổ 22/02/2027 với cước 1.800.000 ₫
- **THEN** mục "Cước vận chuyển trong kỳ" kỳ 02/2027 có dòng `PX-2027-018` 22/02 1.800.000 ₫

#### Scenario: Giao ngày cuối tháng
- **WHEN** phiếu xuất ghi sổ 31/01/2027 với cước 900.000 ₫
- **THEN** cước 900.000 ₫ thuộc kỳ 01/2027 **AND** tiền thuê hàng đó bắt đầu ở kỳ 02/2027

#### Scenario: Khách tự chở
- **WHEN** phiếu xuất ghi sổ trong kỳ không có công ty gọi xe
- **THEN** kỳ không có dòng cước của phiếu đó

### Requirement: VAT và số phải thu của kỳ
Số phải thu của kỳ SHALL = tiền thuê (dòng thuê + dòng bù) + điều chỉnh kỳ trước + cước + VAT. VAT SHALL chỉ tính khi bản hợp đồng bật "Khách lấy hóa đơn VAT", áp lên tiền thuê, điều chỉnh và cước, theo từng thuế suất: làm tròn tới 1 ₫ (nửa lên) trên tổng tiền cùng thuế suất. Hạn trả SHALL = ngày cuối kỳ + số ngày được nợ của bản hợp đồng tại ngày cuối kỳ.

#### Scenario: Số trên bản vẽ D7 kỳ 02/2027
- **WHEN** hợp đồng `102026/ANPHAT-MINHPHAT` (VAT 8 %, hạn 30 ngày) kỳ 02/2027 có Tết 05/02 – 13/02 và các dòng: 100 `H1,7` 700.000 ₫ và 1.820.000 ₫ (đổi giá `/02`); 260 `CHEO1,7` trả 20/02 giá 300 ₫, 11 ngày, 858.000 ₫; 2 `KU0,5` mất 20/02 giá 400 ₫, 11 ngày, 8.800 ₫; 60 `MAM1,6` 4 ngày 216.000 ₫ và bù 20 ngày 1.080.000 ₫; 100 `CHEO1,2` giao 22/02 giá 280 ₫, 6 ngày, 168.000 ₫; điều chỉnh kỳ 01/2027 93.000 ₫; cước `PX-2027-018` 1.800.000 ₫
- **THEN** tiền thuê 4.850.800 ₫, điều chỉnh 93.000 ₫, cước 1.800.000 ₫, trước VAT 6.743.800 ₫, VAT 8 % 539.504 ₫, phải thu **7.283.304 ₫** **AND** hạn trả 30/03/2027

#### Scenario: Không lấy hóa đơn
- **WHEN** hợp đồng không bật VAT, tiền thuê kỳ 2.400.000 ₫, cước 900.000 ₫
- **THEN** VAT 0 ₫ và phải thu 3.300.000 ₫

#### Scenario: Làm tròn VAT
- **WHEN** hợp đồng VAT 8 %, trước VAT 1.234.567 ₫
- **THEN** VAT là 98.765 ₫

### Requirement: Thuế suất VAT theo ngày của từng dòng
Thuế suất (và cờ VAT) của dòng thuê SHALL lấy theo bản hợp đồng tại ngày Từ của dòng; của dòng bù theo ngày trả; của cước theo ngày giao; của dòng điều chỉnh theo ngày cuối kỳ ghi. D7 SHALL hiện một dòng VAT cho mỗi thuế suất có trong kỳ.

#### Scenario: Phụ lục đổi thuế suất giữa kỳ
- **WHEN** VAT 8 % tới 14/02/2027, phụ lục hiệu lực 15/02/2027 đổi VAT thành 10 %, tiền thuê 01/02 – 14/02 là 1.000.000 ₫ và 15/02 – 28/02 là 1.000.000 ₫
- **THEN** VAT kỳ 02/2027 là 80.000 ₫ + 100.000 ₫ = 180.000 ₫ và D7 hiện hai dòng VAT 8 %, VAT 10 %

#### Scenario: Phụ lục tắt VAT giữa kỳ
- **WHEN** VAT 8 % tới 14/02/2027, phụ lục hiệu lực 15/02/2027 tắt VAT, tiền thuê 01/02 – 14/02 là 1.000.000 ₫ và 15/02 – 28/02 là 1.000.000 ₫
- **THEN** VAT kỳ 02/2027 là 80.000 ₫

### Requirement: Kỳ đang chạy là tạm tính
Kỳ chưa hết SHALL được tính tới hôm nay (giờ Việt Nam) và hiện "Tạm tính đến <ngày>"; hàng còn ở công trình tính tới hôm nay, không có dòng bù cho hàng chưa trả. Nút chốt kỳ SHALL tắt kèm lý do.

#### Scenario: Xem kỳ đang chạy
- **WHEN** hôm nay 15/11/2026 và 100 `H1,7` giá 1.200 ₫/ngày đang thuê từ 15/10/2026
- **THEN** D7 kỳ 11/2026 hiện "Tạm tính đến 15/11/2026", dòng 01/11 – 15/11, 15 ngày, 1.800.000 ₫ **AND** nút "Chốt kỳ và ghi công nợ" tắt với "Kỳ 11/2026 chưa hết. Bạn chốt từ ngày 01/12/2026."

### Requirement: Chốt kỳ lưu số phải thu
Kế toán hoặc Giám đốc SHALL chốt được kỳ của một hợp đồng thuê. Chốt SHALL trong một transaction lưu: kỳ (hợp đồng, tháng, bản hợp đồng tại cuối kỳ, tiền thuê, điều chỉnh, cước, VAT, phải thu, hạn trả, người chốt, giờ chốt), toàn bộ dòng bảng kê như đang hiện (gồm tên hàng, chứng từ, ngày, số ngày, giá, thành tiền), cước, VAT theo thuế suất, và khóa các dòng điều chỉnh của kỳ. `receivables` SHALL đọc số phải thu và hạn trả từ kỳ đã chốt.

#### Scenario: Chốt kỳ 02/2027
- **WHEN** hôm nay 02/03/2027, kỳ 01/2027 đã chốt và `thuha` bấm "Chốt kỳ và ghi công nợ" cho `102026/ANPHAT-MINHPHAT` kỳ 02/2027 với phải thu 7.283.304 ₫
- **THEN** kỳ 02/2027 thành Đã chốt với tiền thuê 4.850.800 ₫, điều chỉnh 93.000 ₫, cước 1.800.000 ₫, VAT 539.504 ₫, phải thu 7.283.304 ₫, hạn trả 30/03/2027 **AND** D7 đếm "2/4 đã chốt"

### Requirement: Điều kiện chốt kỳ
Chốt SHALL chỉ được khi: kỳ đã hết (ngày cuối kỳ trước hôm nay, giờ Việt Nam), mọi kỳ trước đó có tiền của hợp đồng đã chốt, kỳ chưa chốt, kỳ có ít nhất một dòng, và số phải thu không đổi so với lúc người chốt xem (gửi kèm số phải thu đã xem; lệch thì 409). Phiếu xuất Chờ nhặt / Đang nhặt hay nháp trên điện thoại SHALL không chặn chốt; D7 SHALL nhắc rằng chúng tính vào kỳ của ngày ghi sổ. Chốt hai lần cùng lúc SHALL chỉ lưu một kỳ.

#### Scenario: Kỳ chưa hết
- **WHEN** hôm nay 28/02/2027 và `thuha` gửi lệnh chốt kỳ 02/2027
- **THEN** hệ thống từ chối với "Kỳ 02/2027 chưa hết. Bạn chốt từ ngày 01/03/2027." và không lưu

#### Scenario: Kỳ trước chưa chốt
- **WHEN** kỳ 01/2027 của hợp đồng còn tiền chưa chốt và `thuha` chốt kỳ 02/2027
- **THEN** hệ thống từ chối với "Kỳ 01/2027 của hợp đồng này chưa chốt. Bạn chốt kỳ 01/2027 trước rồi chốt kỳ 02/2027." và không lưu

#### Scenario: Số đã đổi từ lúc mở
- **WHEN** `thuha` mở kỳ 02/2027 thấy 7.283.304 ₫, rồi Giám đốc thêm dòng điều chỉnh 10.000 ₫, rồi `thuha` bấm chốt
- **THEN** hệ thống trả 409 với "Số phải thu đã đổi từ 7.283.304 ₫ thành 7.294.104 ₫ từ lúc bạn mở. Bạn xem lại rồi chốt." và không lưu

#### Scenario: Chốt khi còn phiếu xuất Đang nhặt
- **WHEN** hôm nay 01/03/2027, `PX-2027-020` Đang nhặt, và `thuha` chốt kỳ 02/2027
- **THEN** kỳ được chốt **AND** D7 đã nhắc "Còn PX-2027-020 Đang nhặt: khi xe rời bãi, hàng tính vào kỳ của ngày đó." **AND** `PX-2027-020` ghi sổ 01/03/2027 thì tính vào kỳ 03/2027

#### Scenario: Hai người chốt cùng lúc
- **WHEN** `thuha` và Giám đốc cùng bấm chốt kỳ 02/2027 của một hợp đồng
- **THEN** chỉ có một kỳ đã chốt **AND** người sau nhận "Kỳ 02/2027 đã được chốt lúc 09:12 bởi Thu Hà."

#### Scenario: Kỳ không có gì để chốt
- **WHEN** hợp đồng không có dòng tiền, cước hay điều chỉnh nào ở kỳ 03/2027 và có lệnh chốt kỳ đó
- **THEN** hệ thống từ chối với "Kỳ 03/2027 của hợp đồng này không có tiền thuê, cước hay điều chỉnh nên không cần chốt." và không lưu

### Requirement: Kỳ đã chốt bị khóa
Kỳ đã chốt và các dòng chụp lại SHALL không sửa, không xóa được, kể cả bằng câu lệnh thẳng vào DB của role app (trigger + quyền). Dòng con SHALL chỉ chèn được trong transaction tạo kỳ. D7, bảng kê in và Excel của kỳ đã chốt SHALL đọc từ dòng đã lưu, không tính lại từ sổ kho. Phụ lục có ngày hiệu lực không sau ngày cuối kỳ đã chốt gần nhất SHALL bị từ chối (spec `contract-amendments`).

#### Scenario: Sửa dòng bảng kê bằng câu lệnh
- **WHEN** role app chạy `UPDATE billing_period_line SET amount = 0` trên dòng của kỳ 02/2027 đã chốt
- **THEN** PostgreSQL từ chối và thành tiền giữ nguyên

#### Scenario: Chèn thêm dòng sau khi chốt
- **WHEN** một transaction khác chèn dòng vào kỳ 02/2027 đã chốt
- **THEN** trigger từ chối

#### Scenario: In lại sau khi đổi tên hàng
- **WHEN** kỳ 02/2027 đã chốt, rồi tên `H1,7` đổi thành "Khung giàn giáo 1,7 m loại A"
- **THEN** bảng kê in lại kỳ 02/2027 vẫn ghi "Khung giàn giáo 1,7m" và cùng số tiền

#### Scenario: Phụ lục hiệu lực trong kỳ đã chốt
- **WHEN** kỳ 02/2027 đã chốt và `quocbao` lưu phụ lục hiệu lực 20/02/2027
- **THEN** hệ thống từ chối với "Ngày hiệu lực phải sau ngày chốt kỳ gần nhất (28/02/2027). Kỳ đã chốt không tính lại." **AND** D5b hiện ngày cuối kỳ đã chốt 28/02/2027

### Requirement: Màn D7: kỳ, ngày nghỉ và danh sách hợp đồng
D7 (menu Công nợ) SHALL có: chọn kỳ (tháng), Xuất Excel của kỳ; băng "Ngày nghỉ không tính thuê trong kỳ" với từng khoảng ngày và số ngày, liên kết "Sửa ở Cài đặt → Ngày nghỉ" chỉ cho Giám đốc; danh sách hợp đồng thuê của kỳ (số, nhà thầu, công trình, phải thu, Chưa chốt / Đã chốt) với đếm "x/y đã chốt".

#### Scenario: Danh sách kỳ 02/2027
- **WHEN** Kế toán mở D7 kỳ 02/2027 có 4 hợp đồng thuê, 1 đã chốt
- **THEN** danh sách hiện "Hợp đồng thuê trong kỳ · 1/4 đã chốt" và từng hợp đồng có phải thu, nhãn Chưa chốt hoặc Đã chốt

### Requirement: Màn D7: bảng kê và phải thu của một hợp đồng
Phần hợp đồng đang xem SHALL có: đầu (nhà thầu, công trình, VAT, hạn thanh toán, hạn trả); bảng "Chi tiết từng lượng hàng" (Hàng, Số lượng, Từ, Đến, Ngày lịch, Trừ nghỉ, Ngày tính, Giá / ngày, Thành tiền) nhóm theo mã hàng rồi theo ngày giao, dòng phụ ghi chứng từ giao / trả và nhãn Đổi giá, Mất, Mua lại, Chuyển đi, Tối thiểu N ngày; dòng điều chỉnh ở cuối; "Cộng tiền thuê"; cước trong kỳ; khối "Phải thu kỳ"; nút In bảng kê và "Chốt kỳ và ghi công nợ". Tiền viết kiểu `1.250.000 ₫`.

#### Scenario: Mở D7 kỳ đã chốt
- **WHEN** Kế toán mở D7 kỳ 12/2026 của một hợp đồng đã chốt
- **THEN** D7 hiện nhãn "Đã chốt" kèm người và giờ chốt, không có nút chốt hay nút thêm dòng điều chỉnh **AND** có ghi "Chốt xong thì kỳ bị khóa. Sai sót sau đó ghi bằng dòng điều chỉnh ở kỳ sau."

#### Scenario: Kế toán không thấy liên kết sửa ngày nghỉ
- **WHEN** `thuha` (Kế toán) mở D7 kỳ 02/2027
- **THEN** băng ngày nghỉ hiện "Tết Nguyên đán 05/02 – 13/02/2027 (9 ngày)" và không có liên kết sửa

### Requirement: Xuất Excel kỳ tiền thuê
Xuất Excel SHALL tải một file `.xlsx` của cả kỳ tên `tien-thue-<YYYY-MM>.xlsx` gồm sheet "Tổng hợp" (mỗi hợp đồng một dòng, có phải thu, hạn trả, trạng thái), sheet "Chi tiết" (mỗi dòng bảng kê một dòng, có cột hợp đồng, chứng từ giao, chứng từ trả, loại dòng) và sheet "Cước" (cột đủ ở design D7); tiền là số, ngày là ngày Excel. Kinh doanh SHALL chỉ có các hợp đồng mình được xem trong file.

#### Scenario: Xuất Excel kỳ 02/2027
- **WHEN** Kế toán bấm Xuất Excel ở kỳ 02/2027 có 4 hợp đồng
- **THEN** tải file `tien-thue-2027-02.xlsx` **AND** sheet "Tổng hợp" có 4 dòng, dòng `102026/ANPHAT-MINHPHAT` có phải thu 7283304

### Requirement: In bảng kê tiền thuê
Bảng kê in của một hợp đồng SHALL có thông tin công ty từ Cài đặt (tên, mã số thuế, địa chỉ, hotline, logo), số hợp đồng, nhà thầu, công trình, kỳ, ngày nghỉ trong kỳ, bảng chi tiết như D7, cước, khối phải thu, hạn trả, chỗ ký bên cho thuê và bên thuê. Kỳ chưa chốt SHALL in chữ "TẠM TÍNH – CHƯA CHỐT".

#### Scenario: In kỳ chưa chốt
- **WHEN** Kế toán in bảng kê kỳ 02/2027 chưa chốt
- **THEN** bản in có chữ "TẠM TÍNH – CHƯA CHỐT" và thông tin công ty lấy từ Cài đặt

### Requirement: Quyền tính tiền thuê
Xem D7, bảng kê, Excel SHALL cần quyền `billing.view` (Giám đốc, Kế toán, Kinh doanh); Kinh doanh SHALL chỉ xem hợp đồng thuê khi phạm vi hợp đồng của tài khoản cho phép xem hợp đồng thuê (0.2 #51). Chốt kỳ và ghi, sửa, xóa dòng điều chỉnh SHALL cần `billing.manage` (Giám đốc, Kế toán). Server SHALL kiểm mọi quyền, không chỉ ẩn nút. Kinh doanh mở D7 từ D5 của hợp đồng ("Tiền thuê theo kỳ"); menu Công nợ không đổi.

#### Scenario: Kinh doanh xem được, không chốt được
- **WHEN** `quocbao` (Kinh doanh, phạm vi Cả hai) mở D7 của `102026/ANPHAT-MINHPHAT` rồi gửi thẳng `POST` chốt kỳ
- **THEN** D7 hiện bảng kê không có nút chốt **AND** lệnh chốt bị từ chối 403

#### Scenario: Kinh doanh chỉ hợp đồng bán
- **WHEN** tài khoản Kinh doanh có phạm vi "Chỉ bán" mở D7 kỳ 02/2027
- **THEN** hệ thống từ chối với 403 và "Tài khoản của bạn chỉ làm hợp đồng bán nên không xem được tiền thuê."

#### Scenario: Thủ kho không xem được
- **WHEN** `vantung` (Thủ kho) gọi `GET /api/billing/periods/2027-02`
- **THEN** hệ thống trả 403

#### Scenario: Kinh doanh không ghi dòng điều chỉnh
- **WHEN** `quocbao` gửi `POST /api/billing/adjustments`
- **THEN** hệ thống trả 403 và không lưu
