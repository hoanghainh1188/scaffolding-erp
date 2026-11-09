## ADDED Requirements

### Requirement: Lập lệnh sản xuất
Người có `production.manage` (Giám đốc, Kế toán) SHALL lập lệnh sản xuất, mã `LSX-YYYY-NNN` tăng theo năm. Lệnh SHALL có:
- một xưởng (vị trí loại xưởng, đang dùng);
- một bãi nhận thành phẩm (vị trí loại bãi, đang dùng);
- tổ làm (chữ, không bắt buộc) và ghi chú;
- ít nhất một dòng thành phẩm, mỗi dòng một mã khác nhau có định mức, số kế hoạch là số nguyên > 0.

Khi lập và sửa nháp, D20 SHALL hiện nguyên liệu dự kiến = định mức hiện tại × số kế hoạch. Lệnh Nháp SHALL sửa, xóa được.

#### Scenario: Lập lệnh hai thành phẩm
- **WHEN** Kế toán lập lệnh xưởng `XUONG-01`, bãi nhận `BAI-01`, tổ anh Lực, dòng `GG-K17` 100 cái và `GG-CH` 200 cái
- **THEN** lệnh `LSX-2026-004` ở trạng thái Nháp **AND** dòng `GG-K17` hiện nguyên liệu dự kiến `VT-ONG42` 980 kg, `VT-ONG27` 360 kg, `VT-QH` 12 kg, `VT-SON` 8 lít, `VT-CHOT` 400 cái

#### Scenario: Thành phẩm chưa có định mức
- **WHEN** Kế toán thêm dòng `CC-3M` (chưa có định mức) vào lệnh
- **THEN** hệ thống từ chối với "CC-3M chưa có định mức"

#### Scenario: Số kế hoạch lẻ
- **WHEN** Kế toán nhập `GG-K17` 10,5 cái
- **THEN** hệ thống từ chối với "Số kế hoạch phải là số nguyên lớn hơn 0"

#### Scenario: Bãi nhận là xưởng
- **WHEN** Kế toán chọn bãi nhận `XUONG-01`
- **THEN** hệ thống từ chối với "Thành phẩm phải nhập về một bãi"

### Requirement: Bước ở xưởng, bãi và của Giám đốc
Lệnh SHALL đi qua các bước sau. Bước không đúng trạng thái SHALL bị từ chối với 409.

| Bước | Từ | Sang |
|---|---|---|
| Nhận lệnh | Đã giao | Đang làm |
| Báo làm xong | Đang làm | Chờ đếm |
| Đếm xong | Chờ đếm | Chờ ghi sổ, hoặc Chờ Giám đốc duyệt khi vượt định mức |
| Duyệt vượt định mức | Chờ Giám đốc duyệt | Chờ ghi sổ |

#### Scenario: Nhận lệnh hai lần
- **WHEN** `hoangnam` nhận `LSX-2026-004` đang Đang làm bằng một mã nháp mới
- **THEN** hệ thống trả 409 "Lệnh không còn ở trạng thái Đã giao"

### Requirement: Bước của văn phòng
Các bước sau SHALL do văn phòng làm. Bước không đúng trạng thái SHALL bị từ chối với 409.

| Bước | Từ | Sang |
|---|---|---|
| Giao xưởng | Nháp | Đã giao |
| Thu hồi | Đã giao | Nháp |
| Trả lại xưởng | Chờ đếm, Chờ Giám đốc duyệt, Chờ ghi sổ | Đang làm |
| Ghi sổ | Chờ ghi sổ | Đã ghi sổ |
| Hủy | mọi trạng thái trừ Đã ghi sổ, Đã hủy | Đã hủy |

Mỗi bước ghi người và lúc làm. Trả lại SHALL có ghi chú. Hủy SHALL có lý do. Lệnh Đã ghi sổ hoặc Đã hủy SHALL không sửa được gì.

#### Scenario: Ghi sổ khi chưa đếm
- **WHEN** Kế toán ghi sổ `LSX-2026-004` đang Chờ đếm
- **THEN** hệ thống trả 409 "Lệnh chưa ở trạng thái Chờ ghi sổ"

