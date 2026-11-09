# production-mobile Specification

## Purpose
Cho Xưởng và Thủ kho nhận lệnh, ghi số làm xong, nguyên liệu thực dùng, đầu thừa và đếm thành phẩm trên điện thoại, chạy được khi mất sóng và không bao giờ thấy số tiền.

## Requirements

### Requirement: Danh sách lệnh sản xuất trên điện thoại
Trang `/m/production` SHALL liệt kê lệnh theo quyền:
- `production.work` thấy lệnh Đã giao (nút "Nhận lệnh") và Đang làm (nút "Tiếp tục");
- `production.count` thấy lệnh Chờ đếm (nút "Đếm thành phẩm").

Mỗi thẻ SHALL có mã, tổ, xưởng → bãi nhận, số thành phẩm theo kế hoạch. Thẻ không có giá. Lệnh bị trả lại SHALL có nhãn "Văn phòng trả lại".

#### Scenario: Xưởng có lệnh mới
- **WHEN** `LSX-2026-004` Đã giao cho tổ anh Lực, `XUONG-01` → `BAI-01`, 100 `GG-K17` và 200 `GG-CH`
- **THEN** `/m/production` của `hoangnam` có thẻ "LSX-2026-004 · tổ anh Lực · XUONG-01 → BAI-01 · 300 cái" với nút "Nhận lệnh"

#### Scenario: Kế toán không mở được
- **WHEN** `thuha` (Kế toán) gọi `GET /api/m/production`
- **THEN** API trả 403

### Requirement: Xưởng ghi số trên M10
Sau khi nhận lệnh, M10 SHALL cho xưởng ghi theo từng dòng thành phẩm:
- **Làm xong:** stepper số nguyên ≥ 0, mặc định bằng số kế hoạch.
- **Nguyên liệu thực dùng:** điền sẵn định mức đã chụp × số làm xong (đơn vị đếm làm tròn lên số nguyên), sửa được: đơn vị đếm là số nguyên, kg / m / lít tối đa 3 chữ số lẻ. Xưởng thêm được mã nhóm Vật tư ngoài định mức, bỏ được nguyên liệu (về 0).
- **Đầu thừa (kg):** ≥ 0, tối đa 3 chữ số lẻ.

M10 SHALL không hiện giá, giá trị, công hay giá sắt vụn.

#### Scenario: Điền sẵn theo định mức
- **WHEN** `hoangnam` mở `LSX-2026-004` Đang làm, dòng `GG-K17` để làm xong 100
- **THEN** `VT-ONG42` điền sẵn 980 kg, `VT-ONG27` 360 kg, `VT-QH` 12 kg, `VT-SON` 8 lít, `VT-CHOT` 400 cái

#### Scenario: Điền sẵn nguyên liệu tính theo cây
- **WHEN** định mức có `VT-THANH` 0,5 cây / cái và xưởng để làm xong 3
- **THEN** `VT-THANH` điền sẵn 2 cây

#### Scenario: Đổi số làm xong thì định mức đổi theo
- **WHEN** xưởng đổi làm xong `GG-K17` từ 100 thành 90 khi chưa sửa số nguyên liệu nào
- **THEN** `VT-ONG42` điền sẵn thành 882 kg **AND** nguyên liệu xưởng đã sửa tay giữ nguyên số đã sửa

### Requirement: Nhắc vượt định mức trên M10
Nguyên liệu thực dùng vượt định mức quá 5 % (cùng cách tính với D20) SHALL có dòng nhắc màu `warning`: "<tên> vượt định mức <x> %: văn phòng sẽ hỏi Giám đốc". Nhắc chỉ để xưởng biết, không chặn Báo làm xong.

#### Scenario: Nhắc vượt định mức
- **WHEN** xưởng nhập `VT-ONG27` 391 kg cho dòng `GG-K17` 100 cái
- **THEN** M10 hiện "Ống D27 vượt định mức 8,6 %: văn phòng sẽ hỏi Giám đốc"

### Requirement: Số chỉ lên server khi báo xong hoặc đếm xong
Số của xưởng SHALL nằm trong nháp trên máy, và chỉ gửi lên server khi bấm "Báo làm xong". Trước đó D20 hiện "Xưởng đang làm". Thủ kho đếm trên cùng màn, mở với số xưởng đã báo. Số của Thủ kho chỉ gửi khi bấm "Đếm xong". Mất sóng thì nháp chờ gửi như các nháp điện thoại khác.

#### Scenario: Mất sóng khi báo làm xong
- **WHEN** `hoangnam` bấm "Báo làm xong" lúc mất sóng
- **THEN** nháp nằm ở "1 phiếu chưa gửi" **AND** lệnh trên server vẫn Đang làm **AND** khi có sóng nháp tự gửi và lệnh sang Chờ đếm

#### Scenario: Thủ kho mở số xưởng báo
- **WHEN** xưởng báo `GG-K17` 102 cái, `vantung` mở `LSX-2026-004` Chờ đếm
- **THEN** M10 hiện làm xong 102 cái để Thủ kho sửa thành số đếm được

### Requirement: Gửi lại không ghi hai lần
Mỗi lần bấm Nhận lệnh, Báo làm xong, Đếm xong SHALL mang một `draftId` mới sinh trên máy. Server SHALL lưu mọi `draftId` đã dùng (chỉ ghi thêm). Gặp `draftId` đã dùng thì server trả trạng thái hiện tại của lệnh và không ghi gì, kể cả khi lệnh đã qua nhiều bước sau đó.

#### Scenario: Yêu cầu cũ tới muộn
- **WHEN** xưởng báo lần một (`d1`), văn phòng trả lại, xưởng báo lần hai (`d2`), rồi yêu cầu `d1` tới server muộn
- **THEN** server trả trạng thái hiện tại **AND** số của lần `d2` giữ nguyên

### Requirement: API điện thoại không có tiền
`/api/m/production/**` SHALL chỉ trả mã, tên, đơn vị, số lượng, trạng thái, người, lúc. Không có giá, giá trị, công, đơn giá, giá sắt vụn. Báo làm xong và Đếm xong SHALL kiểm: mỗi dòng của lệnh có đúng một mục, số làm xong nguyên ≥ 0, số nguyên liệu ≥ 0 (nguyên với đơn vị đếm), đầu thừa ≥ 0, nguyên liệu là mã nhóm Vật tư đang dùng.

#### Scenario: Không có khóa tiền trong JSON
- **WHEN** `hoangnam` gọi `GET /api/m/production/LSX-2026-004`
- **THEN** JSON không có khóa nào khớp `/price|cost|amount|rate|labor|value/i`

#### Scenario: Báo nguyên liệu không phải vật tư
- **WHEN** xưởng báo nguyên liệu `GG-CH` (nhóm Thiết bị) cho dòng `GG-K17`
- **THEN** API trả 422 "Nguyên liệu phải là mã nhóm Vật tư"

#### Scenario: Số lẻ với nguyên liệu tính theo cái
- **WHEN** xưởng báo `VT-CHOT` 400,5 cái
- **THEN** API trả 422 "VT-CHOT tính theo cái, nhập số nguyên"

#### Scenario: Thủ kho gọi báo làm xong
- **WHEN** `vantung` (Thủ kho) gọi `POST /api/m/production/LSX-2026-004/report`
- **THEN** API trả 403
