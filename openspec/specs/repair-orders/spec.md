# repair-orders Specification

## Purpose
Phiếu sửa chữa đơn giản chuyển hàng Chờ sửa sang Tốt (sửa xong) hoặc Phế liệu (hỏng hẳn), ghi sổ kho và cộng chi phí sửa của từng mã vào giá vốn Tốt.

## Requirements

### Requirement: Phiếu sửa chữa và mã phiếu
Phiếu sửa chữa SHALL có mã `PSC-<năm>-<số 3 chữ số>` theo năm của ngày tạo, cấp khi lưu nháp lần đầu, không trùng. Phiếu SHALL có ngày sửa xong, người/tổ sửa (tùy chọn, tối đa 100 ký tự), ghi chú (tùy chọn, tối đa 500 ký tự), vị trí lấy hàng, vị trí nhập về và một hoặc nhiều dòng hàng.

#### Scenario: Mã tiếp theo trong năm
- **WHEN** phiếu gần nhất năm 2026 là `PSC-2026-023` và Kế toán lưu nháp phiếu mới ngày 28/10/2026
- **THEN** phiếu có mã `PSC-2026-024`

#### Scenario: Hai người lưu cùng lúc
- **WHEN** Giám đốc và Kế toán cùng lưu nháp hai phiếu mới
- **THEN** hai phiếu nhận hai mã khác nhau, liền nhau

### Requirement: Luật số lượng của dòng hàng
Mỗi dòng SHALL có số lấy ra (số nguyên > 0), sửa xong → Tốt và hỏng hẳn → Phế liệu (số nguyên ≥ 0). Sửa xong + phế liệu SHALL bằng số lấy ra. Lưu nháp hay ghi sổ với dòng sai luật SHALL bị từ chối, chỉ rõ dòng sai.

#### Scenario: Tổng khớp
- **WHEN** dòng `GG-K17` lấy ra 40, sửa xong 36, phế liệu 4
- **THEN** dòng hợp lệ

#### Scenario: Tổng không khớp
- **WHEN** dòng `GG-K17` lấy ra 40, sửa xong 30, phế liệu 4
- **THEN** hệ thống từ chối với "GG-K17: sửa xong + phế liệu (34) phải bằng số lấy ra (40)"

#### Scenario: Lấy ra 0
- **WHEN** dòng `GG-CH` lấy ra 0, sửa xong 0, phế liệu 0
- **THEN** hệ thống từ chối với "GG-CH: số lấy ra phải lớn hơn 0"

#### Scenario: Số lẻ
- **WHEN** dòng `GG-CH` lấy ra 20,5
- **THEN** hệ thống từ chối với "GG-CH tính theo cái, số lượng phải là số nguyên"

#### Scenario: Cả dòng thành phế liệu
- **WHEN** dòng `GG-M16` lấy ra 5, sửa xong 0, phế liệu 5, chi phí 0 ₫
- **THEN** dòng hợp lệ

### Requirement: Mã hàng trên phiếu
Mỗi dòng SHALL là một mã hàng đang dùng, tính theo cái; một mã chỉ có một dòng trên phiếu. Phiếu không có dòng nào SHALL không lưu được.

#### Scenario: Mã tính theo kg
- **WHEN** Kế toán thêm `PL-SAT` (tính theo kg) vào phiếu
- **THEN** hệ thống từ chối với "PL-SAT tính theo kg, không lập phiếu sửa được"

#### Scenario: Trùng mã
- **WHEN** phiếu có hai dòng `GG-K17`
- **THEN** hệ thống từ chối với "GG-K17 đã có trên phiếu"

#### Scenario: Phiếu rỗng
- **WHEN** Kế toán lưu nháp phiếu không có dòng nào
- **THEN** hệ thống từ chối với "Thêm ít nhất một mã hàng"

### Requirement: Chi phí sửa theo từng mã
Mỗi dòng SHALL có chi phí sửa (₫, số nguyên ≥ 0), gộp mọi khoản của mã đó. Chi phí SHALL chỉ chia cho hàng sửa xong: dòng có chi phí > 0 mà sửa xong bằng 0 SHALL bị từ chối. Tổng chi phí của phiếu SHALL bằng tổng chi phí các dòng.

