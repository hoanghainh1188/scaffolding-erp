## Purpose

Ảnh hiện trạng chụp khi xe hạ tải làm bằng chứng tính đền bù: nhận an toàn từ điện thoại, xóa dữ liệu vị trí, lưu riêng tư và chỉ người có quyền mới xem được.

## ADDED Requirements

### Requirement: Chụp ảnh trên M4
M4 SHALL có khối "Ảnh hiện trạng" với nút "Chụp ảnh" mở camera của điện thoại (chọn ảnh có sẵn cũng được), mỗi ảnh có chú thích ngắn không bắt buộc (tối đa 100 ký tự). Ảnh SHALL được thu nhỏ trên máy (cạnh dài tối đa 1.600 px) trước khi lưu nháp và gửi. Mỗi phiếu SHALL có tối đa 10 ảnh; ảnh không bắt buộc.

#### Scenario: Chụp hai ảnh
- **WHEN** `vantung` chụp 2 ảnh, chú thích "Khung móp chân" và "Chéo cong"
- **THEN** M4 hiện 2 ảnh nhỏ kèm chú thích **AND** nháp trên máy giữ cả hai ảnh

#### Scenario: Ảnh thứ 11
- **WHEN** phiếu đã có 10 ảnh và `vantung` bấm "Chụp ảnh"
- **THEN** M4 hiện "Mỗi phiếu thu hồi có tối đa 10 ảnh. Xóa bớt ảnh nếu cần chụp thêm."

### Requirement: Kiểm loại và dung lượng ảnh ở server
Server SHALL nhận ảnh chỉ khi nội dung là JPEG, PNG hoặc WebP (kiểm theo các byte đầu của file), không tin đuôi file hay `Content-Type`. Ảnh lớn hơn 4 MB SHALL bị từ chối. Ảnh thứ 11 của cùng một phiếu (hoặc cùng mã nháp) SHALL bị từ chối.

#### Scenario: File giả dạng ảnh
- **WHEN** gửi file `bao-cao.jpg` có `Content-Type: image/jpeg` nhưng nội dung là PDF
- **THEN** API trả 400 với "File này không phải ảnh JPEG, PNG hoặc WebP." **AND** không lưu gì

#### Scenario: Ảnh quá lớn
- **WHEN** gửi ảnh JPEG 5,2 MB
- **THEN** API trả 413 với "Ảnh lớn hơn 4 MB. Chụp lại hoặc chọn ảnh nhỏ hơn."

#### Scenario: Quá số ảnh
- **WHEN** mã nháp đã có 10 ảnh và gửi thêm ảnh thứ 11
- **THEN** API trả 400 với "Mỗi phiếu thu hồi có tối đa 10 ảnh."

### Requirement: Xóa EXIF và nén lại
Server SHALL giải mã ảnh, xoay theo hướng chụp, bỏ toàn bộ dữ liệu EXIF (vị trí GPS, tên máy, giờ chụp gốc) và nén lại thành WebP cạnh dài tối đa 1.600 px trước khi lưu. File gốc SHALL không được lưu.

#### Scenario: Ảnh có GPS
- **WHEN** gửi ảnh JPEG có EXIF chứa tọa độ GPS và tên máy
- **THEN** ảnh lưu là WebP **AND** không còn trường EXIF, GPS hay tên máy nào

#### Scenario: Ảnh không giải mã được
- **WHEN** gửi file có byte đầu của JPEG nhưng phần sau bị hỏng
- **THEN** API trả 400 với "Không đọc được ảnh này. Chụp lại ảnh khác."

### Requirement: Lưu riêng tư, tên do server sinh
Ảnh SHALL lưu ở kho riêng tư, không có đường dẫn công khai. Mỗi ảnh SHALL có mã do server sinh (ngẫu nhiên, không đoán được), không dùng tên file người dùng gửi. Ảnh SHALL gắn với mã nháp khi gửi trước và gắn vào phiếu thu hồi trong cùng transaction ghi sổ.

#### Scenario: Tên file người dùng
- **WHEN** gửi ảnh tên `../../etc/passwd.jpg`
- **THEN** ảnh được lưu với mã do server sinh **AND** tên file gửi lên không xuất hiện ở đâu

#### Scenario: Gắn vào phiếu khi ghi sổ
- **WHEN** điện thoại gửi 4 ảnh với mã nháp rồi gửi lưu phiếu cùng mã nháp
- **THEN** `PTH-2026-071` có 4 ảnh theo đúng thứ tự gửi

### Requirement: Xem ảnh cần đăng nhập và quyền
Ảnh SHALL chỉ xem qua route của app có kiểm đăng nhập và quyền. Người xem được phiếu thu hồi trên Desktop (quyền xem hợp đồng thuê), hoặc có quyền nhập thu hồi, SHALL xem được ảnh của phiếu đó. Ảnh SHALL trả với `Cache-Control: private, no-store` và `X-Content-Type-Options: nosniff`. Mã ảnh không tồn tại và ảnh không có quyền SHALL cùng trả 404.

#### Scenario: Chưa đăng nhập
- **WHEN** mở `/api/returns/photos/<id>` khi chưa đăng nhập
- **THEN** API trả 401 **AND** không có byte ảnh nào

#### Scenario: Kinh doanh chỉ bán
- **WHEN** `thuyvy` (phạm vi "Chỉ bán") mở ảnh của `PTH-2026-071`
- **THEN** API trả 404

#### Scenario: Xưởng mở ảnh
- **WHEN** một tài khoản `WORKSHOP` mở ảnh của `PTH-2026-071`
- **THEN** API trả 404

#### Scenario: Giám đốc xem trên D8
- **WHEN** `minhanh` mở D8 `ĐB-2026-009`
- **THEN** khối "Ảnh hiện trạng" hiện 4 ảnh của `PTH-2026-071` kèm chú thích

### Requirement: Ảnh của phiếu đã ghi sổ chỉ ghi thêm
Ảnh đã gắn vào phiếu thu hồi đã ghi sổ SHALL không xóa, không thay. Thêm ảnh sau ghi sổ SHALL ngoài phạm vi MVP. Ảnh gửi với mã nháp mà không thành phiếu sau 7 ngày SHALL bị dọn.

#### Scenario: Xóa ảnh của phiếu đã ghi sổ
- **WHEN** gửi `DELETE /api/returns/photos/<id>` cho ảnh của `PTH-2026-071`
- **THEN** API trả 405 **AND** DB từ chối nếu xóa thẳng

#### Scenario: Ảnh nháp bỏ dở
- **WHEN** điện thoại gửi 2 ảnh với một mã nháp rồi xóa nháp, và đã qua 7 ngày
- **THEN** lần dọn kế tiếp xóa 2 ảnh đó

### Requirement: Ảnh chờ gửi khi mất sóng
Ảnh SHALL lưu trong nháp trên máy cho tới khi server nhận. Khi có mạng, máy SHALL gửi từng ảnh còn thiếu với mã nháp, rồi mới gửi lưu phiếu. Gửi lại cùng ảnh (cùng mã ảnh phía máy) SHALL không tạo ảnh trùng.

#### Scenario: Mạng chập chờn
- **WHEN** máy gửi được 2 / 4 ảnh rồi mất sóng, sau đó có mạng lại
- **THEN** máy chỉ gửi 2 ảnh còn lại **AND** phiếu có đúng 4 ảnh
