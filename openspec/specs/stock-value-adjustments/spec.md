# stock-value-adjustments Specification

## Purpose
Phiếu điều chỉnh giá trị kho sửa giá trị đã ghi sai của (mã hàng + tình trạng) mà không đổi số lượng: ghi một dòng chênh lệch vào sổ kho sau khi Giám đốc duyệt, làm đổi giá vốn bình quân của toàn công ty.

## Requirements

### Requirement: Dòng điều chỉnh giá trị
Phiếu điều chỉnh giá trị (mã `ĐCG-<năm>-<số 3 chữ số>`, VD `ĐCG-2026-001`) SHALL gồm một hoặc nhiều dòng, mỗi dòng có: mã hàng, tình trạng, **chênh lệch giá trị** (VND, số nguyên khác 0; dương là tăng, âm là giảm). Dòng SHALL không có số lượng và không có vị trí. Một (mã hàng + tình trạng) SHALL xuất hiện tối đa một lần trên một phiếu. Phiếu điều chỉnh giá trị SHALL không chứa dòng số lượng, tình trạng, vị trí hay tồn đầu kỳ.

#### Scenario: Chênh lệch bằng 0
- **WHEN** Kế toán lưu dòng `GG-K17` Tốt với chênh lệch 0 ₫
- **THEN** hệ thống từ chối với "Chênh lệch giá trị phải khác 0"

#### Scenario: Chênh lệch có số lẻ
- **WHEN** Kế toán nhập chênh lệch −1.500.000,5 ₫
- **THEN** hệ thống từ chối với "Chênh lệch giá trị phải là số nguyên đồng"

#### Scenario: Trùng mã và tình trạng
- **WHEN** phiếu có hai dòng `GG-K17` Tốt
- **THEN** hệ thống từ chối với "GG-K17 Tốt đã có trên phiếu"

### Requirement: Giá vốn bình quân mới
Khi ghi sổ, giá BQ mới của (mã hàng + tình trạng) SHALL bằng (tồn × giá BQ hiện tại + chênh lệch) ÷ tồn, trong đó tồn là tổng tồn ở **mọi vị trí** (bãi, xưởng, công trình) lúc duyệt; làm tròn đến 1 ₫, 0,5 làm tròn lên; tính bằng số nguyên lớn. Số lượng tồn SHALL không đổi. Tình trạng khác của cùng mã SHALL không đổi giá.

#### Scenario: Giảm giá trị
- **WHEN** `GG-K17` Tốt tổng tồn 1.240 cái, giá BQ 195.282 ₫ (giá trị 242.149.680 ₫) và `ĐCG-2026-001` giảm 1.500.000 ₫ được duyệt
- **THEN** giá BQ mới = 240.649.680 ÷ 1.240 = 194.072,32 → **194.072 ₫** **AND** tồn vẫn 1.240 cái

#### Scenario: Hàng ở công trình cũng tính
- **WHEN** `GG-K17` Tốt có 920 cái tại `BAI-01` và 300 cái tại `CT-0003`, giá BQ 195.000 ₫, và phiếu tăng 610.000 ₫ được duyệt
- **THEN** giá BQ mới = (1.220 × 195.000 + 610.000) ÷ 1.220 = **195.500 ₫** **AND** tồn tại `CT-0003` vẫn 300 cái **AND** thu hồi từ `CT-0003` sau đó ghi theo 195.500 ₫

#### Scenario: Đúng nửa đồng làm tròn lên
- **WHEN** `GG-CH` Tốt tồn 2 cái giá BQ 100 ₫ và phiếu tăng 1 ₫ được duyệt
- **THEN** giá BQ mới = 201 ÷ 2 = 100,5 → **101 ₫**

#### Scenario: Giảm có nửa đồng
- **WHEN** `GG-CH` Tốt tồn 2 cái giá BQ 100 ₫ và phiếu giảm 1 ₫ được duyệt
- **THEN** giá BQ mới = 199 ÷ 2 = 99,5 → **100 ₫**

