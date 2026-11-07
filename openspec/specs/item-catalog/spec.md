# item-catalog Specification

## Purpose
Danh mục vật tư dùng chung cho mọi chứng từ: mã hàng, nhóm, đơn vị, trọng lượng chuẩn, giá thuê và giá đền bù mặc định, bộ (kit) để báo giá, và quy tắc quy đổi kg ↔ cái.

## Requirements

### Requirement: Mã hàng do người dùng gõ, không đổi
Mỗi vật tư SHALL có mã duy nhất do người dùng gõ khi tạo: 2–30 ký tự gồm chữ in hoa (có dấu tiếng Việt), số và các dấu nối `,` `*` `+` `-` hoặc một khoảng trắng; không bắt đầu/kết thúc bằng dấu nối, không hai dấu nối liền nhau. Chữ thường tự đổi sang in hoa, khoảng trắng thừa bị bỏ. Mã SHALL không trùng (kể cả chỉ khác dấu, khoảng trắng) với mã vật tư, mã bộ hay mã cũ nào, kể cả đã ngừng dùng, và SHALL không sửa được sau khi tạo.

#### Scenario: Tạo mã hợp lệ
- **WHEN** Kinh doanh tạo vật tư mã `gg-k17`
- **THEN** vật tư được lưu với mã `GG-K17`

#### Scenario: Mã thật của công ty
- **WHEN** Kinh doanh lần lượt tạo vật tư mã `h1,7`, `KU0,5`, `X5*10*3`, `KB+KU34` và `nối  34`
- **THEN** năm vật tư được lưu với mã `H1,7`, `KU0,5`, `X5*10*3`, `KB+KU34` và `NỐI 34`

#### Scenario: Mã sai định dạng
- **WHEN** người dùng gõ mã `,H17` hoặc `H1,,7` hoặc `H1/7` hoặc `GG-K17-`
- **THEN** hệ thống từ chối với "Mã chỉ gồm chữ in hoa, số và các dấu , * + - hoặc khoảng trắng; không bắt đầu, kết thúc hay lặp hai dấu liền nhau"

#### Scenario: Mã quá dài
- **WHEN** người dùng gõ mã 31 ký tự
- **THEN** hệ thống từ chối với "Mã dài từ 2 đến 30 ký tự"

#### Scenario: Mã chỉ khác dấu hoặc khoảng trắng
- **WHEN** đã có vật tư `NỐI 34` và người dùng tạo vật tư mã `NOI34`
- **THEN** hệ thống từ chối với "Mã gần giống mã NỐI 34 đã có" và không tạo vật tư

#### Scenario: Mã trùng mã bộ
- **WHEN** đã có bộ mã `BO-17` và người dùng tạo vật tư mã `BO-17`
- **THEN** hệ thống từ chối với "Mã này đã được dùng" và không tạo vật tư

#### Scenario: Không sửa mã
- **WHEN** gửi yêu cầu sửa vật tư `GG-K17` kèm mã mới `GG-K170`
- **THEN** hệ thống từ chối với "Không đổi được mã hàng sau khi tạo" và mã vẫn là `GG-K17`

### Requirement: Đơn vị và trọng lượng chuẩn
Mỗi vật tư SHALL có một đơn vị: đơn vị **đếm** `Cái`, `Cây`, `Bó`, `Sọt`, `Cuộn`, `Hộp`, `Thùng` (số lượng nguyên) hoặc đơn vị **đo** `Kg`, `Mét`, `Lít` (số lượng tối đa 3 chữ số thập phân). Mọi đơn vị trừ `Kg` SHALL có trọng lượng chuẩn (kg trên một đơn vị) lớn hơn 0, tối đa 3 chữ số thập phân. Vật tư tính theo `Kg` SHALL không có trọng lượng chuẩn. Đơn vị SHALL không đổi được sau khi tạo.

#### Scenario: Khung giàn giáo
- **WHEN** tạo vật tư `GG-K17` đơn vị cái, trọng lượng chuẩn 13,5 kg
- **THEN** vật tư được lưu với trọng lượng chuẩn 13,500 kg/cái