#### Scenario: Chi phí mà không có hàng sửa xong
- **WHEN** dòng `GG-M16` lấy ra 5, sửa xong 0, phế liệu 5, chi phí 300.000 ₫
- **THEN** hệ thống từ chối với "GG-M16: không có hàng sửa xong để tính chi phí sửa"

#### Scenario: Tổng chi phí phiếu
- **WHEN** phiếu có `GG-K17` chi phí 1.980.000 ₫ và `GG-CH` chi phí 240.000 ₫
- **THEN** tổng chi phí sửa là 2.220.000 ₫

#### Scenario: Chi phí âm hoặc lẻ đồng
- **WHEN** dòng `GG-CH` có chi phí −1.000 ₫ hoặc 1.000,5 ₫
- **THEN** hệ thống từ chối với "Chi phí sửa phải là số đồng không âm"

### Requirement: Vị trí lấy hàng và nhập về
Phiếu SHALL có một vị trí lấy hàng Chờ sửa và một vị trí nhập hàng Tốt, Phế liệu, mỗi vị trí là bãi hoặc xưởng đang dùng (không phải công trình). Phiếu mới SHALL mặc định cả hai là bãi đang dùng có mã nhỏ nhất. Hai vị trí có thể trùng hoặc khác nhau.

#### Scenario: Lấy ở xưởng, nhập về bãi
- **WHEN** phiếu lấy hàng tại `XUONG-01` và nhập về `BAI-01`
- **THEN** dòng ra Chờ sửa ghi tại `XUONG-01` **AND** dòng vào Tốt, Phế liệu ghi tại `BAI-01`

#### Scenario: Mặc định bãi đang dùng
- **WHEN** `BAI-01` đã ngừng dùng và còn `BAI-02` đang dùng
- **THEN** phiếu mới mặc định lấy tại và nhập về `BAI-02`

#### Scenario: Chọn công trình
- **WHEN** Kế toán chọn vị trí lấy hàng là `CT-0003`
- **THEN** hệ thống từ chối với "Chỉ lấy hàng sửa tại bãi hoặc xưởng"

### Requirement: Giá trị phế liệu từ phiếu sửa
Hàng hỏng hẳn SHALL vào Phế liệu với giá trị = min(số cái × trọng lượng chuẩn × giá sắt vụn tham khảo, số cái × B), làm tròn đến 1 ₫ (0,5 lên). B là giá BQ Chờ sửa; cả B và giá sắt vụn lấy lúc ghi sổ. Phiếu có phế liệu mà chưa có giá sắt vụn SHALL không ghi sổ được. Phiếu lưu giá sắt vụn đã dùng.

#### Scenario: Giá sắt vụn thấp hơn giá Chờ sửa
- **WHEN** `GG-K17` (13,5 kg/cái) B 160.000 ₫, phế liệu 4, giá sắt vụn 7.500 ₫/kg
- **THEN** giá trị phế liệu = min(54 × 7.500 = 405.000 ; 4 × 160.000 = 640.000) = **405.000 ₫** (101.250 ₫/cái)

#### Scenario: Giá sắt vụn cao hơn giá Chờ sửa
- **WHEN** `GG-CH` (2,8 kg/cái) B 18.000 ₫, phế liệu 3, giá sắt vụn 7.500 ₫/kg
- **THEN** giá trị phế liệu = min(8,4 × 7.500 = 63.000 ; 3 × 18.000 = 54.000) = **54.000 ₫** **AND** phần hỏng là 0 ₫

#### Scenario: Chưa có giá sắt vụn
- **WHEN** chưa có giá sắt vụn tham khảo và phiếu có dòng phế liệu 4
- **THEN** ghi sổ bị từ chối với "Chưa có giá sắt vụn tham khảo, nhờ Giám đốc nhập ở Cài đặt" **AND** phiếu vẫn là Nháp

#### Scenario: Không có phế liệu thì không cần giá sắt vụn
- **WHEN** chưa có giá sắt vụn tham khảo và mọi dòng có phế liệu 0
- **THEN** phiếu ghi sổ được

### Requirement: Phần hỏng và lỗ hỏng hàng
Phần hỏng của dòng SHALL bằng số phế liệu × B − giá trị phế liệu (≥ 0). Dòng có hàng sửa xong SHALL cộng phần hỏng vào giá trị hàng vào Tốt. Dòng sửa xong 0 SHALL ghi phần hỏng thành lỗ hỏng hàng của dòng: sổ giảm đúng số đó, phiếu lưu và D12 hiện "Lỗ hỏng hàng".