#### Scenario: Hàng tính theo kg
- **WHEN** `PL-SAT` Phế liệu tồn 12.850,5 kg giá BQ 7.952 ₫/kg (giá trị 102.187.176 ₫) và phiếu tăng 500.000 ₫ được duyệt
- **THEN** giá BQ mới = 102.687.176 ÷ 12.850,5 = 7.990,91 → **7.991 ₫/kg**

#### Scenario: Tồn đổi giữa lúc lập và lúc duyệt
- **WHEN** phiếu giảm 1.500.000 ₫ cho `GG-K17` Tốt được lập lúc tồn 1.240 cái, rồi nhập thêm 160 cái trước khi duyệt (tồn 1.400 cái, giá BQ 195.300 ₫)
- **THEN** giá BQ mới tính theo lúc duyệt = (1.400 × 195.300 − 1.500.000) ÷ 1.400 = 194.228,57 → **194.229 ₫**

### Requirement: Không điều chỉnh khi hết hàng hoặc giá trị âm
Hệ thống SHALL từ chối dòng có tổng tồn của (mã hàng + tình trạng) bằng 0, cả lúc lưu phiếu và lúc duyệt. Hệ thống SHALL từ chối dòng làm giá trị sau điều chỉnh (tồn × giá BQ + chênh lệch) nhỏ hơn 0. Giá trị sau bằng 0 SHALL được phép (giá BQ mới 0 ₫). Một dòng bị từ chối lúc duyệt SHALL làm cả phiếu không được ghi và phiếu vẫn Chờ duyệt.

#### Scenario: Hết hàng lúc lập
- **WHEN** `PK-KU` Mới đã xuất hết (tồn 0, giá BQ cuối 52.000 ₫) và Kế toán thêm dòng tăng 300.000 ₫
- **THEN** hệ thống từ chối với "PK-KU Mới đã hết hàng, không điều chỉnh giá trị được"

#### Scenario: Hết hàng lúc duyệt
- **WHEN** phiếu tăng 300.000 ₫ cho `GG-M16` Tốt được lập lúc còn 12 cái, rồi bán hết 12 cái trước khi duyệt
- **THEN** duyệt bị từ chối với "GG-M16 Tốt đã hết hàng, không điều chỉnh giá trị được" **AND** phiếu vẫn Chờ duyệt **AND** sổ kho không có dòng nào của phiếu

#### Scenario: Giá trị sau âm
- **WHEN** `GG-K17` Phế liệu tồn 42 cái giá BQ 160.000 ₫ (giá trị 6.720.000 ₫) và phiếu giảm 7.000.000 ₫
- **THEN** hệ thống từ chối với "Giá trị sau điều chỉnh của GG-K17 Phế liệu bị âm (−280.000 ₫)"

#### Scenario: Giảm về đúng 0
- **WHEN** `GG-K17` Phế liệu tồn 42 cái giá BQ 160.000 ₫ và phiếu giảm 6.720.000 ₫ được duyệt
- **THEN** giá BQ mới là **0 ₫** **AND** tồn vẫn 42 cái

### Requirement: Lý do và chứng từ gốc bắt buộc
Phiếu điều chỉnh giá trị SHALL có lý do (không để trống, tối đa 500 ký tự) và mã **chứng từ gốc** bị sửa (VD `PN-2026-094`). Chứng từ gốc SHALL là mã đã có dòng sổ kho (không phải phiếu điều chỉnh giá trị), và mỗi (mã hàng + tình trạng) trên phiếu SHALL có ít nhất một dòng sổ của chứng từ gốc. Màn lập phiếu SHALL hiện cho mỗi dòng: tổng tồn, giá BQ hiện tại, giá trị hiện tại, giá BQ mới dự kiến (tính theo số lúc xem).

#### Scenario: Thiếu chứng từ gốc
- **WHEN** Kế toán lưu phiếu điều chỉnh giá trị không ghi chứng từ gốc
- **THEN** hệ thống từ chối với "Nhập mã chứng từ bị sửa"