#### Scenario: Thép ống tính theo mét
- **WHEN** tạo vật tư `ONG-49` đơn vị mét, trọng lượng chuẩn 3,56 kg
- **THEN** vật tư được lưu với trọng lượng chuẩn 3,560 kg/m **AND** D9 hiện ĐVT "m" và "3,56 kg/m"

#### Scenario: Sơn tính theo lít
- **WHEN** tạo vật tư `VT-SON` nhóm Vật tư, đơn vị lít, trọng lượng chuẩn 1,3 kg
- **THEN** vật tư được lưu và D9 hiện ĐVT "lít" và "1,3 kg/lít" **AND** nhập 0,5 lít trên chứng từ được nhận

#### Scenario: Ty ren tính theo bó
- **WHEN** tạo vật tư `TY-REN` đơn vị bó, trọng lượng chuẩn 25 kg
- **THEN** vật tư được lưu và D9 hiện ĐVT "bó" và "25 kg/bó"

#### Scenario: Thiếu trọng lượng
- **WHEN** tạo vật tư tính theo cái, theo mét hoặc theo lít với trọng lượng chuẩn 0 hoặc để trống
- **THEN** hệ thống từ chối với "Nhập trọng lượng chuẩn lớn hơn 0 kg"

#### Scenario: Phế liệu tính theo kg
- **WHEN** tạo vật tư `PL-SAT` đơn vị kg
- **THEN** vật tư được lưu không có trọng lượng chuẩn và cột trọng lượng ở D9 hiện "–"

#### Scenario: Số lượng lẻ cho đơn vị đếm
- **WHEN** nhập 2,5 bó `TY-REN` trên một chứng từ
- **THEN** hệ thống từ chối với "Số lượng bó phải là số nguyên"

#### Scenario: Số lượng lẻ cho đơn vị mét
- **WHEN** nhập 12,345 m `ONG-49` trên một chứng từ
- **THEN** số lượng được nhận là 12,345 m

### Requirement: Quy đổi kg và cái
Hệ thống SHALL quy đổi số lượng của vật tư có trọng lượng chuẩn sang kg bằng số lượng × trọng lượng chuẩn (chính xác tới 0,001 kg), và kg sang số lượng ước tính bằng kg ÷ trọng lượng chuẩn: đơn vị đếm làm tròn tới số nguyên gần nhất (0,5 làm tròn lên), đơn vị mét làm tròn tới 0,001 m. Vật tư tính theo kg SHALL không quy đổi. Phế liệu của mã có trọng lượng chuẩn SHALL vẫn đếm theo đơn vị của mã, kg chỉ để hiển thị.

#### Scenario: Cái sang kg
- **WHEN** quy đổi 100 cái `GG-K17` (13,5 kg/cái)
- **THEN** kết quả là 1.350 kg

#### Scenario: Kg sang cái làm tròn
- **WHEN** quy đổi 1.357 kg `GG-K17` (13,5 kg/cái)
- **THEN** kết quả ước tính là 101 cái (100,52 làm tròn)

#### Scenario: Đúng nửa
- **WHEN** quy đổi 20,25 kg `GG-K17` (13,5 kg/cái, ra 1,5 cái)
- **THEN** kết quả ước tính là 2 cái

#### Scenario: Mét sang kg và ngược lại
- **WHEN** quy đổi 120,5 m `ONG-49` (3,56 kg/m) sang kg, rồi quy đổi 100 kg sang mét
- **THEN** kết quả là 428,98 kg **AND** 28,090 m (100 ÷ 3,56 = 28,0898... làm tròn 0,001)

#### Scenario: Số lượng 0
- **WHEN** quy đổi 0 kg hoặc 0 cái
- **THEN** kết quả là 0

#### Scenario: Hiện kg của phế liệu đếm theo cái
- **WHEN** có 12 cái `GG-K17` (13,5 kg/cái) ở tình trạng Phế liệu
- **THEN** số lượng vẫn ghi 12 cái trong mã `GG-K17` **AND** màn hình hiện kèm "162 kg" tính bằng 12 × 13,5

