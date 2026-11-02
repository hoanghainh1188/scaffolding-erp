# ui-components Specification

## Purpose

Bộ component nền dùng lại ở mọi màn hình: badge tình trạng hàng, trạng thái chứng từ, vị trí; stepper số lượng cho mobile; bảng dữ liệu cho desktop; ô chia số lượng theo tình trạng. Màu, chữ, bo góc lấy từ token Bright Blue Base (`docs/design-system/tokens.json`).

## Requirements

### Requirement: Badge tình trạng hàng
Hệ thống SHALL hiển thị tình trạng hàng bằng badge có chữ tiếng Việt và token màu cố định: `NEW` "Mới" (`highlight`), `GOOD` "Tốt" (`success`), `NEEDS_REPAIR` "Chờ sửa" (`warning`), `SCRAP` "Phế liệu" (`muted`). Chữ và nền SHALL đạt độ tương phản tối thiểu 4.5:1. Badge luôn có chữ; màu không là cách duy nhất để báo tình trạng.

#### Scenario: Hiện badge Chờ sửa
- **WHEN** một dòng hàng có tình trạng `NEEDS_REPAIR`
- **THEN** badge hiện chữ "Chờ sửa" dùng token `warning`

#### Scenario: Đủ 4 tình trạng
- **WHEN** hiển thị lần lượt `NEW`, `GOOD`, `NEEDS_REPAIR`, `SCRAP`
- **THEN** 4 badge dùng lần lượt token `highlight`, `success`, `warning`, `muted`, chữ lần lượt "Mới", "Tốt", "Chờ sửa", "Phế liệu"

### Requirement: Badge trạng thái chứng từ
Hệ thống SHALL hiển thị trạng thái chứng từ bằng badge: `DRAFT` "Nháp" (`muted`), `PENDING_APPROVAL` "Chờ duyệt" (`warning`), `IN_PROGRESS` "Đang xử lý" (`primary`), `DONE` "Hoàn thành" (`success`), `OVERDUE` "Quá hạn" (`destructive`). `OVERDUE` là trạng thái tính ra từ ngày đến hạn để hiển thị, không phải giá trị lưu trong DB.

#### Scenario: Hợp đồng chờ duyệt
- **WHEN** một hợp đồng có trạng thái `PENDING_APPROVAL`
- **THEN** badge hiện chữ "Chờ duyệt" dùng token `warning`

#### Scenario: Hiển thị Quá hạn
- **WHEN** màn hình truyền trạng thái hiển thị `OVERDUE` cho một khoản nợ
- **THEN** badge hiện chữ "Quá hạn" dùng token `destructive`

### Requirement: Badge vị trí
Hệ thống SHALL hiển thị loại vị trí bằng badge: `YARD` "Tại bãi", `WORKSHOP` "Tại xưởng", `SITE` "Tại công trình".

#### Scenario: Hàng đang ở công trình
- **WHEN** vị trí có loại `SITE`
- **THEN** badge hiện chữ "Tại công trình"

### Requirement: Stepper số lượng cho mobile
Stepper SHALL có nút "−" và "+" với vùng bấm tối thiểu 48×48px, ô số ở giữa gõ trực tiếp được. Mỗi lần bấm tăng hoặc giảm đúng một bước (mặc định 1). Giá trị SHALL không nhỏ hơn giá trị tối thiểu (mặc định 0) và không lớn hơn giá trị tối đa nếu có. Stepper SHALL nhận đơn vị số lượng và tuân theo quy tắc số lẻ của đơn vị đó.

#### Scenario: Bấm tăng
- **WHEN** stepper đang là 12 và thủ kho bấm "+"
- **THEN** giá trị thành 13

#### Scenario: Không xuống dưới 0
- **WHEN** stepper đang là 0
- **THEN** nút "−" bị vô hiệu hóa và giá trị vẫn là 0

#### Scenario: Chạm giới hạn trên
- **WHEN** stepper có giá trị tối đa 100 và đang là 100
- **THEN** nút "+" bị vô hiệu hóa

#### Scenario: Gõ số vượt giới hạn
- **WHEN** stepper có giá trị tối đa 100 và thủ kho gõ 150 rồi rời ô
- **THEN** giá trị được đưa về 100

#### Scenario: Gõ chữ không phải số
- **WHEN** thủ kho gõ "abc" rồi rời ô
- **THEN** giá trị trở về số hợp lệ gần nhất trước đó

#### Scenario: Gõ số lẻ khi đơn vị là cái
- **WHEN** stepper có đơn vị cái, đang là 12, thủ kho gõ "12,5" rồi rời ô
- **THEN** giá trị trở về 12 và ô hiện lời nhắc "Số lượng cái phải là số nguyên"