#### Scenario: Chứng từ gốc không có trong sổ
- **WHEN** chứng từ gốc ghi `PN-2026-999` chưa từng ghi sổ
- **THEN** hệ thống từ chối với "Không tìm thấy chứng từ PN-2026-999 trong sổ kho"

#### Scenario: Mã hàng không thuộc chứng từ gốc
- **WHEN** chứng từ gốc `PN-2026-094` chỉ có dòng sổ `GG-K17` Mới và `GG-CH` Mới, và phiếu có dòng `GG-K15` Tốt
- **THEN** hệ thống từ chối với "PN-2026-094 không có dòng sổ của GG-K15 Tốt"

#### Scenario: Thiếu lý do
- **WHEN** Kế toán lưu phiếu với lý do chỉ có dấu cách
- **THEN** hệ thống từ chối với "Nhập lý do điều chỉnh"

#### Scenario: Xem trước giá mới
- **WHEN** Kế toán nhập dòng `GG-K17` Tốt giảm 1.500.000 ₫ khi tồn 1.240 cái, giá BQ 195.282 ₫
- **THEN** dòng hiện "Tồn 1.240 cái · Giá BQ 195.282 ₫ · Giá trị 242.149.680 ₫ → Giá BQ mới 194.072 ₫"

### Requirement: Sửa chi phí chuyến của phiếu nhập
Kế toán SHALL lập được phiếu điều chỉnh giá trị từ một phiếu nhập đã ghi sổ bằng cách nhập **tổng chi phí chuyến đúng** (số nguyên ≥ 0). Hệ thống SHALL chia lại **đúng như phiếu gốc** (cách chia của đơn, chia theo tình trạng với giá sắt vụn của phiếu) và sinh mỗi (mã hàng + tình trạng) một dòng: chênh lệch = giá trị theo chi phí đúng − giá trị đã ghi (dòng nhập + các lần sửa chi phí đã ghi sổ). Dòng 0 SHALL bỏ; dòng sinh ra không sửa tay được. Chứng từ gốc là mã phiếu nhập.

#### Scenario: Sửa chi phí chuyến nhập nhầm
- **WHEN** `PN-2026-094` nhập `GG-K17` Mới 200 cái × 185.000 ₫ và `GG-CH` Mới 400 cái × 32.000 ₫, chia theo giá trị, đã ghi chi phí chuyến 35.000.000 ₫ (chia 26.004.016 ₫ và 8.995.984 ₫), và Kế toán nhập chi phí đúng 3.500.000 ₫
- **THEN** chia lại được 2.600.402 ₫ và 899.598 ₫ **AND** phiếu có 2 dòng: `GG-K17` Mới −23.403.614 ₫, `GG-CH` Mới −8.096.386 ₫ **AND** tổng chênh lệch đúng −31.500.000 ₫ **AND** chứng từ gốc là `PN-2026-094`

#### Scenario: Ghi sổ đưa giá về đúng khi hàng còn đủ
- **WHEN** phiếu trên được duyệt khi `GG-K17` Mới còn đủ 200 cái giá BQ 315.020 ₫ và `GG-CH` Mới còn 400 cái giá BQ 54.490 ₫
- **THEN** giá BQ mới `GG-K17` Mới = (63.004.000 − 23.403.614) ÷ 200 = **198.002 ₫** **AND** `GG-CH` Mới = (21.796.000 − 8.096.386) ÷ 400 = **34.249 ₫**

#### Scenario: Hàng của chuyến đã bán một phần
- **WHEN** phiếu trên được duyệt khi `GG-K17` Mới chỉ còn 150 cái (đã bán 50 cái theo 315.020 ₫)
- **THEN** cả −23.403.614 ₫ vào 150 cái còn lại: giá BQ mới = (47.253.000 − 23.403.614) ÷ 150 = 158.995,91 → **158.996 ₫**