#### Scenario: Hàng tính theo kg
- **WHEN** quy đổi cho vật tư `PL-SAT` (đơn vị kg)
- **THEN** hệ thống báo "Vật tư tính theo kg, không quy đổi"

### Requirement: Giá thuê mặc định theo ngày
Vật tư thuộc **mọi đơn vị** MAY có giá thuê mặc định theo ngày (VND, số nguyên ≥ 0) tính trên **một đơn vị** của mã (1 cái, 1 kg, 1 m, 1 bó...); để trống nghĩa là không cho thuê. Giá tháng SHALL luôn hiện bằng giá ngày × 30, không nhập riêng. Giá SHALL hiện kèm đơn vị khi đơn vị không phải cái. Đổi giá mặc định SHALL không ảnh hưởng hợp đồng đã tạo.

#### Scenario: Hiện giá tháng
- **WHEN** vật tư `GG-K17` có giá thuê 1.200 ₫/ngày
- **THEN** D9 hiện "1.200 ₫" ở cột giá ngày và "36.000 ₫" ở cột giá tháng

#### Scenario: Cho thuê mã tính theo mét
- **WHEN** Kinh doanh đặt cho `ONG-49` (đơn vị mét) giá thuê 150 ₫/ngày
- **THEN** giá được lưu **AND** D9 hiện "150 ₫/m" ở cột giá ngày và "4.500 ₫/m" ở cột giá tháng

#### Scenario: Cho thuê mã tính theo kg
- **WHEN** Kinh doanh đặt cho `PL-TON` (đơn vị kg) giá thuê 40 ₫/ngày
- **THEN** giá được lưu **AND** D9 hiện "40 ₫/kg" và "1.200 ₫/kg"

#### Scenario: Không cho thuê
- **WHEN** vật tư `PL-SAT` đơn vị kg không có giá thuê
- **THEN** D9 hiện "–" và "Không cho thuê" ở cột giá

#### Scenario: Giá bằng 0
- **WHEN** Kinh doanh đặt giá thuê 0 ₫/ngày cho `KU0,5`
- **THEN** giá được lưu là 0 và D9 hiện "0 ₫", khác với "Không cho thuê"

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
Hệ thống SHALL quản lý danh sách nhóm hàng (tên duy nhất, 1–60 ký tự), mỗi nhóm có **phân loại** `Thiết bị` (hàng kinh doanh) hoặc `Vật tư` (nguyên vật liệu, vật tư xưởng), sửa được. Mỗi vật tư SHALL thuộc đúng một nhóm và mang phân loại của nhóm đó. D9 SHALL lọc được vật tư theo phân loại, theo nhóm, và đếm số vật tư mỗi nhóm.

#### Scenario: Lọc theo nhóm
- **WHEN** danh mục có 4 vật tư nhóm Giàn giáo và 2 nhóm Phụ kiện, người dùng chọn nhóm "Phụ kiện"
- **THEN** bảng chỉ còn 2 dòng và URL có `?group=<mã nhóm>`

#### Scenario: Thêm nguyên vật liệu
- **WHEN** Kinh doanh tạo nhóm "Que hàn" phân loại Vật tư, rồi tạo vật tư `QH-2,5` đơn vị hộp, trọng lượng chuẩn 5 kg, nhóm "Que hàn"
- **THEN** vật tư `QH-2,5` được lưu với phân loại Vật tư

#### Scenario: Lọc theo phân loại
- **WHEN** danh mục có 6 vật tư ở các nhóm Thiết bị và 3 vật tư ở nhóm "Que hàn", "Thép ống" (Vật tư), người dùng chọn phân loại "Vật tư"
- **THEN** bảng chỉ còn 3 dòng **AND** URL có `?category=MATERIAL` **AND** ô chọn nhóm chỉ còn "Que hàn", "Thép ống"

#### Scenario: Đổi phân loại nhóm
- **WHEN** Kinh doanh đổi nhóm "Thép ống" từ Thiết bị sang Vật tư
- **THEN** mọi vật tư trong nhóm "Thép ống" hiện phân loại Vật tư mà không cần sửa từng vật tư

