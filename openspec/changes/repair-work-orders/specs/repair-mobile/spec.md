## Purpose
Màn M8 trên điện thoại cho Xưởng nhận lệnh sửa, ghi số sửa xong, phế và vật tư đã dùng rồi báo sửa xong, và cho Thủ kho đếm nghiệm thu; không bao giờ hiện giá hay tiền.

## ADDED Requirements

### Requirement: Danh sách lệnh trên điện thoại
Trang `/m/repairs` SHALL liệt kê lệnh theo quyền của người xem: người có `repairs.work` thấy lệnh Đã giao (nút "Nhận lệnh") và Đang sửa (nút "Tiếp tục"); người có `repairs.count` thấy lệnh Chờ nghiệm thu (nút "Đếm nghiệm thu"). Mỗi thẻ SHALL có mã, xưởng, tổ, "<chỗ lấy> → <xưởng>", số mã và tổng số lấy ra theo đơn vị, không có giá.

#### Scenario: Thẻ lệnh cần nhận
- **WHEN** `PSC-2026-031` Đã giao cho `XUONG-01`, tổ anh Lực, lấy 40 `GG-K17` và 20 `CHEO-1,7` tại `BAI-01`
- **THEN** `hoangnam` (Xưởng) thấy thẻ "PSC-2026-031 · tổ anh Lực · BAI-01 → XUONG-01 · 2 mã · 60 cái" và nút "Nhận lệnh"

#### Scenario: Thủ kho không thấy lệnh đang sửa
- **WHEN** `PSC-2026-031` Đang sửa
- **THEN** `vantung` (Thủ kho) không thấy thẻ của lệnh đó trên `/m/repairs`

### Requirement: Màn M8 ghi số sửa
M8 (`/m/repairs/<mã>`) SHALL hiện đầu màn "Lệnh sửa chữa <mã>", "<trạng thái> · <tổ> · <xưởng>" và câu "Đã nhận N cái từ <chỗ lấy> ngày dd/mm. Sửa xong + Phế phải bằng số nhận." Mỗi mã là một thẻ: tên, mã, "nhận N cái Chờ sửa", stepper Sửa xong và Hỏng → Phế, vật tư đã dùng (tên, mã, đơn vị, ô số lượng) và nút "+ Thêm vật tư" chọn mã nhóm Vật tư đang dùng.

#### Scenario: Chân màn đủ số
- **WHEN** xưởng ghi `GG-K17` sửa xong 36, phế 4 và `CHEO-1,7` sửa xong 20, phế 0
- **THEN** chân màn hiện "56 sửa xong · 4 phế · đủ 60 / 60 · nháp đã lưu trên máy" **AND** nút "Báo sửa xong" bấm được

#### Scenario: Chưa đủ số
- **WHEN** `GG-K17` mới ghi sửa xong 30, phế 4
- **THEN** thẻ `GG-K17` báo "Sửa xong + Phế (34) phải bằng số nhận (40)" **AND** nút "Báo sửa xong" bị khóa

#### Scenario: Lệnh bị trả lại
- **WHEN** văn phòng trả lại `PSC-2026-031` với lý do "Que hàn ghi 60 kg, kiểm lại"
- **THEN** M8 hiện khung "Văn phòng trả lại: Que hàn ghi 60 kg, kiểm lại" trên đầu danh sách mã

#### Scenario: Thủ kho đếm trên cùng màn
- **WHEN** `vantung` mở M8 của lệnh Chờ nghiệm thu
- **THEN** stepper mặc định bằng số xưởng báo, có ghi chú "Xưởng báo 36 sửa xong, 4 phế" **AND** nút chân màn là "Đếm xong"

### Requirement: Chân màn M8
Chân M8 SHALL hiện "<sửa xong> sửa xong · <phế> phế · đủ <tổng> / <nhận>" kèm trạng thái nháp, và nút "Báo sửa xong" (Xưởng) hoặc "Đếm xong" (Thủ kho), khóa khi còn mã chưa đủ số.