#### Scenario: Lô hàng cũ có phế liệu
- **WHEN** phiếu nhập hàng cũ có dòng khung 200 cái tách 150 Tốt / 38 Chờ sửa / 12 Phế liệu, giá sắt vụn lưu trên phiếu 7.500 ₫/kg, và chi phí chuyến được sửa
- **THEN** phần Phế liệu giữ 1.215.000 ₫ như cũ (kg × giá sắt vụn của phiếu) **AND** chênh lệch chỉ chia cho Tốt và Chờ sửa theo số cái

#### Scenario: Sửa lần hai
- **WHEN** `PN-2026-094` đã có `ĐCG-2026-001` (chi phí đúng 3.500.000 ₫) ghi sổ, rồi phát hiện chi phí thật là 3.800.000 ₫
- **THEN** phiếu sửa mới chỉ chứa chênh lệch giữa chia 3.800.000 ₫ và chia 3.500.000 ₫

#### Scenario: Chi phí không đổi
- **WHEN** Kế toán nhập chi phí chuyến đúng bằng chi phí đã ghi
- **THEN** hệ thống từ chối với "Chi phí chuyến không đổi, không có gì để điều chỉnh"

### Requirement: Một phiếu sửa chi phí đang mở cho mỗi phiếu nhập
Một phiếu nhập SHALL có tối đa một phiếu sửa chi phí chưa ghi sổ. Khi dựng lại theo chi phí đang ghi không ra đúng giá trị đã ghi (VD trọng lượng chuẩn hay đơn giá đã đổi sau khi nhập), hệ thống SHALL từ chối và yêu cầu lập dòng tay.

#### Scenario: Không dựng lại được cách chia
- **WHEN** `PN-2026-094` chia theo trọng lượng và trọng lượng chuẩn của `GG-K17` đã sửa trong danh mục sau khi nhập, rồi Kế toán sửa chi phí chuyến
- **THEN** hệ thống từ chối với "Không dựng lại được cách chia của PN-2026-094, lập dòng tay"

#### Scenario: Đã có phiếu sửa đang chờ
- **WHEN** `ĐCG-2026-002` sửa chi phí `PN-2026-094` đang Chờ duyệt và Kế toán lập thêm một phiếu sửa chi phí cho `PN-2026-094`
- **THEN** hệ thống từ chối với "PN-2026-094 đã có phiếu điều chỉnh giá ĐCG-2026-002 chưa ghi sổ"

### Requirement: Lập, gửi duyệt, duyệt, trả lại
Phiếu điều chỉnh giá trị SHALL đi theo trạng thái `DRAFT` (Nháp) → `PENDING_APPROVAL` (Chờ duyệt) → `DONE` (Đã ghi sổ), như phiếu điều chỉnh: chỉ Nháp sửa, xóa được; gửi duyệt cần ít nhất một dòng; Giám đốc trả lại đưa phiếu về Nháp kèm lý do; phiếu `DONE` không sửa, xóa, duyệt lại được; lưu người lập, người duyệt và thời điểm từng bước.

#### Scenario: Chưa duyệt chưa ghi sổ
- **WHEN** Kế toán gửi duyệt `ĐCG-2026-001`
- **THEN** phiếu ở trạng thái Chờ duyệt **AND** sổ kho chưa có dòng nào của phiếu **AND** giá BQ của các mã trên phiếu chưa đổi

#### Scenario: Trả lại để sửa
- **WHEN** Giám đốc trả lại `ĐCG-2026-001` với lý do "Đính kèm hóa đơn nhà xe"
- **THEN** phiếu về Nháp, hiện lý do trả lại **AND** Kế toán sửa và gửi duyệt lại được

### Requirement: Duyệt là ghi sổ
Giám đốc duyệt SHALL ghi mỗi dòng của phiếu thành một dòng sổ `REVALUE` trong cùng transaction với việc chuyển phiếu sang `DONE`, ngày nghiệp vụ là ngày duyệt; SHALL tính giá BQ mới và kiểm tồn, giá trị âm theo số lúc duyệt. Duyệt hai lần SHALL chỉ ghi một bộ dòng.