#### Scenario: Nhóm có sẵn khi nâng cấp
- **WHEN** chạy migration trên DB đã có nhóm "Giàn giáo" và "Phụ kiện"
- **THEN** hai nhóm có phân loại Thiết bị

#### Scenario: Tên nhóm trùng
- **WHEN** tạo nhóm "giàn giáo" khi đã có "Giàn giáo"
- **THEN** hệ thống từ chối với "Tên nhóm đã có"

### Requirement: Bộ gồm nhiều linh kiện
Bộ (kit) SHALL có mã (cùng quy tắc và cùng không gian mã với vật tư), tên và ít nhất một dòng linh kiện; mỗi dòng là một vật tư **đơn vị đếm** (cái, cây, bó...), đang dùng, số lượng nguyên ≥ 1, không trùng vật tư giữa các dòng. Bộ SHALL không chứa bộ khác. Tổng số linh kiện của một bộ SHALL ≥ 2.

#### Scenario: Bộ giàn giáo 1,7m
- **WHEN** tạo bộ `BO-17` gồm 2 `GG-K17`, 2 `GG-CH`, 1 `GG-M16`
- **THEN** bộ được lưu với 3 dòng linh kiện

#### Scenario: Linh kiện tính theo kg
- **WHEN** tạo bộ có dòng linh kiện `PL-SAT`
- **THEN** hệ thống từ chối với "Bộ chỉ gồm vật tư đếm được (cái, cây, bó...)"

#### Scenario: Linh kiện tính theo mét
- **WHEN** tạo bộ có dòng linh kiện `ONG-49` (đơn vị mét)
- **THEN** hệ thống từ chối với "Bộ chỉ gồm vật tư đếm được (cái, cây, bó...)"

#### Scenario: Linh kiện tính theo cây
- **WHEN** tạo bộ `BO-CAY` gồm 4 `ONG-6M` (đơn vị cây) và 8 `KU0,5`
- **THEN** bộ được lưu với 2 dòng linh kiện

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
Vật tư, bộ và nhóm SHALL ngừng dùng và dùng lại được. Bản ghi đã được tham chiếu (vật tư trong bộ, nhóm có vật tư, vật tư có dòng sổ kho hoặc nằm trong đơn thu mua, và sau này chứng từ khác) SHALL chỉ ngừng dùng, không xóa. Vật tư SHALL không ngừng dùng được khi nằm trong bộ đang dùng, khi **còn tồn** (khác 0 ở bất kỳ tình trạng, vị trí nào, kể cả công trình), hoặc khi nằm trong đơn thu mua đang xử lý (`IN_PROGRESS`). Bản ghi ngừng dùng SHALL không chọn được cho bộ hay chứng từ mới.

#### Scenario: Xóa vật tư chưa dùng
- **WHEN** Kinh doanh xóa vật tư `TEST-01` vừa tạo nhầm, chưa ở bộ nào
- **THEN** vật tư bị xóa hẳn

#### Scenario: Xóa vật tư đang ở trong bộ
- **WHEN** người dùng xóa `GG-CH` đang nằm trong bộ `BO-17`
- **THEN** hệ thống từ chối với "Vật tư đã được dùng nên chỉ ngừng dùng được" và `GG-CH` vẫn còn

#### Scenario: Ngừng dùng vật tư đang trong bộ đang dùng
- **WHEN** người dùng ngừng dùng `GG-CH` trong khi bộ `BO-17` đang dùng
- **THEN** hệ thống từ chối với "Bỏ vật tư này khỏi bộ BO-17 hoặc ngừng dùng bộ trước"

#### Scenario: Ngừng dùng vật tư còn tồn
- **WHEN** người dùng ngừng dùng `OT-06` khi còn 12 cái Tốt tại bãi và 30 cái tại công trình `CT-0003`
- **THEN** hệ thống từ chối với "OT-06 còn tồn 42 cái, chỉ ngừng dùng được khi tồn về 0" **AND** `OT-06` vẫn đang dùng

#### Scenario: Ngừng dùng vật tư đã hết tồn
- **WHEN** `OT-06` đã có dòng sổ kho nhưng tổng tồn ở mọi tình trạng và vị trí là 0
- **THEN** ngừng dùng thành công **AND** thẻ kho của `OT-06` vẫn xem được

