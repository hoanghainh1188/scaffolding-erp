## Purpose
Lệnh sửa chữa đi từ văn phòng giao việc, xưởng rút hàng Chờ sửa về sửa, ghi công khoán và vật tư phụ, Thủ kho nghiệm thu, tới Kế toán ghi sổ hàng Tốt, Phế liệu và vật tư theo giá BQ.

## ADDED Requirements

### Requirement: Lệnh sửa chữa và mã lệnh
Lệnh sửa chữa SHALL dùng cùng dãy mã `PSC-<năm>-<số 3 chữ số>` với phiếu sửa đơn giản, cấp khi lưu nháp lần đầu. Lệnh SHALL có xưởng (vị trí loại xưởng, đang dùng), tổ sửa (tùy chọn, tối đa 100 ký tự), vị trí lấy hàng (bãi đang dùng hoặc chính xưởng đó), ghi chú (tùy chọn, tối đa 500 ký tự) và một hoặc nhiều dòng mã hàng.

#### Scenario: Mã tiếp theo sau phiếu đơn giản
- **WHEN** phiếu gần nhất năm 2026 là phiếu sửa đơn giản `PSC-2026-030` và Kế toán lưu nháp lệnh mới
- **THEN** lệnh có mã `PSC-2026-031`

#### Scenario: Xưởng phải là vị trí loại xưởng
- **WHEN** Kế toán chọn xưởng là `BAI-01`
- **THEN** hệ thống từ chối với "Chọn một xưởng đang dùng"

#### Scenario: Lấy hàng tại công trình
- **WHEN** Kế toán chọn vị trí lấy hàng `CT-0003`
- **THEN** hệ thống từ chối với "Chỉ lấy hàng sửa tại bãi hoặc tại chính xưởng của lệnh"