#### Scenario: Gõ số lẻ khi đơn vị là kg
- **WHEN** stepper có đơn vị kg và thủ kho gõ "250,5" rồi rời ô
- **THEN** giá trị là 250,5

### Requirement: Ô nhập số không hiện dấu ngăn cách khi đang sửa
Ô nhập số (tiền, số lượng) trong Stepper và Condition Split SHALL hiện giá trị ở dạng hiển thị (có dấu chấm ngăn cách hàng nghìn) khi không được chọn, và ở dạng sửa (không có dấu ngăn cách hàng nghìn) khi đang được chọn để gõ.

#### Scenario: Chọn ô để sửa
- **WHEN** ô số lượng có giá trị 1500 cái và người dùng bấm vào ô
- **THEN** ô hiện "1500"
- **AND** khi rời ô thì ô hiện "1.500"

### Requirement: Bảng dữ liệu cho desktop
Bảng dữ liệu SHALL có tiêu đề cột dính ở đầu khi cuộn, sắp xếp theo cột khi bấm tiêu đề (tăng → giảm → bỏ sắp xếp), và phân trang với cỡ trang mặc định 20 dòng. Cột số SHALL căn phải.

#### Scenario: Phân trang
- **WHEN** bảng có 45 dòng dữ liệu
- **THEN** trang 1 hiện dòng 1–20, có 3 trang, thanh phân trang ghi "1–20 / 45"

#### Scenario: Sắp xếp theo cột
- **WHEN** người dùng bấm tiêu đề cột "Số lượng" một lần
- **THEN** các dòng được sắp xếp theo số lượng tăng dần
- **AND** bấm lần hai thì giảm dần, bấm lần ba thì trở về thứ tự ban đầu

### Requirement: Bảng cuộn ngang trong khung của nó
Khi các cột không đủ chỗ, bảng dữ liệu SHALL cuộn ngang bên trong khung bảng, trang không cuộn ngang. Cột đầu tiên SHALL dính bên trái khi cuộn ngang; ô tiêu đề của cột đầu dính cả khi cuộn dọc lẫn cuộn ngang.

#### Scenario: Bảng 10 cột ở 1024px
- **WHEN** bảng có 10 cột, tổng bề rộng 1400px, hiển thị ở cửa sổ 1024px
- **THEN** khung bảng có thanh cuộn ngang, trang không có thanh cuộn ngang
- **AND** khi cuộn ngang trong bảng, cột đầu tiên vẫn nằm yên bên trái

### Requirement: Cột ẩn theo cỡ màn hình
Màn hình dùng bảng SHALL khai báo được một cột chỉ hiện từ một mốc bề rộng trở lên: 768px, 1024px hoặc 1280px. Dưới mốc đó cột bị ẩn. Cột đầu tiên luôn hiện.

#### Scenario: Ẩn cột Ghi chú dưới 1280px
- **WHEN** cột "Ghi chú" được khai báo chỉ hiện từ 1280px và bảng hiển thị ở cửa sổ 1024px
- **THEN** bảng không hiện cột "Ghi chú"
- **AND** ở cửa sổ 1366px thì cột "Ghi chú" hiện

### Requirement: Trạng thái rỗng của bảng do màn hình cung cấp
Màn hình dùng bảng dữ liệu SHALL truyền nội dung trạng thái rỗng gồm một câu mời và tối đa một nút hành động. Khi bảng không có dòng nào, bảng SHALL hiện nội dung đó ở giữa vùng bảng và không hiện thanh phân trang. Bảng SHALL không có chữ mặc định kiểu "Không có dữ liệu".

#### Scenario: Bảng đơn thu mua rỗng
- **WHEN** bảng được truyền câu mời "Chưa có đơn thu mua nào" và nút "Tạo đơn", và không có dòng nào
- **THEN** bảng hiện câu "Chưa có đơn thu mua nào" và nút "Tạo đơn"
- **AND** không hiện thanh phân trang

#### Scenario: Bấm nút ở trạng thái rỗng
- **WHEN** người dùng bấm nút "Tạo đơn" ở trạng thái rỗng
- **THEN** hành động mà màn hình gắn cho nút được thực hiện

#### Scenario: Trạng thái rỗng không có nút
- **WHEN** bảng chỉ được truyền câu mời "Chưa có phiếu nhập nào hôm nay", không có nút, và không có dòng nào
- **THEN** bảng hiện câu mời và không hiện nút nào