#### Scenario: Duyệt ghi một dòng mỗi mã
- **WHEN** Giám đốc duyệt `ĐCG-2026-001` ngày 30/10/2026 có 2 dòng
- **THEN** sổ có đúng 2 dòng `REVALUE` ngày 30/10/2026, chứng từ `ĐCG-2026-001`, số lượng 0 **AND** phiếu ở trạng thái Đã ghi sổ

#### Scenario: Duyệt hai lần
- **WHEN** Giám đốc duyệt `ĐCG-2026-001` hai lần (hai tab cùng bấm)
- **THEN** sổ chỉ có một bộ 2 dòng `REVALUE` của phiếu **AND** giá BQ chỉ đổi một lần **AND** lần sau nhận "Phiếu đã được ghi sổ"

#### Scenario: Đối chiếu sau khi duyệt
- **WHEN** chạy `npm run inventory:check` sau khi duyệt `ĐCG-2026-001`
- **THEN** lệnh in "Sổ kho khớp: 0 lệch" và thoát mã 0

### Requirement: Hiện trên trang Phiếu điều chỉnh
Trang `/inventory/adjustments` SHALL liệt kê phiếu điều chỉnh giá trị cùng các phiếu khác, loại "Điều chỉnh giá", lọc theo trạng thái như hiện có. Nút "Lập phiếu" SHALL cho chọn "Điều chỉnh giá trị" (dòng nhập tay) hoặc "Sửa chi phí chuyến" (chọn phiếu nhập). Chi tiết phiếu SHALL hiện chứng từ gốc, mỗi dòng (mã, tình trạng, chênh lệch, giá BQ trước → sau dự kiến hoặc đã ghi), tổng chênh lệch; phiếu sửa chi phí hiện thêm chi phí đã ghi và chi phí đúng; phiếu đã ghi sổ hiện các dòng sổ đã sinh ra.

#### Scenario: Giám đốc mở phiếu chờ duyệt
- **WHEN** Giám đốc mở `ĐCG-2026-001` Chờ duyệt sửa chi phí `PN-2026-094`
- **THEN** thấy "Chi phí chuyến đã ghi 35.000.000 ₫ → đúng 3.500.000 ₫", 2 dòng với giá BQ trước → sau theo số lúc xem, tổng chênh lệch −31.500.000 ₫ **AND** nút "Duyệt và ghi sổ", "Trả lại"

### Requirement: Quyền lập và duyệt phiếu điều chỉnh giá trị
Lập, sửa, xóa, gửi duyệt phiếu điều chỉnh giá trị và dựng dòng từ phiếu nhập SHALL cần quyền `inventory.adjust` (`DIRECTOR`, `ACCOUNTANT`). Duyệt và trả lại SHALL cần `inventory.approve` (chỉ `DIRECTOR`). Xem SHALL cần `inventory.view`. Server SHALL kiểm quyền ở mọi API, trả 403 "Bạn không có quyền thực hiện thao tác này".

#### Scenario: Kinh doanh lập phiếu điều chỉnh giá
- **WHEN** `quocbao` (Kinh doanh) gửi `POST /api/inventory/adjustments` với loại điều chỉnh giá trị
- **THEN** API trả 403 **AND** không có phiếu nào được tạo

#### Scenario: Kế toán tự duyệt
- **WHEN** `thuha` (Kế toán) gửi `POST /api/inventory/adjustments/<id>/approve` cho `ĐCG-2026-001`
- **THEN** API trả 403 **AND** giá BQ không đổi

#### Scenario: Thủ kho dựng dòng từ phiếu nhập
- **WHEN** `vantung` (Thủ kho) gửi yêu cầu dựng dòng sửa chi phí cho `PN-2026-094`
- **THEN** API trả 403
