## MODIFIED Requirements

### Requirement: Nội dung mã QR
Mã QR dán trên hàng SHALL chứa đúng mã hàng chính (VD `GG-K17`, `KB+KU34`, `NỐI 34`). Khi đọc, hệ thống SHALL bỏ khoảng trắng hai đầu, không phân biệt hoa thường, và chấp nhận thêm dạng đường dẫn có tham số `code` (VD `https://kho.example.vn/m/scan?code=GG-K17`). Nội dung không ra mã hàng hợp lệ SHALL báo "Mã QR này không phải mã hàng".

#### Scenario: Mã hàng trần
- **WHEN** quét mã QR có nội dung ` gg-k17 `
- **THEN** hệ thống đọc ra mã `GG-K17`

#### Scenario: Mã có dấu cộng, dấu phẩy, khoảng trắng
- **WHEN** quét lần lượt mã QR có nội dung `KB+KU34`, `h1,7` và `NỐI 34`
- **THEN** hệ thống đọc ra mã `KB+KU34`, `H1,7` và `NỐI 34`

#### Scenario: Dạng đường dẫn
- **WHEN** quét mã QR có nội dung `https://kho.example.vn/m/scan?code=GG-K17`
- **THEN** hệ thống đọc ra mã `GG-K17`

#### Scenario: Đường dẫn có mã chứa dấu cộng
- **WHEN** quét mã QR có nội dung `https://kho.example.vn/m/scan?code=KB%2BKU34`
- **THEN** hệ thống đọc ra mã `KB+KU34`, không phải `KB KU34`

#### Scenario: QR không phải mã hàng
- **WHEN** quét mã QR chứa `WIFI:S:Bai01;P:12345678;;`
- **THEN** M2 hiện "Mã QR này không phải mã hàng" và tiếp tục quét

## ADDED Requirements

### Requirement: Gõ mã cũ hoặc mã gần đúng ở M2
Ô "Nhập mã" ở M2 và API tra tồn theo mã SHALL nhận mã chính, mã gõ khác dấu / khoảng trắng / hoa thường của mã chính, và mã cũ của vật tư. Thẻ hiện ra SHALL luôn ghi mã chính.

#### Scenario: Gõ không dấu
- **WHEN** Thủ kho gõ "noi 34" và bấm "Tìm", khi danh mục có `NỐI 34`
- **THEN** thẻ của `NỐI 34` hiện ra

#### Scenario: Gõ mã cũ
- **WHEN** Thủ kho gõ "k1,7" và bấm "Tìm", khi `GG-K17` có mã cũ `K1,7`
- **THEN** thẻ hiện "GG-K17 · cái · 13,5 kg/cái" với tồn của `GG-K17`

#### Scenario: Thẻ hiện đơn vị mới
- **WHEN** Thủ kho gõ "ONG-49" khi `ONG-49` tính theo mét, 3,56 kg/m, có 1.250,5 m Tốt ở bãi
- **THEN** thẻ hiện "ONG-49 · m · 3,56 kg/m" và Tốt "1.250,5"
