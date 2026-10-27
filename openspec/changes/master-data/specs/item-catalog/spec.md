# Spec Delta

## Purpose

Danh mục vật tư dùng chung cho mọi chứng từ: mã hàng, nhóm, đơn vị, trọng lượng chuẩn, giá thuê và giá đền bù mặc định, bộ (kit) để báo giá, và quy tắc quy đổi kg ↔ cái.

## ADDED Requirements

### Requirement: Mã hàng do người dùng gõ, không đổi
Mỗi vật tư SHALL có mã duy nhất do người dùng gõ khi tạo: 2–20 ký tự, chữ in hoa không dấu, số và dấu gạch ngang (không ở đầu/cuối, không hai gạch liền nhau). Chữ thường được tự đổi sang in hoa. Mã SHALL không trùng với mã vật tư hay mã bộ nào khác, kể cả đã ngừng dùng, và SHALL không sửa được sau khi tạo (nhãn QR dán ngoài bãi in theo mã).

#### Scenario: Tạo mã hợp lệ
- **WHEN** Kinh doanh tạo vật tư mã `gg-k17`
- **THEN** vật tư được lưu với mã `GG-K17`

#### Scenario: Mã sai định dạng
- **WHEN** người dùng gõ mã `GG K17` hoặc `-GGK17` hoặc `GG--K17`
- **THEN** hệ thống từ chối với "Mã chỉ gồm chữ in hoa không dấu, số và dấu gạch ngang"

#### Scenario: Mã trùng mã bộ
- **WHEN** đã có bộ mã `BO-17` và người dùng tạo vật tư mã `BO-17`
- **THEN** hệ thống từ chối với "Mã này đã được dùng" và không tạo vật tư

#### Scenario: Không sửa mã
- **WHEN** gửi yêu cầu sửa vật tư `GG-K17` kèm mã mới `GG-K170`
- **THEN** hệ thống từ chối với "Không đổi được mã hàng sau khi tạo" và mã vẫn là `GG-K17`

### Requirement: Đơn vị và trọng lượng chuẩn
Mỗi vật tư SHALL có đơn vị `cái` hoặc `kg`. Vật tư tính theo cái SHALL có trọng lượng chuẩn (kg/cái) lớn hơn 0, tối đa 3 chữ số thập phân. Vật tư tính theo kg SHALL không có trọng lượng chuẩn. Đơn vị SHALL không đổi được sau khi tạo.

#### Scenario: Khung giàn giáo
- **WHEN** tạo vật tư `GG-K17` đơn vị cái, trọng lượng chuẩn 13,5 kg
- **THEN** vật tư được lưu với trọng lượng chuẩn 13,500 kg/cái

#### Scenario: Thiếu trọng lượng
- **WHEN** tạo vật tư tính theo cái với trọng lượng chuẩn 0 hoặc để trống
- **THEN** hệ thống từ chối với "Nhập trọng lượng chuẩn lớn hơn 0 kg"

#### Scenario: Phế liệu tính theo kg
- **WHEN** tạo vật tư `PL-SAT` đơn vị kg
- **THEN** vật tư được lưu không có trọng lượng chuẩn và cột trọng lượng ở D9 hiện "–"

### Requirement: Quy đổi kg và cái
Hệ thống SHALL quy đổi số cái sang kg bằng số cái × trọng lượng chuẩn (chính xác tới 0,001 kg), và kg sang số cái ước tính bằng kg ÷ trọng lượng chuẩn làm tròn tới số nguyên gần nhất (0,5 làm tròn lên). Vật tư tính theo kg SHALL không quy đổi. Phế liệu của mã tính theo cái SHALL vẫn đếm theo cái, kg chỉ để hiển thị.

#### Scenario: Cái sang kg
- **WHEN** quy đổi 100 cái `GG-K17` (13,5 kg/cái)
- **THEN** kết quả là 1.350 kg