### Requirement: Chia số lượng theo tình trạng (Condition Split)
Condition Split SHALL nhận tổng số lượng kèm đơn vị và cho nhập các phần Tốt, Chờ sửa, Phế liệu; khi bật tùy chọn thu hồi thì thêm phần Mất. Component SHALL hiện số còn lại chưa chia (tổng − các phần) và báo lệch khi tổng các phần khác tổng số lượng. Mọi phần dùng cùng đơn vị với tổng và tuân theo quy tắc số lẻ của đơn vị đó.

#### Scenario: Chia khớp khi thu hồi
- **WHEN** tổng là 100 cái, bật phần Mất, nhập Tốt 80, Chờ sửa 15, Phế liệu 3, Mất 2
- **THEN** số còn lại là 0 và component báo đã khớp

#### Scenario: Chia thiếu
- **WHEN** tổng là 100 cái, nhập Tốt 80, Chờ sửa 15, Phế liệu 0
- **THEN** số còn lại là 5 và component hiện cảnh báo "Còn 5 chưa phân loại"

#### Scenario: Chia vượt
- **WHEN** tổng là 100 cái, nhập Tốt 90, Chờ sửa 15, Phế liệu 0
- **THEN** component hiện cảnh báo "Vượt 5 so với tổng"

#### Scenario: Tổng bằng 0
- **WHEN** tổng là 0 và mọi phần là 0
- **THEN** số còn lại là 0 và component báo đã khớp

#### Scenario: Số lẻ theo kg
- **WHEN** tổng là 250,5 kg, nhập Tốt 200, Chờ sửa 50, Phế liệu 0,5
- **THEN** số còn lại là 0 và component báo đã khớp

#### Scenario: Số lẻ khi đơn vị là cái
- **WHEN** tổng là 100 cái và thủ kho gõ phần Tốt là "79,5"
- **THEN** ô Tốt báo "Số lượng cái phải là số nguyên" và không tính giá trị đó vào tổng đã chia

#### Scenario: Nhập từ PO thì không có phần Mất
- **WHEN** Condition Split không bật tùy chọn thu hồi
- **THEN** chỉ hiện 3 phần Tốt, Chờ sửa, Phế liệu

### Requirement: Component dùng được bằng bàn phím
Mọi component tương tác (stepper, tiêu đề cột sắp xếp, nút phân trang, nút ở trạng thái rỗng, ô nhập Condition Split, mục menu) SHALL dùng được bằng bàn phím và có viền focus token `ring` 2px nhìn thấy rõ.

#### Scenario: Sắp xếp bằng bàn phím
- **WHEN** người dùng dùng phím Tab tới tiêu đề cột "Số lượng" và bấm Enter
- **THEN** bảng sắp xếp theo số lượng tăng dần và tiêu đề cột có viền focus nhìn thấy được

### Requirement: Tự nhiên hóa Microcopy và Thông báo Người dùng
Mọi thông báo xác thực (validation), đối thoại cảnh báo bất thường (anomaly dialogs), hướng dẫn nhập liệu và nhãn thao tác trong hệ thống SHALL sử dụng tiếng Việt tự nhiên, có cấu trúc ngữ pháp rõ ràng (chủ ngữ, vị ngữ, bổ ngữ), nêu rõ nguyên nhân và cách thức xử lý thay vì dùng các câu cộc lốc hoặc dịch máy.

#### Scenario: Cảnh báo nhập dư số lượng hàng
- **WHEN** thủ kho nhập số lượng nhận vượt quá số lượng còn lại trên đơn mua hàng
- **THEN** hệ thống hiển thị cảnh báo với nội dung dạng: *"Số lượng nhận ({received}) vượt quá số lượng còn lại trên đơn ({remaining}). Bạn có chắc chắn muốn nhập không?"*

#### Scenario: Cảnh báo chi phí chuyến xe vượt dự kiến
- **WHEN** thủ kho hoặc kế toán ghi nhận chi phí chuyến vượt quá tổng chi phí dự kiến cả đơn
- **THEN** hệ thống hiển thị cảnh báo với nội dung dạng: *"Chi phí chuyến này ({tripCost}) vượt quá tổng chi phí dự kiến cả đơn ({poCost}). Bạn có muốn tiếp tục ghi nhận không?"*

#### Scenario: Hướng dẫn cân khối lượng hàng tính theo kg
- **WHEN** thủ kho nhập hàng đối với các mã vật tư quản lý theo kg nhưng chưa điền số liệu cân
- **THEN** hệ thống hiển thị thông báo hướng dẫn: *"Vui lòng nhập khối lượng cân thực tế (kg)"*