#### Scenario: Hàng sửa xong gánh phần hỏng
- **WHEN** `GG-K17` B 160.000 ₫, sửa xong 36, phế liệu 4 giá trị 405.000 ₫
- **THEN** phần hỏng = 640.000 − 405.000 = **235.000 ₫**, cộng vào dòng Tốt **AND** lỗ hỏng hàng là 0 ₫

#### Scenario: Cả dòng hỏng hết
- **WHEN** `GG-M16` (12 kg/cái) B 210.000 ₫, lấy 5, sửa xong 0, phế liệu 5, giá sắt vụn 7.500 ₫/kg
- **THEN** sổ có `REPAIR_OUT` −5 Chờ sửa ghi 210.000 ₫ (−1.050.000 ₫) và `REPAIR_IN` +5 Phế liệu giá trị 450.000 ₫ **AND** lỗ hỏng hàng **600.000 ₫** **AND** tổng giá trị sổ giảm 600.000 ₫

### Requirement: Ghi sổ kho khi ghi phiếu
Ghi sổ SHALL ghi cho mỗi dòng: `REPAIR_OUT` −(số lấy ra) Chờ sửa tại chỗ lấy theo B; `REPAIR_IN` +(sửa xong) Tốt tại chỗ nhập, giá trị = sửa xong × B + chi phí sửa + phần hỏng; `REPAIR_IN` +(phế liệu) Phế liệu tại chỗ nhập, giá trị = giá trị phế liệu. Dòng có số 0 SHALL không ghi. Chứng từ gốc là mã phiếu.

#### Scenario: Dòng có cả Tốt và Phế liệu
- **WHEN** `GG-K17` B 160.000 ₫, phiếu `PSC-2026-024` lấy 40 tại `BAI-01`, sửa xong 36, phế liệu 4, chi phí 1.980.000 ₫, giá sắt vụn 7.500 ₫/kg, nhập về `BAI-01`
- **THEN** sổ có 3 dòng chứng từ `PSC-2026-024`: `REPAIR_OUT` −40 Chờ sửa ghi 160.000 ₫ (−6.400.000 ₫); `REPAIR_IN` +36 Tốt giá trị 7.975.000 ₫ (221.528 ₫/cái); `REPAIR_IN` +4 Phế liệu giá trị 405.000 ₫ (101.250 ₫/cái)

#### Scenario: Không có phế liệu
- **WHEN** `GG-CH` B 30.000 ₫, dòng lấy 20, sửa xong 20, phế liệu 0, chi phí 240.000 ₫
- **THEN** sổ có 2 dòng: `REPAIR_OUT` −20 Chờ sửa và `REPAIR_IN` +20 Tốt giá trị 840.000 ₫ **AND** không có dòng Phế liệu

#### Scenario: Tổng giá trị sổ bằng chi phí trừ lỗ hỏng hàng
- **WHEN** ghi sổ `PSC-2026-024` có `GG-K17` (chi phí 1.980.000 ₫) và `GG-CH` (chi phí 240.000 ₫), không dòng nào hỏng hết
- **THEN** giá trị vào trừ giá trị ra của các dòng sổ của phiếu bằng **2.220.000 ₫** = tổng chi phí sửa − 0 ₫ lỗ hỏng hàng **AND** `npm run inventory:check` báo không lệch

#### Scenario: Không đủ hàng Chờ sửa
- **WHEN** `GG-K17` Chờ sửa tại `BAI-01` còn 30 cái và phiếu lấy ra 40
- **THEN** ghi sổ bị từ chối với "Không đủ hàng: GG-K17 Chờ sửa tại BAI-01 còn 30 cái" **AND** phiếu vẫn là Nháp

### Requirement: Giá vốn khi vào Tốt
Đơn giá của dòng vào Tốt SHALL bằng (sửa xong × B + chi phí sửa + phần hỏng) ÷ sửa xong, làm tròn đến 1 ₫, 0,5 làm tròn lên, tức B + (chi phí + phần hỏng) ÷ sửa xong. Giá trị dòng SHALL là số chính xác ở tử số, không nhân lại từ đơn giá đã làm tròn.

#### Scenario: Có phần hỏng
- **WHEN** B 160.000 ₫, chi phí 1.980.000 ₫, phần hỏng 235.000 ₫, sửa xong 36
- **THEN** giá vào Tốt = 7.975.000 ÷ 36 = 221.527,78 → **221.528 ₫** **AND** giá trị dòng là 7.975.000 ₫