#### Scenario: Kg sang cái làm tròn
- **WHEN** quy đổi 1.357 kg `GG-K17` (13,5 kg/cái)
- **THEN** kết quả ước tính là 101 cái (100,52 làm tròn)

#### Scenario: Đúng nửa
- **WHEN** quy đổi 20,25 kg `GG-K17` (13,5 kg/cái, ra 1,5 cái)
- **THEN** kết quả ước tính là 2 cái

#### Scenario: Số lượng 0
- **WHEN** quy đổi 0 kg hoặc 0 cái
- **THEN** kết quả là 0

#### Scenario: Hiện kg của phế liệu đếm theo cái
- **WHEN** có 12 cái `GG-K17` (13,5 kg/cái) ở tình trạng Phế liệu
- **THEN** số lượng vẫn ghi 12 cái trong mã `GG-K17` **AND** màn hình hiện kèm "162 kg" tính bằng 12 × 13,5

#### Scenario: Hàng tính theo kg
- **WHEN** quy đổi cho vật tư `PL-SAT` (đơn vị kg)
- **THEN** hệ thống báo "Vật tư tính theo kg, không quy đổi sang cái"

### Requirement: Giá thuê mặc định theo ngày
Vật tư tính theo cái MAY có giá thuê mặc định theo ngày (VND, số nguyên ≥ 0); để trống nghĩa là không cho thuê. Giá tháng SHALL luôn hiện bằng giá ngày × 30, không nhập riêng. Vật tư tính theo kg SHALL không có giá thuê. Đổi giá mặc định SHALL không ảnh hưởng hợp đồng đã tạo.

#### Scenario: Hiện giá tháng
- **WHEN** vật tư `GG-K17` có giá thuê 1.200 ₫/ngày
- **THEN** D9 hiện "1.200 ₫" ở cột giá ngày và "36.000 ₫" ở cột giá tháng

#### Scenario: Không cho thuê
- **WHEN** vật tư `PL-SAT` đơn vị kg
- **THEN** D9 hiện "–" và "Không cho thuê" ở cột giá

#### Scenario: Giá có số lẻ
- **WHEN** người dùng nhập giá thuê "1.200,5"
- **THEN** hệ thống từ chối theo quy tắc tiền là số nguyên VND

### Requirement: Giá đền bù mặc định
Mỗi vật tư MAY có hai giá đền bù mặc định (VND, số nguyên ≥ 0): **mất** và **hỏng, sửa được**, tính trên mỗi đơn vị. Hợp đồng SHALL lấy hai giá này làm gợi ý khi lập bảng giá đền bù; giá trong hợp đồng mới là giá áp dụng.

#### Scenario: Khai báo giá đền bù
- **WHEN** Kinh doanh đặt cho `GG-K17` giá mất 350.000 ₫ và giá hỏng sửa được 60.000 ₫
- **THEN** vật tư lưu hai giá này và trả về chúng khi đọc danh mục

#### Scenario: Để trống
- **WHEN** vật tư không có giá đền bù mặc định
- **THEN** vật tư vẫn lưu được; hợp đồng sau này phải tự nhập giá

### Requirement: Nhóm hàng
Hệ thống SHALL quản lý danh sách nhóm hàng (tên duy nhất, 1–60 ký tự). Mỗi vật tư SHALL thuộc đúng một nhóm. D9 SHALL lọc được vật tư theo nhóm và đếm số vật tư mỗi nhóm.

#### Scenario: Lọc theo nhóm
- **WHEN** danh mục có 4 vật tư nhóm Giàn giáo và 2 nhóm Phụ kiện, người dùng chọn nhóm "Phụ kiện"
- **THEN** bảng chỉ còn 2 dòng và URL có `?group=<mã nhóm>`

#### Scenario: Tên nhóm trùng
- **WHEN** tạo nhóm "giàn giáo" khi đã có "Giàn giáo"
- **THEN** hệ thống từ chối với "Tên nhóm đã có"