#### Scenario: Vật tư ngừng dùng không vào bộ mới
- **WHEN** `KK-01` đã ngừng dùng và người dùng tạo bộ có dòng `KK-01`
- **THEN** hệ thống từ chối với "Vật tư KK-01 đã ngừng dùng"

#### Scenario: Dùng lại
- **WHEN** người dùng chọn "Dùng lại" cho `KK-01`
- **THEN** `KK-01` trở lại trạng thái đang dùng và chọn được ở bộ mới

#### Scenario: Ngừng dùng vật tư trong đơn thu mua đang xử lý
- **WHEN** ngừng dùng `GG-M16` khi đơn `PO-2026-051` còn đang nhận và có dòng `GG-M16`
- **THEN** hệ thống từ chối với "GG-M16 còn trong đơn thu mua đang xử lý: PO-2026-051" **AND** `GG-M16` vẫn đang dùng

#### Scenario: Xóa vật tư đã có trong đơn thu mua
- **WHEN** xóa `TEST-02` chỉ nằm trong một đơn nháp
- **THEN** hệ thống từ chối với "Vật tư đã được dùng nên chỉ ngừng dùng được"

### Requirement: Danh sách vật tư D9
D9 SHALL hiện bảng vật tư gồm: tên kèm mã (và mã cũ nếu có), nhóm, ĐVT, trọng lượng chuẩn, giá thuê/ngày, giá thuê/tháng (ở 1366px thấy đủ hai cột giá, không cuộn ngang; thao tác ở menu cuối dòng); đầu trang đếm số mã hàng và số bộ đang dùng; tìm theo tên, mã hoặc mã cũ (không phân biệt dấu, hoa thường, khoảng trắng); lọc theo phân loại, nhóm và "Đang dùng / Ngừng dùng". Bộ lọc và từ khóa SHALL nằm trên URL.

#### Scenario: Đếm đầu trang
- **WHEN** có 48 vật tư và 6 bộ đang dùng, 2 vật tư đã ngừng dùng
- **THEN** đầu trang hiện "48 mã hàng · 6 bộ"

#### Scenario: Tìm không dấu
- **WHEN** người dùng gõ "khung gian" vào ô tìm
- **THEN** bảng hiện "Khung giàn giáo 1,7m" và "Khung giàn giáo 1,5m" **AND** URL có `?q=khung%20gian`

#### Scenario: Tìm mã có ký tự đặc biệt
- **WHEN** người dùng gõ "noi34" hoặc "kb+ku" vào ô tìm
- **THEN** bảng hiện lần lượt `NỐI 34` và `KB+KU34` **AND** URL mã hóa đúng từ khóa (`?q=kb%2Bku`)

#### Scenario: Đủ cột giá ở 1366px
- **WHEN** Kinh doanh mở D9 trên màn 1366px và đã chọn một vật tư
- **THEN** cột "Giá thuê / ngày" và "Giá thuê / tháng" nằm trọn trong vùng nhìn thấy **AND** khung "Thuộc bộ" hiện dưới bảng

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

### Requirement: Mã cũ của vật tư
Mỗi vật tư MAY có tối đa 5 **mã cũ** (tên gọi khác, cùng luật ký tự với mã chính), dùng để tìm và gõ mã. Mã cũ SHALL không trùng (kể cả chỉ khác dấu, khoảng trắng) với mã vật tư, mã bộ hay mã cũ khác. Khác mã chính, mã cũ SHALL thêm, bỏ được bằng quyền sửa vật tư và mỗi lần đổi được ghi nhật ký. Nhãn QR vẫn in mã chính.

#### Scenario: Thêm mã cũ
- **WHEN** Kinh doanh thêm mã cũ `K1,7` và `KHUNG 1M7` cho vật tư `GG-K17`
- **THEN** vật tư lưu hai mã cũ **AND** nhật ký ghi "Sửa vật tư GG-K17: mã cũ thêm K1,7, KHUNG 1M7"