#### Scenario: Trả lại xóa số đếm và lần duyệt
- **WHEN** `LSX-2026-004` Chờ ghi sổ sau khi Giám đốc duyệt, rồi Kế toán trả lại xưởng với ghi chú "Đếm lại ống D27"
- **THEN** lệnh về Đang làm **AND** số Thủ kho đếm và lần duyệt bị bỏ **AND** số xưởng báo lần trước vẫn hiện trên D20 để tham khảo

#### Scenario: Hủy không có lý do
- **WHEN** Kế toán hủy `LSX-2026-005` để trống lý do
- **THEN** hệ thống từ chối với "Nhập lý do hủy"

#### Scenario: Hủy sau khi xưởng nhận
- **WHEN** Kế toán hủy `LSX-2026-005` đang Đang làm với lý do "Khách đổi đơn"
- **THEN** lệnh sang Đã hủy **AND** không có dòng sổ kho nào được ghi

### Requirement: Giao xưởng chụp định mức và đơn giá công
Khi giao xưởng, hệ thống SHALL chép vào lệnh, cho từng dòng thành phẩm, đơn giá công / cái và danh sách nguyên liệu với số / 1 cái của định mức lúc đó. Thu hồi về Nháp SHALL bỏ phần đã chép. Giao lại thì chép lại. Mọi số định mức và công của lệnh đã giao SHALL đọc từ phần đã chép.

#### Scenario: Chụp lúc giao
- **WHEN** Kế toán giao `LSX-2026-004` ngày 03/11/2026 khi định mức `GG-CH` có công 8.000 ₫ / cái và `VT-ONG27` 2,9 kg / cái
- **THEN** dòng `GG-CH` của lệnh ghi công 8.000 ₫ và định mức `VT-ONG27` 580 kg cho 200 cái

#### Scenario: Thu hồi rồi giao lại
- **WHEN** Kế toán thu hồi `LSX-2026-004`, sửa định mức `GG-CH` thành công 9.000 ₫, rồi giao lại
- **THEN** dòng `GG-CH` ghi công 9.000 ₫

### Requirement: Vượt định mức
Với mỗi nguyên liệu của một dòng, **định mức** SHALL bằng số / 1 cái đã chụp × số làm xong do Thủ kho đếm; nguyên liệu đơn vị đếm làm tròn lên số nguyên. Nguyên liệu ngoài định mức có định mức 0. **Vượt quá 5 %** khi thực dùng × 100 > định mức × 105; thực dùng > 0 trên định mức 0 luôn là vượt. Ngưỡng 5 % đặt ở một chỗ trong code.

Khi Thủ kho đếm xong, có ít nhất một nguyên liệu vượt quá 5 % thì lệnh SHALL sang **Chờ Giám đốc duyệt**, không thì sang Chờ ghi sổ.

#### Scenario: Vượt 8,6 % phải chờ Giám đốc
- **WHEN** Thủ kho đếm `LSX-2026-004`: `GG-K17` 100 cái, `VT-ONG27` 391 kg (định mức 360 kg)
- **THEN** chênh lệch `VT-ONG27` là + 8,6 % **AND** lệnh sang Chờ Giám đốc duyệt

#### Scenario: Vượt đúng 5 % không cần duyệt
- **WHEN** dòng `GG-CH` 200 cái, `VT-ONG27` định mức 580 kg, thực dùng 609 kg, các nguyên liệu khác không vượt
- **THEN** chênh lệch + 5,0 % **AND** lệnh sang Chờ ghi sổ

#### Scenario: Dùng thêm nguyên liệu ngoài định mức
- **WHEN** Thủ kho đếm xong `LSX-2026-004` có 0,5 kg `VT-QH` ở dòng `GG-CH` (định mức không có `VT-QH`)
- **THEN** `VT-QH` của dòng `GG-CH` có định mức 0 và bị tính là vượt **AND** lệnh sang Chờ Giám đốc duyệt

#### Scenario: Định mức nguyên liệu tính theo cây
- **WHEN** định mức `MAM-1,6` có `VT-THANH` 0,5 cây / cái và Thủ kho đếm 3 cái, thực dùng 2 cây
- **THEN** định mức của `VT-THANH` là 2 cây (1,5 làm tròn lên) **AND** không tính là vượt

