# sites-and-locations Specification

## Purpose
Nơi hàng nằm: bãi, xưởng và công trình. Mỗi công trình thuộc một nhà thầu và có một vị trí kho đi kèm để Sổ kho ghi hàng đang ở công trình.

## Requirements

### Requirement: Vị trí kho có ba loại
Hệ thống SHALL quản lý vị trí kho (`location`) với loại `YARD` (bãi), `WORKSHOP` (xưởng) hoặc `SITE` (công trình), mã duy nhất và tên. Khi cài đặt, hệ thống SHALL có sẵn 1 bãi (`BAI-01`, "Bãi chính") và 1 xưởng (`XUONG-01`, "Xưởng"). Giám đốc SHALL thêm được bãi hoặc xưởng (mã theo quy tắc mã hàng); vị trí `SITE` chỉ được tạo cùng công trình.

#### Scenario: Cài đặt mới
- **WHEN** chạy migration trên DB trống
- **THEN** có đúng 2 vị trí: `BAI-01` loại `YARD` và `XUONG-01` loại `WORKSHOP`

#### Scenario: Thêm bãi thứ hai
- **WHEN** Giám đốc thêm vị trí mã `BAI-02`, tên "Bãi Hoài Đức", loại bãi
- **THEN** vị trí được lưu loại `YARD`

#### Scenario: Không tạo SITE bằng tay
- **WHEN** gửi yêu cầu tạo vị trí loại `SITE`
- **THEN** hệ thống từ chối với "Vị trí công trình được tạo khi thêm công trình"

#### Scenario: Kinh doanh thử thêm bãi
- **WHEN** `quocbao` (Kinh doanh) gửi `POST /api/catalog/locations`
- **THEN** API trả 403 và không tạo gì

### Requirement: Luôn còn ít nhất một bãi
Hệ thống SHALL không cho ngừng dùng hay xóa bãi đang dùng cuối cùng, vì hàng nhập và hàng thu hồi về bãi.

#### Scenario: Ngừng dùng bãi duy nhất
- **WHEN** Giám đốc ngừng dùng `BAI-01` khi đó là bãi đang dùng duy nhất
- **THEN** hệ thống từ chối với "Phải còn ít nhất một bãi đang dùng"

### Requirement: Công trình thuộc một nhà thầu
Công trình SHALL có mã tự sinh `CT-0001`..., tên (bắt buộc), địa chỉ, và đúng **một nhà thầu** đang dùng. Nhà thầu của công trình SHALL không đổi được sau khi tạo (1 hợp đồng = 1 công trình; công trình của chủ khác thì tạo công trình mới).

#### Scenario: Tạo công trình
- **WHEN** Kinh doanh tạo công trình "Chung cư An Phú – Block B", địa chỉ "Hoài Đức, Hà Nội", nhà thầu `NT-0001`
- **THEN** công trình được lưu với mã `CT-0001` và nhà thầu `NT-0001`

#### Scenario: Nhà thầu đã ngừng dùng
- **WHEN** tạo công trình cho nhà thầu đã ngừng dùng
- **THEN** hệ thống từ chối với "Nhà thầu này đã ngừng dùng"

#### Scenario: Đổi nhà thầu
- **WHEN** gửi yêu cầu sửa công trình `CT-0001` sang nhà thầu `NT-0002`
- **THEN** hệ thống từ chối với "Không đổi được nhà thầu của công trình" và công trình vẫn thuộc `NT-0001`

### Requirement: Vị trí công trình tạo tự động
Tạo công trình SHALL tạo cùng lúc (cùng một transaction) một vị trí loại `SITE` có mã bằng mã công trình và tên bằng tên công trình. Sửa tên công trình SHALL đổi tên vị trí theo. Ngừng dùng, dùng lại, xóa công trình SHALL áp dụng cho vị trí đi kèm.

#### Scenario: Có vị trí đi kèm
- **WHEN** tạo công trình `CT-0001` "Chung cư An Phú – Block B"
- **THEN** có vị trí `CT-0001` loại `SITE`, tên "Chung cư An Phú – Block B", gắn với công trình đó

#### Scenario: Lỗi giữa chừng không để lại rác
- **WHEN** việc tạo vị trí đi kèm thất bại
- **THEN** công trình cũng không được tạo

#### Scenario: Đổi tên
- **WHEN** đổi tên `CT-0001` thành "An Phú – Block B (giai đoạn 2)"
- **THEN** vị trí `CT-0001` cũng mang tên mới

### Requirement: Ngừng dùng và xóa công trình, vị trí
Công trình và bãi/xưởng SHALL ngừng dùng và dùng lại được. Công trình hoặc vị trí đã được tham chiếu (sau này là sổ kho, hợp đồng) SHALL không xóa được, chỉ ngừng dùng. Dùng lại công trình của nhà thầu đã ngừng dùng SHALL bị từ chối.

#### Scenario: Xóa công trình tạo nhầm
- **WHEN** xóa `CT-0009` chưa có hợp đồng hay giao dịch kho
- **THEN** công trình và vị trí đi kèm bị xóa hẳn

#### Scenario: Dùng lại công trình của nhà thầu ngừng dùng
- **WHEN** dùng lại công trình `CT-0004` trong khi nhà thầu của nó đã ngừng dùng
- **THEN** hệ thống từ chối với "Dùng lại nhà thầu của công trình này trước"

### Requirement: Tab Công trình và Kho, bãi, xưởng ở D16
D16 SHALL có tab Công trình (tên, mã, địa chỉ, nhà thầu) và tab Kho, bãi, xưởng (mã, tên, loại), mỗi tab kèm số lượng đang dùng. Chi tiết nhà thầu SHALL có nút "Thêm công trình" tạo công trình cho chính nhà thầu đó.

#### Scenario: Thêm công trình từ nhà thầu
- **WHEN** Kinh doanh đang xem `NT-0001` và bấm "Thêm công trình"
- **THEN** form công trình mở với nhà thầu đã chọn sẵn `NT-0001`, không đổi được

#### Scenario: Đếm tab
- **WHEN** có 9 công trình đang dùng, 1 đã ngừng dùng, và 1 bãi + 1 xưởng
- **THEN** tab hiện "Công trình · 9" và "Kho, bãi, xưởng · 2"

### Requirement: Quyền sửa công trình và vị trí
Tạo, sửa, ngừng dùng, dùng lại, xóa công trình SHALL dành cho `DIRECTOR`, `SALES`, `ACCOUNTANT`. Tạo, sửa, ngừng dùng, dùng lại, xóa bãi và xưởng SHALL chỉ dành cho `DIRECTOR`. Mọi vai trò SHALL đọc được công trình và vị trí qua API.

#### Scenario: Xưởng thử tạo công trình
- **WHEN** `hoangnam` (Xưởng) gửi `POST /api/catalog/sites`
- **THEN** API trả 403 và không có công trình hay vị trí nào được tạo

#### Scenario: Kế toán thử ngừng dùng xưởng
- **WHEN** `thuha` (Kế toán) gửi yêu cầu ngừng dùng `XUONG-01`
- **THEN** API trả 403 và `XUONG-01` vẫn đang dùng
