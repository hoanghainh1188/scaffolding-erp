# Spec Delta

## Purpose

Thủ kho quét mã QR dán theo mã hàng (hoặc gõ mã) trên điện thoại để tra nhanh vật tư và tồn kho, và để nhảy tới đúng dòng khi đang làm phiếu.

## ADDED Requirements

### Requirement: Nội dung mã QR
Mã QR dán trên hàng SHALL chứa đúng mã hàng (VD `GG-K17`). Khi đọc, hệ thống SHALL bỏ khoảng trắng hai đầu, không phân biệt hoa thường, và chấp nhận thêm dạng đường dẫn có tham số `code` (VD `https://kho.example.vn/m/scan?code=GG-K17`). Nội dung không ra mã hàng hợp lệ SHALL báo "Mã QR này không phải mã hàng".

#### Scenario: Mã hàng trần
- **WHEN** quét mã QR có nội dung ` gg-k17 `
- **THEN** hệ thống đọc ra mã `GG-K17`

#### Scenario: Dạng đường dẫn
- **WHEN** quét mã QR có nội dung `https://kho.example.vn/m/scan?code=GG-K17`
- **THEN** hệ thống đọc ra mã `GG-K17`

#### Scenario: QR không phải mã hàng
- **WHEN** quét mã QR chứa `WIFI:S:Bai01;P:12345678;;`
- **THEN** M2 hiện "Mã QR này không phải mã hàng" và tiếp tục quét

### Requirement: Màn quét mã M2
Trang `/m/scan` SHALL mở camera sau, quét liên tục và hiện thẻ vật tư khi đọc được mã: tên, mã, đơn vị, trọng lượng chuẩn, giờ nhận mã, tồn Tốt và Chờ sửa ở bãi, tồn ở công trình. Trang SHALL luôn có ô "Không quét được? Nhập mã" với nút "Tìm". Nút "Xem thẻ kho" SHALL chỉ hiện cho người có quyền xem kho.

#### Scenario: Quét được mã
- **WHEN** `vantung` quét nhãn `GG-K17` lúc 09:41, khi `GG-K17` có 1.240 Tốt, 186 Chờ sửa ở bãi và 3.860 ở công trình
- **THEN** thẻ hiện "Khung giàn giáo 1,7m", "GG-K17 · cái · 13,5 kg/cái", "Đã nhận mã lúc 09:41", Tốt 1.240, Chờ sửa 186, Ở công trình 3.860 **AND** không có nút "Xem thẻ kho"

#### Scenario: Gõ mã
- **WHEN** Thủ kho gõ "gg-ch" vào ô nhập mã và bấm "Tìm"
- **THEN** thẻ của `GG-CH` hiện ra

#### Scenario: Mã không có trong danh mục
- **WHEN** gõ "GG-X99" và bấm "Tìm"
- **THEN** M2 hiện "Không tìm thấy mã GG-X99"

#### Scenario: Chưa cho dùng camera
- **WHEN** Thủ kho từ chối quyền camera
- **THEN** M2 hiện "Chưa cho phép dùng camera. Bật lại trong cài đặt trình duyệt, hoặc nhập mã." **AND** ô nhập mã vẫn dùng được

#### Scenario: Giám đốc thấy nút thẻ kho
- **WHEN** Giám đốc quét `GG-K17` trên M2
- **THEN** thẻ có nút "Xem thẻ kho" mở thẻ kho của `GG-K17`

### Requirement: Tra tồn một mã không lộ giá vốn
API tra tồn theo mã SHALL trả số lượng theo tình trạng và vị trí, không trả giá vốn hay giá trị. Mọi vai trò đã đăng nhập SHALL dùng được (`stock.lookup`).

#### Scenario: Thủ kho tra tồn
- **WHEN** `vantung` gửi `GET /api/stock/lookup?code=GG-K17`
- **THEN** API trả tồn theo tình trạng **AND** kết quả không có trường giá vốn nào

#### Scenario: Chưa đăng nhập
- **WHEN** gửi `GET /api/stock/lookup?code=GG-K17` không có phiên đăng nhập
- **THEN** API trả 401

### Requirement: Quét mã trong phiếu đang làm
Trên M3, nút "Quét mã" SHALL mở khung quét ngay trong trang (không chuyển trang). Quét được mã có trong phiếu SHALL đóng khung, cuộn tới dòng đó và đặt con trỏ vào ô đếm. Mã không có trong phiếu SHALL báo và tiếp tục quét.

#### Scenario: Quét mã có trong phiếu
- **WHEN** Thủ kho đang ở M3 của `PO-2026-052`, bấm "Quét mã" và quét `GG-M16`
- **THEN** khung quét đóng **AND** trang cuộn tới thẻ "Mâm giàn giáo 1,6m" với con trỏ ở ô đếm

#### Scenario: Quét mã ngoài đơn
- **WHEN** Thủ kho quét `GG-K15` trên M3 của `PO-2026-052`
- **THEN** khung quét hiện "GG-K15 không có trong đơn PO-2026-052" và tiếp tục quét

#### Scenario: Quét khi mất mạng
- **WHEN** điện thoại mất mạng khi Thủ kho đang ở M3 và bấm "Quét mã"
- **THEN** khung quét vẫn mở và nhảy tới dòng của mã quét được