#### Scenario: Chia chẵn, không phế liệu
- **WHEN** B 160.000 ₫, chi phí 1.980.000 ₫, phế liệu 0, sửa xong 36
- **THEN** giá vào Tốt = 160.000 + 55.000 = **215.000 ₫**

#### Scenario: Chia lẻ làm tròn xuống
- **WHEN** B 160.000 ₫, chi phí 1.000.000 ₫, phế liệu 0, sửa xong 3
- **THEN** giá vào Tốt = 160.000 + 333.333,33 → **493.333 ₫** **AND** giá trị dòng là 1.480.000 ₫

#### Scenario: Đúng nửa đồng làm tròn lên
- **WHEN** B 160.000 ₫, chi phí 1 ₫, phế liệu 0, sửa xong 2
- **THEN** giá vào Tốt = 160.000,5 → **160.001 ₫** **AND** giá trị dòng là 320.001 ₫

#### Scenario: Chi phí 0
- **WHEN** B 160.000 ₫, chi phí 0 ₫, phế liệu 0, sửa xong 10
- **THEN** giá vào Tốt là 160.000 ₫

#### Scenario: Giá Chờ sửa đổi giữa lúc lập và lúc ghi sổ
- **WHEN** nháp `GG-K17` sửa xong 36, phế liệu 0, chi phí 1.980.000 ₫ lập lúc B là 160.000 ₫, rồi một phiếu nhập đổi B thành 158.000 ₫ trước khi ghi sổ
- **THEN** phiếu ghi theo 158.000 ₫: giá vào Tốt = 158.000 + 55.000 = 213.000 ₫

### Requirement: Giá BQ Tốt và Phế liệu sau ghi sổ
Dòng vào Tốt và dòng vào Phế liệu SHALL làm đổi giá BQ của (mã hàng + tình trạng) đó theo luật giá BQ gia quyền của `inventory-ledger`, tính trên tồn của mọi vị trí kể cả công trình. Giá BQ Chờ sửa SHALL không đổi.

#### Scenario: Giá BQ Tốt cập nhật
- **WHEN** `GG-K17` Tốt tổng tồn 1.120 cái giá BQ 195.861 ₫ và phiếu ghi 36 cái vào Tốt giá trị 7.975.000 ₫
- **THEN** giá BQ Tốt mới = (1.120 × 195.861 + 7.975.000) ÷ 1.156 = 196.660,31 → **196.660 ₫** **AND** giá BQ Chờ sửa vẫn 160.000 ₫

#### Scenario: Giá BQ Phế liệu pha theo giá sắt vụn
- **WHEN** `GG-K17` Phế liệu tồn 42 cái giá BQ 150.000 ₫ và phiếu ghi 4 cái vào Phế liệu giá trị 405.000 ₫
- **THEN** giá BQ Phế liệu mới = (42 × 150.000 + 405.000) ÷ 46 = 145.760,87 → **145.761 ₫**

#### Scenario: Tốt chưa từng có hàng
- **WHEN** `GG-M16` chưa từng có tình trạng Tốt và phiếu ghi 5 cái vào Tốt giá trị 1.100.000 ₫
- **THEN** giá BQ Tốt đầu tiên của `GG-M16` là 220.000 ₫

### Requirement: Phế liệu đếm theo cái
Hàng hỏng hẳn SHALL vào Phế liệu của chính mã đó, đếm theo cái, không đổi sang mã tính theo kg; chỉ giá lấy theo giá sắt vụn. Màn hình SHALL hiện kèm kg quy đổi (số cái × trọng lượng chuẩn).

#### Scenario: Phế liệu khung giàn giáo
- **WHEN** `GG-K17` (trọng lượng chuẩn 13,5 kg) có 4 cái hỏng hẳn
- **THEN** sổ ghi +4 cái `GG-K17` Phế liệu **AND** D12 hiện "4 cái · 54 kg"

### Requirement: Ngày sửa xong và ngày ghi sổ
Ngày sửa xong SHALL là thông tin trên phiếu, mặc định hôm nay theo giờ Việt Nam, không được sau hôm nay. Ngày nghiệp vụ của mọi dòng sổ của phiếu SHALL là ngày ghi sổ (hôm nay theo giờ Việt Nam), không phải ngày sửa xong.