### Requirement: Bộ gồm nhiều linh kiện
Bộ (kit) SHALL có mã (cùng quy tắc và cùng không gian mã với vật tư), tên và ít nhất một dòng linh kiện; mỗi dòng là một vật tư tính theo cái, đang dùng, số lượng nguyên ≥ 1, không trùng vật tư giữa các dòng. Bộ SHALL không chứa bộ khác. Tổng số linh kiện của một bộ SHALL ≥ 2.

#### Scenario: Bộ giàn giáo 1,7m
- **WHEN** tạo bộ `BO-17` gồm 2 `GG-K17`, 2 `GG-CH`, 1 `GG-M16`
- **THEN** bộ được lưu với 3 dòng linh kiện

#### Scenario: Linh kiện tính theo kg
- **WHEN** tạo bộ có dòng linh kiện `PL-SAT`
- **THEN** hệ thống từ chối với "Bộ chỉ gồm vật tư tính theo cái"

#### Scenario: Bộ chỉ có 1 cái
- **WHEN** tạo bộ chỉ có 1 dòng `GG-K17` số lượng 1
- **THEN** hệ thống từ chối với "Bộ phải có ít nhất 2 linh kiện"

#### Scenario: Trùng dòng
- **WHEN** tạo bộ có hai dòng cùng `GG-CH`
- **THEN** hệ thống từ chối với "Mỗi vật tư chỉ một dòng trong bộ"

### Requirement: Trọng lượng và giá thuê của bộ tính từ linh kiện
Trọng lượng 1 bộ và giá thuê 1 bộ/ngày SHALL được tính mỗi lần đọc bằng tổng (số lượng × trọng lượng chuẩn) và tổng (số lượng × giá thuê ngày) của linh kiện, không lưu riêng. Nếu một linh kiện không cho thuê, giá thuê của bộ SHALL hiện "Không cho thuê".

#### Scenario: Bộ giàn giáo 1,7m
- **WHEN** `GG-K17` 13,5 kg, 1.200 ₫/ngày; `GG-CH` 2,8 kg, 300 ₫/ngày; `GG-M16` 11,0 kg, 900 ₫/ngày; bộ `BO-17` = 2 `GG-K17` + 2 `GG-CH` + 1 `GG-M16`
- **THEN** trọng lượng 1 bộ là 43,6 kg và giá thuê 1 bộ là 3.900 ₫/ngày

#### Scenario: Đổi giá linh kiện
- **WHEN** giá thuê `GG-CH` đổi từ 300 ₫ lên 350 ₫/ngày
- **THEN** giá thuê 1 bộ `BO-17` hiện 4.000 ₫/ngày mà không cần sửa bộ

#### Scenario: Linh kiện không cho thuê
- **WHEN** một linh kiện của bộ chưa có giá thuê
- **THEN** giá thuê của bộ hiện "Không cho thuê"

### Requirement: Xem vật tư thuộc bộ nào
Khi chọn một vật tư ở D9, hệ thống SHALL hiện các bộ có chứa vật tư đó, kèm thành phần, trọng lượng và giá thuê 1 bộ.

#### Scenario: Chọn khung 1,7m
- **WHEN** người dùng chọn dòng `GG-K17` ở D9
- **THEN** khung "Thuộc bộ" hiện "Bộ giàn giáo 1,7m" với ×2 Khung giàn giáo 1,7m, ×2 Chéo giàn giáo, ×1 Mâm giàn giáo 1,6m, 43,6 kg, 3.900 ₫/ngày

### Requirement: Ngừng dùng và xóa vật tư, bộ
Vật tư, bộ và nhóm SHALL ngừng dùng được và dùng lại được. Bản ghi đang được tham chiếu (vật tư trong bộ, nhóm có vật tư, và sau này là chứng từ) SHALL không xóa được, chỉ ngừng dùng. Vật tư đang nằm trong một bộ đang dùng SHALL không ngừng dùng được. Bản ghi ngừng dùng SHALL không chọn được cho bộ hay chứng từ mới.