#### Scenario: Thủ kho thấy nút Đếm xong
- **WHEN** `vantung` mở M8 của lệnh Chờ nghiệm thu đủ số
- **THEN** chân màn có nút "Đếm xong", không có nút "Báo sửa xong"

### Requirement: Nhận lệnh trên điện thoại
Bấm "Nhận lệnh" SHALL hỏi lại "Nhận N cái từ <chỗ lấy> về <xưởng>? Sổ kho sẽ ghi chuyển hàng." rồi gửi lệnh nhận. Nhận xong SHALL mở M8 của lệnh. Lệnh nhận SHALL mang mã nháp sinh trên máy; gửi lại cùng mã nháp sau khi đã nhận SHALL trả kết quả cũ, không ghi sổ lần hai.

#### Scenario: Nhận lệnh khi mất mạng trả lời
- **WHEN** server đã ghi nhận `PSC-2026-031` nhưng điện thoại mất mạng trước khi nhận trả lời, rồi gửi lại cùng mã nháp
- **THEN** điện thoại nhận "Đã nhận lệnh PSC-2026-031" **AND** sổ chỉ có một bộ 4 dòng chuyển hàng

### Requirement: Yêu cầu cũ gửi lại không ghi đè
Mỗi lần bấm Nhận lệnh, Báo sửa xong, Đếm xong SHALL mang một mã nháp mới. Server SHALL nhớ mọi mã nháp đã dùng của lệnh; gặp lại mã đã dùng SHALL trả trạng thái hiện tại của lệnh và không ghi gì, kể cả khi lệnh đã qua các bước sau.

#### Scenario: Yêu cầu báo lần một tới muộn
- **WHEN** xưởng báo `PSC-2026-031` sửa xong 30 (mã nháp `d1`), văn phòng trả lại, xưởng báo lần hai sửa xong 36 (mã nháp `d2`), rồi yêu cầu `d1` bị kẹt mạng mới tới server
- **THEN** server trả trạng thái hiện tại (Chờ nghiệm thu, sửa xong 36) **AND** số của lần hai giữ nguyên **AND** nhật ký không có dòng Báo sửa xong thứ ba

### Requirement: Nháp số sửa trên máy
Số đã ghi trên M8 SHALL lưu nháp trên máy theo luật `mobile-drafts` (tự lưu, chỉ của người tạo, gửi lại khi có mạng, nhãn "Nháp cũ"). Báo sửa xong và Đếm xong SHALL gửi cả số và vật tư cùng thời điểm sửa cuối của lệnh; server từ chối (409, sai số) SHALL mở lại nháp kèm thông báo, không mất số.

#### Scenario: Báo sửa xong lúc mất mạng
- **WHEN** xưởng bấm "Báo sửa xong" khi không có mạng
- **THEN** M8 hiện "Chưa gửi được, sẽ tự gửi khi có mạng" **AND** M7 hiện nháp "Sửa PSC-2026-031" ở mục "Chưa gửi"

#### Scenario: Văn phòng hủy lệnh trước khi gửi
- **WHEN** nháp "Chờ gửi" của `PSC-2026-031` được gửi lại sau khi Kế toán đã hủy lệnh
- **THEN** nháp chuyển "Bị từ chối" kèm "Lệnh PSC-2026-031 đã hủy" **AND** số đã ghi vẫn còn trên máy

### Requirement: Điện thoại không thấy giá
M8, `/m/repairs` và mọi API `/api/m/repairs/**` SHALL không trả trường giá, giá BQ, công, giá trị vật tư hay chi phí sửa nào, kể cả cho Giám đốc.

#### Scenario: Đọc lệnh qua API điện thoại
- **WHEN** `hoangnam` gửi `GET /api/m/repairs/PSC-2026-031`
- **THEN** JSON có mã hàng, số lấy ra, số sửa xong, phế, vật tư (mã, tên, đơn vị, số lượng) **AND** không có khóa nào chứa giá, đơn giá, giá trị, công, chi phí

#### Scenario: Văn phòng gọi API điện thoại
- **WHEN** `thuha` (Kế toán) gửi `GET /api/m/repairs`
- **THEN** API trả 403