#### Scenario: Dùng ít hơn định mức
- **WHEN** `VT-SON` của khung định mức 8 lít, thực dùng 7,5 lít
- **THEN** chênh lệch − 6,3 % **AND** không tính là vượt

### Requirement: Chênh lệch định mức trên D20
D20 SHALL hiện cho mỗi nguyên liệu: định mức, thực dùng, chênh lệch %, giá trị theo giá BQ. Nguyên liệu vượt quá 5 % SHALL tô màu `warning`. **Giá trị dùng vượt cả lệnh** = Σ (thực dùng − định mức, nếu dương) × giá BQ, làm tròn từng nguyên liệu đến 1 ₫. Số này chỉ để xem, không ghi sổ riêng: phần dùng vượt nằm trong giá thành phẩm.

#### Scenario: Giá trị dùng vượt
- **WHEN** `LSX-2026-004` có thực dùng vượt định mức: `VT-ONG42` 1.012 / 980 kg (19.500 ₫/kg), `VT-ONG27` của khung 391 / 360 kg (19.000 ₫/kg), `VT-QH` 12,5 / 12 kg (45.000 ₫/kg), `VT-ONG27` của chéo 586 / 580 kg
- **THEN** giá trị dùng vượt cả lệnh là 624.000 + 589.000 + 22.500 + 114.000 = 1.349.500 ₫

### Requirement: Giám đốc duyệt vượt định mức
Chỉ người có `production.approve` (Giám đốc) SHALL duyệt lệnh Chờ Giám đốc duyệt, kèm ghi chú bắt buộc. Duyệt xong lệnh sang Chờ ghi sổ. Giám đốc không đồng ý thì trả lại xưởng. Lệnh Chờ Giám đốc duyệt SHALL không ghi sổ được.

#### Scenario: Kế toán ghi sổ khi chưa duyệt
- **WHEN** Kế toán ghi sổ `LSX-2026-004` đang Chờ Giám đốc duyệt
- **THEN** hệ thống trả 409 "Lệnh chưa ở trạng thái Chờ ghi sổ" **AND** không ghi dòng sổ nào

#### Scenario: Giám đốc duyệt có ghi chú
- **WHEN** `minhanh` (Giám đốc) duyệt `LSX-2026-004` với ghi chú "Ống D27 lô mới cong, chấp nhận"
- **THEN** lệnh sang Chờ ghi sổ **AND** D20 hiện người duyệt, lúc duyệt và ghi chú

#### Scenario: Kế toán không duyệt được
- **WHEN** `thuha` (Kế toán) gọi API duyệt `LSX-2026-004`
- **THEN** API trả 403

#### Scenario: Duyệt không có ghi chú
- **WHEN** Giám đốc duyệt để trống ghi chú
- **THEN** hệ thống từ chối với "Nhập ghi chú duyệt"

### Requirement: Ghi sổ lệnh sản xuất
Ghi sổ SHALL dùng số Thủ kho đếm, ngày ghi sổ, một transaction. Mỗi dòng thành phẩm:
- **Nguyên liệu:** `PRODUCTION_OUT` ở xưởng theo giá BQ, **Mới trước rồi Tốt**, mỗi (dòng, nguyên liệu, tình trạng) một dòng sổ.
- **Công** = số làm xong × đơn giá đã chụp.
- **Đầu thừa:** `PRODUCTION_IN` Phế liệu của Mã sắt vụn ở bãi nhận, kg × giá sắt vụn, làm tròn 1 ₫.
- **Thành phẩm:** `PRODUCTION_IN` Mới ở bãi nhận, giá trị = nguyên liệu + công − đầu thừa.