#### Scenario: Ngày sửa xong là ngày mai
- **WHEN** hôm nay 28/10/2026 và Kế toán lưu phiếu ngày sửa xong 29/10/2026
- **THEN** hệ thống từ chối với "Ngày sửa xong không được sau hôm nay"

#### Scenario: Ngày sửa xong cũ vẫn ghi sổ được
- **WHEN** phiếu có ngày sửa xong 25/10/2026, dòng gần nhất của `GG-K17` Tốt là ngày 27/10/2026, và Kế toán ghi sổ ngày 28/10/2026
- **THEN** phiếu ghi sổ được **AND** mọi dòng sổ của phiếu có ngày nghiệp vụ 28/10/2026 **AND** phiếu vẫn hiện ngày sửa xong 25/10/2026

#### Scenario: Nháp cũ ghi sổ sau khi Tốt có biến động mới
- **WHEN** nháp lập 28/10/2026 (ngày sửa xong 28/10), ngày 29/10 có phiếu xuất `GG-K17` Tốt, ngày 30/10 Kế toán ghi sổ
- **THEN** phiếu ghi sổ được với ngày nghiệp vụ 30/10/2026

### Requirement: Hỏi lại khi chi phí sửa cao
Khi chi phí sửa mỗi cái của một dòng (chi phí ÷ sửa xong) lớn hơn giá BQ Tốt hiện tại của mã, ghi sổ SHALL cần người dùng xác nhận dòng đó. Server SHALL tự kiểm lại lúc ghi sổ và từ chối nếu thiếu xác nhận. Mã chưa có giá BQ Tốt SHALL không bị hỏi.

#### Scenario: Chi phí mỗi cái vượt giá Tốt
- **WHEN** `GG-K17` Tốt giá BQ 195.861 ₫ và dòng sửa xong 20, chi phí 6.000.000 ₫ (300.000 ₫/cái)
- **THEN** D12 hỏi "GG-K17: chi phí sửa 300.000 ₫/cái, cao hơn giá vốn Tốt 195.861 ₫. Đúng không?" trước khi ghi sổ

#### Scenario: Bằng giá Tốt không hỏi
- **WHEN** `GG-K17` Tốt giá BQ 195.861 ₫ và chi phí mỗi cái đúng 195.861 ₫
- **THEN** không hỏi lại

#### Scenario: Gửi thẳng API không xác nhận
- **WHEN** gửi lệnh ghi sổ cho dòng 300.000 ₫/cái ở trên mà không kèm xác nhận
- **THEN** server trả 422 với câu hỏi đó và dòng bị hỏi **AND** không ghi gì

#### Scenario: Đã xác nhận
- **WHEN** gửi lại kèm xác nhận dòng `GG-K17`
- **THEN** phiếu ghi sổ được **AND** phiếu lưu "đã xác nhận chi phí cao GG-K17 300.000 ₫/cái"

### Requirement: Nháp và ghi sổ
Phiếu SHALL ở trạng thái Nháp (`DRAFT`) hoặc Đã ghi sổ (`POSTED`). Chỉ phiếu Nháp sửa, xóa hoặc ghi sổ được. Sửa nháp SHALL gửi kèm thời điểm sửa cuối; lệch thì từ chối với 409. Phiếu Đã ghi sổ SHALL không sửa, xóa hay ghi sổ lại được.

#### Scenario: Ghi sổ hai lần
- **WHEN** hai tab cùng bấm "Ghi sổ kho" cho `PSC-2026-024`
- **THEN** sổ chỉ có một bộ dòng của phiếu **AND** lần sau nhận "Phiếu đã được ghi sổ"

#### Scenario: Hai người sửa cùng nháp
- **WHEN** Kế toán lưu nháp `PSC-2026-024` sau khi Giám đốc vừa lưu chính phiếu đó
- **THEN** hệ thống trả 409 "Phiếu vừa được người khác sửa, tải lại trang"

#### Scenario: Xóa nháp
- **WHEN** Kế toán xóa nháp `PSC-2026-025`
- **THEN** phiếu biến mất khỏi danh sách **AND** sổ kho không đổi

#### Scenario: Xóa phiếu đã ghi sổ
- **WHEN** gửi lệnh xóa `PSC-2026-024` đã ghi sổ
- **THEN** hệ thống từ chối với "Phiếu đã ghi sổ, không sửa hay xóa được"