#### Scenario: Xóa vật tư chưa dùng
- **WHEN** Kinh doanh xóa vật tư `TEST-01` vừa tạo nhầm, chưa ở bộ nào
- **THEN** vật tư bị xóa hẳn

#### Scenario: Xóa vật tư đang ở trong bộ
- **WHEN** người dùng xóa `GG-CH` đang nằm trong bộ `BO-17`
- **THEN** hệ thống từ chối với "Vật tư đã được dùng nên chỉ ngừng dùng được" và `GG-CH` vẫn còn

#### Scenario: Ngừng dùng vật tư đang trong bộ đang dùng
- **WHEN** người dùng ngừng dùng `GG-CH` trong khi bộ `BO-17` đang dùng
- **THEN** hệ thống từ chối với "Bỏ vật tư này khỏi bộ BO-17 hoặc ngừng dùng bộ trước"

#### Scenario: Vật tư ngừng dùng không vào bộ mới
- **WHEN** `KK-01` đã ngừng dùng và người dùng tạo bộ có dòng `KK-01`
- **THEN** hệ thống từ chối với "Vật tư KK-01 đã ngừng dùng"

#### Scenario: Dùng lại
- **WHEN** người dùng chọn "Dùng lại" cho `KK-01`
- **THEN** `KK-01` trở lại trạng thái đang dùng và chọn được ở bộ mới

### Requirement: Danh sách vật tư D9
D9 SHALL hiện bảng vật tư gồm: tên kèm mã, nhóm, ĐVT, trọng lượng chuẩn, giá thuê/ngày, giá thuê/tháng; đầu trang đếm số mã hàng và số bộ đang dùng; tìm theo tên hoặc mã (không phân biệt dấu, hoa thường); lọc theo nhóm và theo "Đang dùng / Ngừng dùng". Bộ lọc và từ khóa SHALL nằm trên URL.

#### Scenario: Đếm đầu trang
- **WHEN** có 48 vật tư và 6 bộ đang dùng, 2 vật tư đã ngừng dùng
- **THEN** đầu trang hiện "48 mã hàng · 6 bộ"

#### Scenario: Tìm không dấu
- **WHEN** người dùng gõ "khung gian" vào ô tìm
- **THEN** bảng hiện "Khung giàn giáo 1,7m" và "Khung giàn giáo 1,5m" **AND** URL có `?q=khung%20gian`

#### Scenario: Ngừng dùng mặc định ẩn
- **WHEN** mở D9 không có bộ lọc trạng thái
- **THEN** bảng chỉ hiện vật tư đang dùng

### Requirement: Quyền sửa danh mục vật tư
Tạo, sửa, ngừng dùng, dùng lại, xóa vật tư, bộ, nhóm SHALL chỉ dành cho `DIRECTOR` và `SALES`. Mọi vai trò SHALL đọc được danh mục qua API. Trang D9 mở được cho Giám đốc, Kế toán, Kinh doanh; Kế toán chỉ xem, không thấy nút thêm hay sửa.

#### Scenario: Kế toán thử tạo vật tư
- **WHEN** `thuha` (Kế toán) gửi `POST /api/catalog/items`
- **THEN** API trả 403 "Bạn không có quyền thực hiện thao tác này" và không tạo gì

#### Scenario: Thủ kho đọc danh mục
- **WHEN** `vantung` (Thủ kho) gọi `GET /api/catalog/items`
- **THEN** API trả danh sách vật tư đang dùng

#### Scenario: Kế toán xem D9
- **WHEN** `thuha` mở `/catalog/items`
- **THEN** trang hiện bảng vật tư, không có nút "Thêm vật tư" hay "Sửa bộ"