#### Scenario: Ghi sổ lệnh mẫu D20
- **WHEN** Kế toán ghi sổ `LSX-2026-004` ngày 09/11/2026 với giá sắt vụn 7.500 ₫/kg. Dòng `GG-K17` làm xong 100 cái, nguyên liệu 29.445.500 ₫, công 100 × 35.000 ₫, đầu thừa 38 kg. Dòng `GG-CH` làm xong 200 cái, nguyên liệu 11.134.000 + 540.000 ₫, công 200 × 8.000 ₫, đầu thừa 9 kg
- **THEN** dòng `GG-K17` có giá trị 29.445.500 + 3.500.000 − 285.000 = 32.660.500 ₫, giá vốn 326.605 ₫ / cái
- **AND** dòng `GG-CH` có giá trị 11.674.000 + 1.600.000 − 67.500 = 13.206.500 ₫
- **AND** tổng lệnh: nguyên liệu 41.119.500 ₫, công 5.100.000 ₫, đầu thừa 47 kg = 352.500 ₫, giá trị thành phẩm 45.867.000 ₫
- **AND** sổ có `PRODUCTION_IN` +100 `GG-K17` Mới 32.660.500 ₫ và +200 `GG-CH` Mới 13.206.500 ₫ ở `BAI-01`, `PRODUCTION_IN` +47 kg Phế liệu `PL-SATVUN` 352.500 ₫ ở `BAI-01`
- **AND** tổng giá trị mọi dòng sổ của lần ghi sổ là +5.100.000 ₫ (bằng công khoán)

#### Scenario: Giá vốn / cái không chia hết
- **WHEN** dòng `GG-CH` 200 cái có giá trị 13.206.500 ₫
- **THEN** dòng sổ `PRODUCTION_IN` ghi đúng giá trị 13.206.500 ₫ **AND** D20 hiện giá vốn 66.033 ₫ / cái (66.032,5 làm tròn) **AND** `npm run inventory:check` không báo lệch

#### Scenario: Nguyên liệu Mới trước rồi Tốt
- **WHEN** dòng `GG-K17` dùng 391 kg `VT-ONG27`, ở `XUONG-01` còn 300 kg Mới giá BQ 19.000 ₫ và 500 kg Tốt giá BQ 16.000 ₫, không dòng nào khác dùng `VT-ONG27`
- **THEN** sổ có `PRODUCTION_OUT` −300 kg Mới (−5.700.000 ₫) và −91 kg Tốt (−1.456.000 ₫) **AND** giá trị `VT-ONG27` của dòng là 7.156.000 ₫

#### Scenario: Ghi sổ đồng thời với phiếu xuất
- **WHEN** Kế toán ghi sổ `LSX-2026-004` cùng lúc Thủ kho ghi sổ phiếu xuất lấy `GG-K17` ở `BAI-01`
- **THEN** cả hai ghi được, theo thứ tự khóa của sổ kho **AND** giá BQ `GG-K17` Mới sau cả hai đúng như ghi lần lượt

### Requirement: Điều kiện ghi sổ lệnh sản xuất
Ghi sổ SHALL bị từ chối, không ghi dòng sổ nào và lệnh giữ Chờ ghi sổ, khi:
- tồn Mới + Tốt của một nguyên liệu ở xưởng nhỏ hơn tổng cần cho cả lệnh;
- có đầu thừa mà chưa có giá sắt vụn hoặc chưa chọn Mã sắt vụn;
- một dòng có số làm xong 0;
- đầu thừa của một dòng nặng hơn tổng kg nguyên liệu của dòng (quy theo trọng lượng chuẩn);
- giá trị thành phẩm của một dòng ≤ 0.

#### Scenario: Thiếu nguyên liệu ở xưởng
- **WHEN** hai dòng của lệnh cần tổng 977 kg `VT-ONG27`, ở `XUONG-01` chỉ còn 900 kg Mới + Tốt
- **THEN** hệ thống từ chối với "VT-ONG27 ở XUONG-01 còn 900 kg, lệnh cần 977 kg" **AND** không ghi dòng sổ nào **AND** lệnh vẫn Chờ ghi sổ

#### Scenario: Chưa có giá sắt vụn
- **WHEN** lệnh có 38 kg đầu thừa và chưa có giá sắt vụn nào
- **THEN** hệ thống từ chối với "Chưa có giá sắt vụn, Giám đốc đặt giá trước khi ghi sổ"

#### Scenario: Không có đầu thừa thì không cần giá sắt vụn
- **WHEN** lệnh có đầu thừa 0 kg ở mọi dòng và chưa có giá sắt vụn
- **THEN** lệnh ghi sổ được **AND** không có dòng Phế liệu