### Requirement: Ghi sổ trong một transaction
Ghi sổ SHALL ghi mọi dòng sổ của phiếu và chuyển phiếu sang Đã ghi sổ trong cùng một transaction, tính giá theo giá BQ đọc dưới khóa và giá sắt vụn hiện hành đọc trong transaction đó. Một dòng lỗi SHALL làm cả phiếu không được ghi.

#### Scenario: Một mã vừa ngừng dùng
- **WHEN** phiếu có 2 dòng và `GG-CH` bị ngừng dùng trước lúc ghi sổ
- **THEN** hệ thống từ chối với "Vật tư GG-CH đã ngừng dùng" **AND** không dòng sổ nào được ghi **AND** phiếu vẫn là Nháp

#### Scenario: Ghi sổ cùng lúc với phiếu nhập
- **WHEN** phiếu sửa `GG-K17` và một phiếu nhập `GG-K17` Tốt ghi sổ cùng lúc
- **THEN** giá BQ Tốt cuối bằng kết quả ghi lần lượt theo thứ tự hai phiếu hoàn tất

### Requirement: Quyền phiếu sửa chữa
Xem danh sách và phiếu SHALL cần `repairs.view` (Giám đốc, Kế toán, Kinh doanh). Lập, sửa, xóa nháp và ghi sổ SHALL cần `repairs.manage` (Giám đốc, Kế toán). Kiểm ở server cho cả trang và API.

#### Scenario: Kinh doanh xem nhưng không ghi sổ
- **WHEN** `quocbao` (Kinh doanh) mở `/repairs/PSC-2026-024` rồi gửi `POST /api/repairs/PSC-2026-024/post`
- **THEN** trang mở được, không có nút "Ghi sổ kho" **AND** API trả 403

#### Scenario: Kế toán ghi sổ
- **WHEN** `thuha` (Kế toán) ghi sổ `PSC-2026-024` hợp lệ
- **THEN** phiếu Đã ghi sổ, lưu `thuha` là người ghi sổ

#### Scenario: Xưởng gọi API
- **WHEN** `hoangnam` (Xưởng) gửi `GET /api/repairs`
- **THEN** API trả 403

### Requirement: Màn D12 phiếu sửa chữa
D12 SHALL có: thông tin chung (ngày sửa xong kèm ghi chú "Sổ kho ghi theo ngày ghi sổ", người/tổ sửa, lấy tại, nhập về, tổng chi phí, "N cái về Tốt · M cái thành phế liệu"); bảng hàng đem sửa (số đang chờ sửa tại chỗ lấy, lấy ra, sửa xong, phế liệu, chi phí); khối "Giá vốn sau sửa" từng mã; danh sách "Đang chờ sửa tại <vị trí>" để thêm mã.

#### Scenario: Khối giá vốn sau sửa
- **WHEN** dòng `GG-K17` (13,5 kg/cái) lấy 40, sửa xong 36, phế liệu 4, chi phí 1.980.000 ₫, B 160.000 ₫, giá sắt vụn 7.500 ₫/kg, Tốt tồn 1.120 giá BQ 195.861 ₫
- **THEN** khối hiện "Giá vốn Chờ sửa 160.000 ₫", "+ Chi phí sửa (1.980.000 ₫ ÷ 36) 55.000 ₫", "+ Phần hỏng gánh thêm (235.000 ₫ ÷ 36) 6.528 ₫", "= Giá vốn khi vào Tốt 221.528 ₫", "Giá vốn BQ Tốt: 195.861 ₫ → 196.660 ₫" **AND** "4 cái hỏng hẳn vào Phế liệu theo giá sắt vụn 405.000 ₫ (54 kg × 7.500 ₫)"

#### Scenario: Khối giá vốn khi cả dòng hỏng hết
- **WHEN** dòng `GG-M16` (12 kg/cái) lấy 5, sửa xong 0, phế liệu 5, B 210.000 ₫, giá sắt vụn 7.500 ₫/kg
- **THEN** khối hiện "5 cái hỏng hẳn vào Phế liệu theo giá sắt vụn 450.000 ₫ (60 kg × 7.500 ₫)" và "Lỗ hỏng hàng: 600.000 ₫" **AND** đầu phiếu hiện "Lỗ hỏng hàng 600.000 ₫"