### Requirement: Vị trí các dòng sổ của lệnh
Khi ghi sổ, Chờ sửa SHALL xuất ở xưởng và vật tư SHALL trừ ở xưởng, còn hàng Tốt và Phế liệu SHALL nhập về **vị trí lấy hàng** (bãi gốc; lệnh lấy tại chính xưởng thì nhập ở xưởng), vì phiếu xuất chỉ lấy hàng từ bãi (0.2 #130).

#### Scenario: Hàng sửa xong về bãi gốc
- **WHEN** `PSC-2026-031` lấy tại `BAI-01`, xưởng `XUONG-01`, ghi sổ 36 Tốt, 4 Phế liệu `GG-K17`
- **THEN** `REPAIR_OUT` Chờ sửa ghi tại `XUONG-01` **AND** `REPAIR_IN` Tốt, Phế liệu ghi tại `BAI-01` **AND** dòng xuất vật tư ghi tại `XUONG-01`

### Requirement: Dòng của lệnh
Mỗi dòng SHALL là một mã hàng đang dùng sửa được (đơn vị đếm có trọng lượng chuẩn, như phiếu sửa đơn giản) với số lấy ra là số nguyên > 0. Một mã chỉ có một dòng. Dòng chỉ thêm, bớt, đổi số lấy ra khi lệnh là Nháp. Lệnh không có dòng nào SHALL không lưu được.

#### Scenario: Sửa dòng sau khi giao
- **WHEN** `PSC-2026-031` đã Đã giao và Kế toán gửi lệnh đổi số lấy ra của `GG-K17` từ 40 thành 45
- **THEN** hệ thống từ chối với "Lệnh đã giao xưởng, không sửa dòng được. Thu hồi lệnh để sửa"

#### Scenario: Mã tính theo mét
- **WHEN** Kế toán thêm `ONG-49` (tính theo mét) vào lệnh
- **THEN** hệ thống từ chối với đúng thông báo của phiếu sửa đơn giản cho mã tính theo mét (0.2 #47)

### Requirement: Trạng thái lệnh
Lệnh SHALL ở một trong các trạng thái: Nháp (`DRAFT`), Đã giao (`ASSIGNED`), Đang sửa (`IN_PROGRESS`), Chờ nghiệm thu (`AWAITING_CHECK`), Đã đếm (`COUNTED`, nhãn "Chờ ghi sổ"), Đã ghi sổ (`POSTED`), Đã hủy (`CANCELLED`). Chỉ các bước chuyển nêu ở hai yêu cầu sau SHALL được phép, kiểm ở server; bước sai SHALL trả 409 kèm trạng thái hiện tại.

#### Scenario: Ghi sổ khi chưa đếm
- **WHEN** `PSC-2026-031` đang Chờ nghiệm thu và Kế toán gửi lệnh ghi sổ
- **THEN** hệ thống trả 409 "Lệnh đang Chờ nghiệm thu, Thủ kho chưa đếm xong" **AND** sổ kho không đổi

### Requirement: Bước chuyển của văn phòng
Người có `repairs.manage` SHALL làm được: Giao xưởng (Nháp → Đã giao), Thu hồi lệnh (Đã giao → Nháp), Trả lại xưởng sửa số (Chờ nghiệm thu hoặc Đã đếm → Đang sửa), Ghi sổ (Đã đếm → Đã ghi sổ), Hủy (mọi trạng thái trước Đã ghi sổ → Đã hủy).

#### Scenario: Thu hồi lệnh đã nhận
- **WHEN** `PSC-2026-031` đã Đang sửa và Kế toán bấm "Thu hồi lệnh"
- **THEN** hệ thống từ chối với 409 "Xưởng đã nhận lệnh, không thu hồi được. Hủy lệnh nếu không sửa nữa"

### Requirement: Bước chuyển của xưởng và Thủ kho
Người có `repairs.work` SHALL làm được Nhận lệnh (Đã giao → Đang sửa) và Báo sửa xong (Đang sửa → Chờ nghiệm thu). Người có `repairs.count` SHALL làm được Đếm xong (Chờ nghiệm thu → Đã đếm).

#### Scenario: Xưởng nhận lệnh chưa giao
- **WHEN** `PSC-2026-032` còn Nháp và `hoangnam` (Xưởng) gửi lệnh nhận
- **THEN** hệ thống trả 409 "Lệnh chưa giao xưởng"

#### Scenario: Đếm lệnh đang sửa
- **WHEN** `PSC-2026-031` Đang sửa và `vantung` (Thủ kho) gửi Đếm xong
- **THEN** hệ thống trả 409 "Xưởng chưa báo sửa xong"

### Requirement: Lệnh đã xong không đổi và chỉ xóa nháp
Lệnh Đã ghi sổ hoặc Đã hủy SHALL không đổi được nữa. Chỉ lệnh Nháp SHALL xóa được; lệnh ở trạng thái khác muốn bỏ thì hủy.

#### Scenario: Xóa lệnh đã giao
- **WHEN** Kế toán gửi lệnh xóa `PSC-2026-031` Đã giao
- **THEN** hệ thống từ chối với "Lệnh đã giao xưởng, không xóa được. Hủy lệnh nếu không sửa nữa"

#### Scenario: Sửa lệnh đã hủy
- **WHEN** gửi lệnh lưu nháp cho `PSC-2026-033` Đã hủy
- **THEN** hệ thống trả 409 "Lệnh đã hủy"

### Requirement: Giao xưởng chụp đơn giá công
Khi giao xưởng, mỗi dòng SHALL chụp đơn giá công sửa / cái của mã hàng tại lúc đó. Mã chưa có đơn giá công (để trống) SHALL làm lệnh giao không được; đơn giá 0 ₫ được chấp nhận. Sửa đơn giá ở danh mục sau khi giao SHALL không đổi đơn giá của lệnh. Thu hồi lệnh rồi giao lại SHALL chụp lại đơn giá.

#### Scenario: Thiếu đơn giá công
- **WHEN** `CHEO-1,7` chưa có đơn giá công sửa và Kế toán giao `PSC-2026-031`
- **THEN** hệ thống từ chối với "CHEO-1,7 chưa có đơn giá công sửa, đặt ở Danh mục (D9)" **AND** lệnh vẫn là Nháp

#### Scenario: Sửa đơn giá sau khi giao
- **WHEN** `PSC-2026-031` giao xưởng ngày 02/11/2026 lúc `GG-K17` có đơn giá công 40.000 ₫, rồi ngày 04/11 danh mục đổi thành 45.000 ₫
- **THEN** công của `GG-K17` trên `PSC-2026-031` vẫn tính theo 40.000 ₫

### Requirement: Xưởng nhận lệnh chuyển hàng sang xưởng
Nhận lệnh SHALL ghi sổ trong một transaction, cho mỗi dòng, `TRANSFER_OUT` −(số lấy ra) Chờ sửa tại vị trí lấy hàng và `TRANSFER_IN` +(số lấy ra) Chờ sửa tại xưởng, theo giá BQ Chờ sửa, không đổi giá BQ. Ngày nghiệp vụ SHALL là ngày nhận (hôm nay theo giờ Việt Nam). Lệnh lấy hàng tại chính xưởng SHALL không ghi dòng sổ nào khi nhận. Không đủ hàng Chờ sửa tại chỗ lấy SHALL làm cả lần nhận bị từ chối.

#### Scenario: Nhận lệnh 60 cái từ bãi
- **WHEN** `hoangnam` (Xưởng) nhận `PSC-2026-031` ngày 03/11/2026: lấy tại `BAI-01` `GG-K17` 40 cái (B 160.000 ₫), `CHEO-1,7` 20 cái (B 30.000 ₫); trước đó `BAI-01` có 201 `GG-K17` Chờ sửa, `XUONG-01` có 0
- **THEN** sổ có 4 dòng chứng từ `PSC-2026-031` ngày 03/11/2026 **AND** `GG-K17` Chờ sửa tại `BAI-01` còn 161, tại `XUONG-01` có 40 **AND** giá BQ Chờ sửa của `GG-K17` vẫn 160.000 ₫ **AND** tổng giá trị kho không đổi **AND** lệnh Đang sửa

#### Scenario: Bãi không đủ hàng
- **WHEN** `GG-K17` Chờ sửa tại `BAI-01` còn 30 cái và lệnh lấy 40
- **THEN** nhận bị từ chối với "Không đủ hàng: GG-K17 Chờ sửa tại BAI-01 còn 30 cái" **AND** không dòng sổ nào được ghi **AND** lệnh vẫn Đã giao

#### Scenario: Lấy hàng tại chính xưởng
- **WHEN** lệnh có vị trí lấy hàng `XUONG-01` và xưởng `XUONG-01` được nhận
- **THEN** sổ kho không có dòng mới **AND** lệnh Đang sửa

### Requirement: Số sửa xong, phế liệu và vật tư đã dùng
Khi lệnh Đang sửa, xưởng SHALL ghi được trên M8 (lưu nháp trên máy, gửi lên server khi báo sửa xong) cho mỗi dòng: sửa xong và hỏng → phế (số nguyên ≥ 0) và vật tư đã dùng. Mỗi vật tư SHALL là một mã nhóm Vật tư đang dùng với số lượng > 0 theo đơn vị của mã (số nguyên với đơn vị đếm, tối đa 3 chữ số lẻ với kg, lít); một vật tư chỉ một lần trên một dòng, dùng được trên nhiều dòng. Báo sửa xong SHALL đòi sửa xong + phế bằng số lấy ra ở mọi dòng.

#### Scenario: Báo sửa xong khi chưa đủ số
- **WHEN** dòng `GG-K17` nhận 40, xưởng ghi sửa xong 30, phế 4 và bấm "Báo sửa xong"
- **THEN** hệ thống từ chối với thông báo tổng không khớp của phiếu sửa đơn giản cho `GG-K17` (34 so với 40) **AND** lệnh vẫn Đang sửa

#### Scenario: Ghi vật tư không thuộc nhóm Vật tư
- **WHEN** xưởng thêm `GG-CH` (nhóm Thiết bị) làm vật tư đã dùng
- **THEN** hệ thống từ chối với "GG-CH không phải vật tư phụ"

#### Scenario: Cùng vật tư trên hai dòng
- **WHEN** `GG-K17` dùng 3 lít `VT-SON` và `CHEO-1,7` dùng 0,5 lít `VT-SON`
- **THEN** lệnh lưu được **AND** tổng `VT-SON` của lệnh là 3,5 lít

### Requirement: Thủ kho đếm nghiệm thu
Khi lệnh Chờ nghiệm thu (xưởng đã đưa hàng về bãi gốc), Thủ kho SHALL ghi số sửa xong, phế liệu mình đếm tại bãi cho mỗi dòng (mặc định bằng số xưởng báo) và sửa được vật tư đã dùng, rồi bấm "Đếm xong". Sửa xong + phế SHALL bằng số lấy ra. Số xưởng báo SHALL được giữ lại; ghi sổ dùng số Thủ kho đếm.

#### Scenario: Thủ kho đếm khác xưởng
- **WHEN** xưởng báo `GG-K17` sửa xong 36, phế 4 và Thủ kho đếm sửa xong 35, phế 5
- **THEN** lệnh Đã đếm với 35 / 5 **AND** D12 hiện "Xưởng báo 36 sửa xong, 4 phế" cạnh số đếm

#### Scenario: Đếm khớp
- **WHEN** Thủ kho giữ nguyên số xưởng báo và bấm "Đếm xong"
- **THEN** lệnh Đã đếm **AND** D12 không hiện dòng chênh lệch

### Requirement: Trả lại xưởng sửa số
Kế toán SHALL trả được lệnh Chờ nghiệm thu hoặc Đã đếm về Đang sửa, bắt buộc ghi lý do (1–500 ký tự). Số đã ghi SHALL giữ nguyên để xưởng sửa; số Thủ kho đếm SHALL bị bỏ, lần báo sửa xong sau phải đếm lại. M8 SHALL hiện lý do.

#### Scenario: Trả lại vì vật tư sai
- **WHEN** Kế toán trả lại `PSC-2026-031` Đã đếm với lý do "Que hàn ghi 60 kg, kiểm lại"
- **THEN** lệnh Đang sửa **AND** M8 hiện "Văn phòng trả lại: Que hàn ghi 60 kg, kiểm lại" **AND** muốn ghi sổ phải qua Báo sửa xong và Đếm xong lần nữa

#### Scenario: Trả lại không có lý do
- **WHEN** Kế toán trả lại mà để trống lý do
- **THEN** hệ thống từ chối với "Ghi lý do trả lại"

### Requirement: Công khoán theo cái
Công của một dòng SHALL bằng số sửa xong (Thủ kho đếm) × đơn giá công đã chụp khi giao. Hàng thành phế SHALL không tính công. Dòng sửa xong 0 SHALL có công 0 ₫.

#### Scenario: Công của khung
- **WHEN** `GG-K17` sửa xong 36, phế 4, đơn giá công 40.000 ₫
- **THEN** công là 36 × 40.000 = **1.440.000 ₫**

#### Scenario: Cả dòng thành phế
- **WHEN** `GG-M16` lấy 5, sửa xong 0, phế 5, đơn giá công 50.000 ₫
- **THEN** công là 0 ₫

### Requirement: Vật tư phụ xuất theo giá BQ
Ghi sổ SHALL xuất mỗi vật tư đã dùng của mỗi dòng bằng `REPAIR_OUT` tại xưởng của lệnh, theo giá BQ hiện tại của (mã + tình trạng), lấy tình trạng Mới trước rồi Tốt. Giá trị vật tư của dòng SHALL bằng tổng giá trị các dòng xuất vật tư của dòng đó. Tồn vật tư tại xưởng không đủ SHALL làm cả lệnh không ghi sổ được.

#### Scenario: Vật tư của khung
- **WHEN** `VT-QH` (kg) giá BQ Mới 45.000 ₫, `VT-SON` (lít) giá BQ Mới 90.000 ₫ và dòng `GG-K17` dùng 6 kg `VT-QH`, 3 lít `VT-SON`
- **THEN** vật tư của dòng là 270.000 + 270.000 = **540.000 ₫**

#### Scenario: Tồn vật tư ở xưởng giảm đúng số dùng
- **WHEN** trước ghi sổ `XUONG-01` có 18 kg `VT-QH`, 12 lít `VT-SON` và lệnh dùng 6 kg `VT-QH`, 3,5 lít `VT-SON`
- **THEN** sau ghi sổ `XUONG-01` còn 12 kg `VT-QH`, 8,5 lít `VT-SON` **AND** tổng giá trị kho của hai mã giảm 270.000 + 315.000 = 585.000 ₫ **AND** giá BQ của hai mã không đổi

#### Scenario: Không đủ vật tư
- **WHEN** `XUONG-01` còn 4 kg `VT-QH` và lệnh dùng 6 kg
- **THEN** ghi sổ bị từ chối với "Không đủ vật tư: VT-QH tại XUONG-01 còn 4 kg" **AND** không dòng sổ nào được ghi **AND** lệnh vẫn Đã đếm

#### Scenario: Mới trước rồi Tốt
- **WHEN** `VT-BL12` tại `XUONG-01` có 20 cái Mới (BQ 2.500 ₫) và 100 cái Tốt (BQ 2.000 ₫) và lệnh dùng 30 cái
- **THEN** sổ có `REPAIR_OUT` −20 Mới (−50.000 ₫) và −10 Tốt (−20.000 ₫) **AND** vật tư của dòng là 70.000 ₫

### Requirement: Ghi sổ lệnh sửa
Ghi sổ SHALL, trong một transaction, ghi cho mỗi dòng: `REPAIR_OUT` −(số lấy ra) Chờ sửa tại xưởng theo B; `REPAIR_IN` +(sửa xong) Tốt tại vị trí lấy hàng, giá trị = sửa xong × B + chi phí sửa + phần hỏng; `REPAIR_IN` +(phế) Phế liệu tại vị trí lấy hàng; và các dòng xuất vật tư tại xưởng. Ngày nghiệp vụ SHALL là ngày ghi sổ. Lệnh SHALL lưu công, vật tư và chi phí sửa của từng dòng lúc ghi sổ.

#### Scenario: Ví dụ D12
- **WHEN** Kế toán ghi sổ `PSC-2026-031` (lấy tại `BAI-01`, xưởng `XUONG-01`): `GG-K17` (13,5 kg/cái, B 160.000 ₫) lấy 40, sửa xong 36, phế 4, đơn giá công 40.000 ₫, vật tư 6 kg `VT-QH` (45.000 ₫) và 3 lít `VT-SON` (90.000 ₫); `CHEO-1,7` (B 30.000 ₫) lấy 20, sửa xong 20, phế 0, đơn giá công 10.000 ₫, vật tư 0,5 lít `VT-SON`; giá sắt vụn 7.500 ₫/kg
- **THEN** `GG-K17`: công 1.440.000 ₫, vật tư 540.000 ₫, chi phí sửa **1.980.000 ₫**, phế liệu 405.000 ₫, phần hỏng 235.000 ₫, `REPAIR_IN` +36 Tốt giá trị 7.975.000 ₫ (**221.528 ₫/cái**)
- **AND** `CHEO-1,7`: công 200.000 ₫, vật tư 45.000 ₫, chi phí sửa 245.000 ₫, `REPAIR_IN` +20 Tốt giá trị 845.000 ₫ (**42.250 ₫/cái**)
- **AND** chi phí sửa của lệnh là 2.225.000 ₫ (công 1.640.000 ₫, vật tư 585.000 ₫)

#### Scenario: Tồn bãi và xưởng trước và sau ghi sổ
- **WHEN** trước ghi sổ `PSC-2026-031`, `GG-K17` có tại `BAI-01` 161 Chờ sửa, 920 Tốt, 42 Phế liệu và tại `XUONG-01` 40 Chờ sửa (đã chuyển lúc nhận)
- **THEN** sau ghi sổ `XUONG-01` còn 0 Chờ sửa `GG-K17` **AND** `BAI-01` có 161 Chờ sửa, 956 Tốt, 46 Phế liệu **AND** phiếu xuất lấy được 36 cái Tốt mới sửa từ `BAI-01`

#### Scenario: Lệnh lấy hàng tại chính xưởng
- **WHEN** lệnh có vị trí lấy hàng `XUONG-01` ghi sổ 10 `GG-K17` sửa xong
- **THEN** `REPAIR_IN` +10 Tốt ghi tại `XUONG-01`

#### Scenario: Tổng giá trị sổ của lần ghi sổ bằng công trừ lỗ hỏng hàng
- **WHEN** ghi sổ lệnh ví dụ D12 ở trên
- **THEN** giá trị vào trừ giá trị ra của các dòng sổ của lần ghi sổ (gồm dòng vật tư) bằng **1.640.000 ₫** = công − 0 ₫ lỗ hỏng hàng **AND** `npm run inventory:check` báo không lệch

#### Scenario: Cả dòng hỏng hết
- **WHEN** dòng `GG-M16` (12 kg/cái, B 210.000 ₫) lấy 5, sửa xong 0, phế 5, có ghi 1 kg `VT-QH`, giá sắt vụn 7.500 ₫/kg
- **THEN** ghi sổ bị từ chối với thông báo "không có hàng sửa xong để phân bổ chi phí" của phiếu sửa đơn giản cho `GG-M16` **AND** bỏ vật tư thì ghi sổ được với lỗ hỏng hàng 600.000 ₫

#### Scenario: Chưa có giá sắt vụn
- **WHEN** chưa có giá sắt vụn tham khảo và lệnh có dòng phế 4
- **THEN** ghi sổ bị từ chối với "Chưa có giá sắt vụn tham khảo, nhờ Giám đốc nhập ở Cài đặt" **AND** lệnh vẫn Đã đếm

#### Scenario: Ghi sổ hai lần
- **WHEN** hai tab cùng bấm "Ghi sổ kho" cho `PSC-2026-031`
- **THEN** sổ chỉ có một bộ dòng ghi sổ của lệnh **AND** lần sau nhận 409 "Lệnh đã được ghi sổ"

### Requirement: Chi phí sửa của lệnh tính ra
Chi phí sửa của một dòng lệnh SHALL bằng công + vật tư, tính ra, không nhập tay. B (giá BQ Chờ sửa), giá trị phế liệu, phần hỏng, lỗ hỏng hàng và giá vào Tốt SHALL theo đúng luật của phiếu sửa đơn giản (0.2 #23), với B và giá sắt vụn đọc lúc ghi sổ. Dòng sửa xong 0 SHALL không có vật tư.

#### Scenario: Giá Chờ sửa đổi sau khi đếm
- **WHEN** `PSC-2026-031` Đã đếm lúc B của `GG-K17` là 160.000 ₫, rồi một phiếu nhập Chờ sửa đổi B thành 158.000 ₫ trước khi ghi sổ
- **THEN** lệnh ghi theo 158.000 ₫ **AND** D12 trước đó hiện số xem trước theo 160.000 ₫

### Requirement: Hỏi lại khi chi phí sửa cao trên lệnh
Như phiếu sửa đơn giản, khi chi phí sửa mỗi cái của một dòng (công + vật tư, chia số sửa xong) lớn hơn giá BQ Tốt hiện tại của mã, ghi sổ SHALL cần xác nhận dòng đó; server tự kiểm và trả 422 nếu thiếu xác nhận.

#### Scenario: Vật tư ghi nhầm làm chi phí cao
- **WHEN** `GG-K17` Tốt giá BQ 195.861 ₫ và dòng sửa xong 36 có công 1.440.000 ₫ và vật tư 60 kg `VT-QH` (2.700.000 ₫), tức 115.000 ₫/cái
- **THEN** không hỏi lại
- **AND** nếu vật tư là 600 kg (27.000.000 ₫, 790.000 ₫/cái) **THEN** D12 hỏi "GG-K17: chi phí sửa 790.000 ₫/cái, cao hơn giá vốn Tốt 195.861 ₫. Đúng không?"

### Requirement: Hủy lệnh
Hủy SHALL bắt buộc lý do (1–500 ký tự). Hủy lệnh đã nhận (Đang sửa, Chờ nghiệm thu, Đã đếm) SHALL ghi sổ chuyển ngược trong cùng transaction: `TRANSFER_OUT` Chờ sửa tại xưởng và `TRANSFER_IN` Chờ sửa về vị trí lấy hàng, đúng số lấy ra, ngày hủy. Lệnh lấy hàng tại chính xưởng hoặc chưa nhận SHALL không ghi sổ khi hủy. Vật tư chưa ghi sổ nên SHALL không đổi.

#### Scenario: Hủy lệnh đang sửa
- **WHEN** `PSC-2026-031` (lấy tại `BAI-01`, 40 `GG-K17`, 20 `CHEO-1,7`) Đang sửa và Kế toán hủy ngày 05/11/2026 với lý do "Bán nguyên lô phế"
- **THEN** sổ có 4 dòng chuyển `XUONG-01` → `BAI-01` ngày 05/11/2026 **AND** `GG-K17` Chờ sửa tại `BAI-01` tăng lại 40 **AND** lệnh Đã hủy

#### Scenario: Xưởng không đủ hàng để trả về
- **WHEN** `GG-K17` Chờ sửa tại `XUONG-01` chỉ còn 35 cái (đã bị kiểm kê điều chỉnh) và Kế toán hủy lệnh lấy 40
- **THEN** hủy bị từ chối với "Không đủ hàng: GG-K17 Chờ sửa tại XUONG-01 còn 35 cái" **AND** lệnh giữ trạng thái cũ

### Requirement: Sửa đồng thời trả 409
Mọi lệnh ghi lên lệnh sửa (lưu nháp, giao, thu hồi, nhận, báo sửa xong, đếm, trả lại, ghi sổ, hủy) SHALL gửi kèm thời điểm sửa cuối của lệnh; lệch SHALL trả 409 "Lệnh vừa được người khác sửa, tải lại" và không ghi gì.

#### Scenario: Xưởng và Thủ kho cùng sửa
- **WHEN** Thủ kho mở M8 của `PSC-2026-031` Chờ nghiệm thu, rồi Kế toán trả lại xưởng, rồi Thủ kho bấm "Đếm xong"
- **THEN** lệnh đếm của Thủ kho bị 409 **AND** lệnh vẫn Đang sửa

### Requirement: Quyền lệnh sửa
Xem lệnh trên desktop SHALL cần `repairs.view` (Giám đốc, Kế toán, Kinh doanh). Lập, sửa, xóa nháp, giao, thu hồi, trả lại, hủy, ghi sổ SHALL cần `repairs.manage` (Giám đốc, Kế toán). Nhận lệnh, ghi số, báo sửa xong SHALL cần `repairs.work` (Xưởng, Giám đốc). Đếm nghiệm thu SHALL cần `repairs.count` (Thủ kho, Giám đốc). Kiểm ở server cho cả trang và API.

#### Scenario: Xưởng gọi API ghi sổ
- **WHEN** `hoangnam` (Xưởng) gửi `POST /api/repairs/PSC-2026-031/post`
- **THEN** API trả 403 **AND** sổ kho không đổi

#### Scenario: Thủ kho gọi API ghi sổ
- **WHEN** `vantung` (Thủ kho) gửi `POST /api/repairs/PSC-2026-031/post`
- **THEN** API trả 403

#### Scenario: Thủ kho không báo sửa xong thay xưởng
- **WHEN** `vantung` (Thủ kho) gửi lệnh báo sửa xong `PSC-2026-031`
- **THEN** API trả 403

#### Scenario: Kinh doanh chỉ xem
- **WHEN** `quocbao` (Kinh doanh) mở `/repairs/PSC-2026-031`
- **THEN** trang mở được, không có nút giao, trả lại, hủy hay "Ghi sổ kho"

### Requirement: Màn D12 lệnh sửa chữa
D12 của lệnh SHALL có: đầu trang (mã, xưởng, tổ, nhãn trạng thái, câu bước tiếp theo); tiến trình 6 bước (Nháp, Giao xưởng, Xưởng nhận kèm "<chỗ lấy> → <xưởng>", Báo sửa xong, Thủ kho đếm, Ghi sổ) có người và ngày; bảng "Hàng sửa, công và vật tư"; khối "Giá vốn khi vào Tốt" từng mã; khối tổng chi phí sửa; khối "Khi ghi sổ"; khối "Vật tư ở <xưởng>" (tồn và giá BQ trước khi ghi sổ).

#### Scenario: Lệnh chờ ghi sổ như D12
- **WHEN** Kế toán mở `PSC-2026-031` Đã đếm với số liệu ví dụ D12
- **THEN** trang hiện nhãn "Chờ ghi sổ", "Công khoán: 36 × 40.000 ₫ = 1.440.000 ₫", "Que hàn (VT-QH) 6 kg × 45.000 ₫ = 270.000 ₫", "Giá vào Tốt / cái 221.528 ₫", dòng Cộng "60 · 56 · 4" và "Công 1.640.000 ₫ · vật tư 585.000 ₫ · 2.225.000 ₫"

#### Scenario: Khối khi ghi sổ
- **WHEN** lệnh lấy tại `BAI-01`, xưởng `XUONG-01`, dùng 6 kg que hàn, 3,5 lít sơn
- **THEN** khối "Khi ghi sổ" hiện "Xuất 60 Chờ sửa ở XUONG-01 (đã chuyển từ BAI-01 lúc xưởng nhận lệnh)", "Nhập 56 Tốt, 4 Phế liệu ở BAI-01" và "Xuất vật tư: 6 kg que hàn, 3,5 lít sơn theo giá BQ"

#### Scenario: Nút theo trạng thái
- **WHEN** Kế toán mở lệnh Đang sửa
- **THEN** không có nút "Ghi sổ kho" **AND** có nút "Hủy lệnh" **AND** cột Sửa xong, Phế liệu, vật tư hiện "Xưởng đang sửa" (số chỉ lên server khi xưởng báo sửa xong)

#### Scenario: Lệnh nháp
- **WHEN** Kế toán mở lệnh Nháp
- **THEN** sửa được xưởng, tổ, chỗ lấy, dòng và số lấy ra **AND** có danh sách "Đang chờ sửa tại <chỗ lấy>" để thêm mã **AND** có nút "Giao xưởng"

### Requirement: Số tiền trên D12 trước và sau ghi sổ
Trước khi ghi sổ, mọi số tiền trên D12 lệnh SHALL là số xem trước theo giá BQ và giá sắt vụn hiện tại. Sau khi ghi sổ, số SHALL lấy từ dòng sổ và số đã lưu của lệnh, không tính lại.

#### Scenario: Lệnh đã ghi sổ chỉ xem
- **WHEN** mở `PSC-2026-031` đã ghi sổ ngày 07/11/2026, sau đó giá BQ `VT-QH` đổi thành 47.000 ₫
- **THEN** dòng que hàn vẫn hiện "6 kg × 45.000 ₫ = 270.000 ₫" **AND** mọi ô chỉ đọc, hiện người ghi sổ và giá sắt vụn đã dùng