#### Scenario: Dòng làm xong 0 cái
- **WHEN** Thủ kho đếm dòng `GG-CH` 0 cái nhưng còn 586 kg `VT-ONG27` thực dùng
- **THEN** ghi sổ bị từ chối với "GG-CH làm xong 0 cái: bỏ nguyên liệu của dòng, nguyên liệu hỏng thì lập phiếu điều chỉnh"

#### Scenario: Đầu thừa nặng hơn nguyên liệu
- **WHEN** dòng `GG-CH` dùng 586 kg `VT-ONG27` và 6 lít `VT-SON` (1,3 kg/lít), báo đầu thừa 600 kg
- **THEN** hệ thống từ chối với "Đầu thừa của GG-CH (600 kg) nặng hơn nguyên liệu (593,8 kg)"

#### Scenario: Chưa chọn Mã sắt vụn
- **WHEN** lệnh có 38 kg đầu thừa, đã có giá sắt vụn nhưng chưa chọn Mã sắt vụn
- **THEN** hệ thống từ chối với "Chưa chọn Mã sắt vụn, Giám đốc chọn ở trang Giá sắt vụn"

### Requirement: Xem lệnh trên D20 và danh sách
Trang `/production` SHALL liệt kê lệnh: mã, trạng thái, tổ, xưởng → bãi, thành phẩm, ngày. Có lọc theo trạng thái, lệnh mới nhất trước. D20 SHALL hiện tiến trình 7 bước, mỗi dòng thành phẩm và tổng lệnh như thiết kế. Trước khi ghi sổ, giá trị tính theo giá BQ hiện tại và ghi "tạm tính". Sau khi ghi sổ, mọi số đọc từ lệnh đã lưu và dòng sổ kho. Khi số Thủ kho đếm khác số xưởng báo, D20 SHALL hiện cả hai.

#### Scenario: Lệnh đã ghi sổ không đổi theo giá mới
- **WHEN** `LSX-2026-004` đã ghi sổ, rồi giá BQ `VT-ONG42` Mới đổi thành 20.000 ₫
- **THEN** D20 của `LSX-2026-004` vẫn hiện `VT-ONG42` 19.734.000 ₫ và giá trị `GG-K17` 32.660.500 ₫

#### Scenario: Thủ kho đếm khác xưởng báo
- **WHEN** xưởng báo `GG-K17` 102 cái, Thủ kho đếm 100 cái
- **THEN** D20 hiện "100 cái (xưởng báo 102)"

### Requirement: Quyền lệnh sản xuất
Quyền SHALL kiểm ở server:

| Quyền | Vai trò |
|---|---|
| `production.view` | Giám đốc, Kế toán, Kinh doanh |
| `production.manage` | Giám đốc, Kế toán |
| `production.approve` | Giám đốc |
| `production.work` | Giám đốc, Xưởng |
| `production.count` | Giám đốc, Thủ kho |

#### Scenario: Xưởng gọi ghi sổ
- **WHEN** `hoangnam` (Xưởng) gọi API ghi sổ `LSX-2026-004`
- **THEN** API trả 403 **AND** không ghi gì

#### Scenario: Thủ kho gọi ghi sổ
- **WHEN** `vantung` (Thủ kho) gọi API ghi sổ `LSX-2026-004`
- **THEN** API trả 403

#### Scenario: Kinh doanh chỉ xem
- **WHEN** `minhtuan` (Kinh doanh) mở D20 của `LSX-2026-004` rồi gọi API giao xưởng một lệnh Nháp
- **THEN** D20 hiện lệnh, không có nút thao tác **AND** API trả 403

### Requirement: Sửa đồng thời
Mọi lệnh ghi từ desktop SHALL gửi kèm `updatedAt` của lệnh. Lệnh đã bị người khác đổi thì SHALL trả 409 và không ghi gì.

#### Scenario: Hai người cùng thao tác
- **WHEN** Kế toán mở `LSX-2026-004`, Giám đốc trả lại xưởng, rồi Kế toán bấm Ghi sổ với `updatedAt` cũ
- **THEN** hệ thống trả 409 "Lệnh vừa được người khác cập nhật, tải lại trang" **AND** không ghi dòng sổ nào