#### Scenario: Tổng trên đầu phiếu
- **WHEN** phiếu có `GG-K17` (36 Tốt, 4 phế liệu, 1.980.000 ₫) và `GG-CH` (20 Tốt, 240.000 ₫)
- **THEN** đầu phiếu hiện "2.220.000 ₫" và "56 cái về Tốt · 4 cái thành phế liệu"

#### Scenario: Thêm mã từ danh sách chờ sửa
- **WHEN** lấy tại `BAI-01` có `GG-K17` Chờ sửa 201 cái giá 160.000 ₫ và người dùng bấm dòng đó
- **THEN** bảng thêm dòng `GG-K17` với "đang chờ sửa 201 cái" **AND** mã đó không bấm thêm lần nữa được

#### Scenario: Báo lỗi ngay trên dòng
- **WHEN** dòng `GG-K17` lấy 40, sửa xong 30, phế liệu 4
- **THEN** dòng hiện lỗi "Sửa xong + phế liệu (34) phải bằng số lấy ra (40)" **AND** nút "Ghi sổ kho" bị khóa

#### Scenario: Phiếu đã ghi sổ chỉ xem
- **WHEN** mở `PSC-2026-024` đã ghi sổ ngày 28/10/2026
- **THEN** mọi ô chỉ đọc, nhãn "Đã ghi sổ", hiện người ghi sổ, thời điểm và giá sắt vụn đã dùng **AND** khối giá vốn lấy số từ các dòng sổ của phiếu

### Requirement: Danh sách phiếu sửa chữa
Trang `/repairs` SHALL liệt kê cả phiếu sửa đơn giản và lệnh sửa, mới nhất trước, mỗi dòng: mã, "lấy tại → nhập về" (phiếu đơn giản) hoặc "lấy tại → xưởng" (lệnh), số mã, tổng sửa xong, tổng phế liệu, tổng chi phí (phiếu đơn giản; lệnh chỉ khi đã ghi sổ, còn lại "—"), trạng thái. Lọc theo trạng thái nằm trên URL, gồm Nháp, Đã giao, Đang sửa, Chờ nghiệm thu, Chờ ghi sổ (Đã đếm), Đã ghi sổ, Đã hủy. Người có `repairs.manage` SHALL thấy nút "Lệnh mới".

#### Scenario: Danh sách có nháp và phiếu đã ghi
- **WHEN** có `PSC-2026-024` Nháp và `PSC-2026-023` Đã ghi sổ
- **THEN** `PSC-2026-024` đứng trước với nhãn "Nháp" **AND** `/repairs?status=posted` chỉ hiện `PSC-2026-023`

#### Scenario: Lọc lệnh chờ ghi sổ
- **WHEN** có lệnh `PSC-2026-031` Đã đếm và phiếu đơn giản `PSC-2026-030` Đã ghi sổ
- **THEN** `/repairs?status=counted` chỉ hiện `PSC-2026-031` với nhãn "Chờ ghi sổ" và cột chi phí "—"

#### Scenario: Chưa có phiếu
- **WHEN** chưa có phiếu sửa chữa hay lệnh nào
- **THEN** trang hiện "Chưa có phiếu sửa chữa" và nút "Lệnh mới" (nếu có quyền)

### Requirement: Không lập phiếu sửa đơn giản mới
Từ khi có lệnh sửa chữa, hệ thống SHALL không tạo phiếu sửa đơn giản mới: nút tạo trên `/repairs` mở lệnh sửa, và API tạo phiếu đơn giản SHALL từ chối. Phiếu đơn giản Nháp đã có SHALL vẫn sửa, xóa, ghi sổ được theo đúng luật cũ (chi phí gõ tay). Phiếu đơn giản đã ghi sổ SHALL giữ nguyên số và cách hiện.

#### Scenario: Gửi thẳng API tạo phiếu đơn giản
- **WHEN** Kế toán gửi `POST /api/repairs` với chi phí sửa gõ tay theo kiểu phiếu đơn giản
- **THEN** API trả 422 "Phiếu sửa đơn giản không lập mới nữa, dùng lệnh sửa chữa"

#### Scenario: Nháp cũ vẫn ghi sổ
- **WHEN** `PSC-2026-025` là phiếu đơn giản Nháp lập trước khi có lệnh sửa
- **THEN** Kế toán mở D12 đơn giản, sửa chi phí và ghi sổ được như trước