#### Scenario: Tìm hàng bằng mã cũ ở D9
- **WHEN** `GG-K17` có mã cũ `K1,7` và người dùng gõ "k1,7" vào ô tìm D9
- **THEN** bảng hiện dòng `GG-K17` kèm dòng phụ "Mã cũ: K1,7"

#### Scenario: Tra mã chính trước mã cũ
- **WHEN** gọi API tra vật tư theo mã `K1,7`, không có vật tư nào có mã chính `K1,7` và `GG-K17` có mã cũ `K1,7`
- **THEN** API trả vật tư `GG-K17`

#### Scenario: Mã cũ trùng mã chính của vật tư khác
- **WHEN** đã có vật tư `H1,7` và người dùng thêm mã cũ `H1,7` cho `GG-K17`
- **THEN** hệ thống từ chối với "Mã H1,7 đã là mã của vật tư khác" và `GG-K17` không đổi

#### Scenario: Tạo vật tư trùng mã cũ đã có
- **WHEN** `GG-K17` có mã cũ `K1,7` và người dùng tạo vật tư mới mã `K1,7`
- **THEN** hệ thống từ chối với "Mã K1,7 đang là mã cũ của GG-K17"

#### Scenario: Quá 5 mã cũ
- **WHEN** vật tư đã có 5 mã cũ và người dùng thêm mã thứ 6
- **THEN** hệ thống từ chối với "Mỗi vật tư có tối đa 5 mã cũ"

#### Scenario: Kế toán thử thêm mã cũ
- **WHEN** `thuha` (Kế toán) gửi yêu cầu thêm mã cũ cho `GG-K17`
- **THEN** API trả 403 và `GG-K17` không đổi

### Requirement: Mã ghép và hàng có đầu / không đầu là mã riêng
Mã ghép (VD `KB+KU34`) và hàng có đầu / không đầu (VD `H1,7` và `H1,7KĐ`) SHALL là các vật tư riêng, mỗi mã có tồn, giá vốn, giá thuê riêng. Hệ thống SHALL không tự quy đổi hay liên kết giữa chúng; mã ghép SHALL không phải là bộ.

#### Scenario: Có đầu và không đầu
- **WHEN** Kinh doanh tạo `H1,7` và `H1,7KĐ` cùng đơn vị cái, cùng trọng lượng chuẩn 13,2 kg, giá thuê lần lượt 1.200 ₫ và 1.100 ₫/ngày
- **THEN** hai vật tư được lưu riêng **AND** tìm "h1,7" ở D9 hiện cả hai dòng

#### Scenario: Mã ghép không phải bộ
- **WHEN** Kinh doanh tạo vật tư `KB+KU34` đơn vị cái, trọng lượng chuẩn 4,1 kg
- **THEN** vật tư được lưu như mọi vật tư khác **AND** không xuất hiện ở tab "Bộ"

### Requirement: Đơn giá công sửa / cái
Mỗi mã hàng nhóm Thiết bị SHALL có trường tùy chọn **đơn giá công sửa / cái** (₫, số nguyên ≥ 0), để trống nghĩa là chưa đặt. Trường SHALL hiện trên form và chi tiết vật tư D9 cho người có `repairs.view`; chỉ người có `repairs.manage` (Giám đốc, Kế toán) sửa được. Mã nhóm Vật tư SHALL không có trường này. Sửa đơn giá SHALL ghi nhật ký như sửa danh mục.

#### Scenario: Đặt đơn giá công
- **WHEN** `thuha` (Kế toán) đặt đơn giá công sửa của `GG-K17` là 40.000 ₫
- **THEN** D9 hiện "Công sửa 40.000 ₫ / cái" ở chi tiết `GG-K17`

#### Scenario: Kinh doanh không sửa được đơn giá công
- **WHEN** `quocbao` (Kinh doanh) sửa `GG-K17` và gửi kèm đơn giá công 50.000 ₫
- **THEN** API trả 403 cho trường đơn giá công **AND** đơn giá vẫn 40.000 ₫

#### Scenario: Đơn giá âm
- **WHEN** Kế toán đặt đơn giá công −1.000 ₫
- **THEN** hệ thống từ chối với "Đơn giá công sửa phải là số đồng không âm"
