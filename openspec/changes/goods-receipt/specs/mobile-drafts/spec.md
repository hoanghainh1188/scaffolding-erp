# Spec Delta

## Purpose

Phiếu Thủ kho đang làm trên điện thoại không mất khi mất sóng hay tắt trang: nháp lưu trên máy, tự gửi lại khi có mạng, và một nháp không bao giờ thành hai chứng từ.

## ADDED Requirements

### Requirement: Nháp tự lưu trên máy
Phiếu đang làm trên khu Mobile SHALL tự lưu thành nháp trên chính thiết bị đó sau mỗi thay đổi, không cần mạng. Nháp SHALL có mã nháp sinh trên máy khi mở phiếu lần đầu. Mở lại phiếu SHALL khôi phục đúng các số đã nhập. Nút "Lưu nháp" SHALL lưu ngay và quay về Việc hôm nay.

#### Scenario: Tắt trang giữa chừng
- **WHEN** Thủ kho đã đếm Khung 196 và Chéo 400 trên M3 của `PO-2026-052` rồi đóng trình duyệt
- **THEN** mở lại `/m/receive/PO-2026-052` hiện lại Khung 196, Chéo 400 và "Chuyến 1 · 2/4 mã xong"

#### Scenario: Mất sóng trong lúc đếm
- **WHEN** điện thoại mất mạng khi Thủ kho đang ở M3
- **THEN** thanh đầu màn hình hiện "Mất kết nối – đã lưu nháp" **AND** Thủ kho vẫn đếm, chia tình trạng, nhập chi phí được

### Requirement: Nháp chỉ thuộc người tạo trên máy đó
Nháp SHALL chỉ hiện với tài khoản đã tạo nó, trên thiết bị đã tạo nó. Đăng xuất SHALL không xóa nháp. Thủ kho SHALL xóa được nháp của mình sau khi xác nhận lại.

#### Scenario: Người khác đăng nhập cùng máy
- **WHEN** `vantung` có nháp nhập `PO-2026-052`, đăng xuất, rồi `ducthang` đăng nhập trên cùng điện thoại
- **THEN** M1 và M7 của `ducthang` không hiện nháp đó **AND** khi `vantung` đăng nhập lại thì nháp vẫn còn

#### Scenario: Xóa nháp
- **WHEN** Thủ kho bấm "Xóa nháp" trên M7
- **THEN** hộp thoại hỏi "Xóa nháp nhập PO-2026-052? Số đã đếm sẽ mất." **AND** chỉ xóa sau khi bấm xác nhận

### Requirement: Gửi lại khi có mạng
Xác nhận phiếu lúc không có mạng hoặc server không trả lời SHALL giữ nháp ở trạng thái "Chờ gửi" (không sửa được) và hệ thống SHALL tự gửi lại khi có mạng, khi mở app và định kỳ khi app đang mở. Gửi xong SHALL xóa nháp và báo mã chứng từ. Server từ chối (dữ liệu sai, đơn đã đổi) SHALL mở lại nháp kèm thông báo, không mất số đã nhập.

#### Scenario: Xác nhận lúc mất mạng
- **WHEN** Thủ kho bấm "Xác nhận nhập kho" khi không có mạng
- **THEN** M3 hiện "Chưa gửi được, sẽ tự gửi khi có mạng" **AND** M7 hiện nháp ở mục "Chưa gửi · lưu trên máy này" với nhãn "Chờ gửi"

#### Scenario: Có mạng lại
- **WHEN** nháp đang "Chờ gửi" và điện thoại có mạng lại trong lúc mở app
- **THEN** phiếu được gửi tự động **AND** app báo "Đã nhập kho PN-2026-094" **AND** nháp biến khỏi M7

#### Scenario: Server từ chối khi gửi lại
- **WHEN** nháp "Chờ gửi" của `PO-2026-051` được gửi lại sau khi văn phòng đã đóng đơn
- **THEN** nháp chuyển "Bị từ chối" kèm "Đơn PO-2026-051 đã xong, không nhập thêm được" **AND** số đã đếm vẫn còn

#### Scenario: Phiên đăng nhập hết hạn
- **WHEN** gửi lại nháp và server trả 401
- **THEN** nháp vẫn "Chờ gửi" **AND** app mở trang đăng nhập; đăng nhập xong thì tự gửi tiếp

### Requirement: Một nháp chỉ thành một chứng từ
Mọi lần gửi của một nháp SHALL mang cùng mã nháp. Server SHALL trả về chứng từ đã tạo cho mã nháp đó thay vì tạo mới, kể cả khi hai lần gửi tới cùng lúc. Hai tab cùng mở trên một máy SHALL không gửi cùng một nháp song song.

#### Scenario: Mất trả lời rồi gửi lại
- **WHEN** server đã ghi phiếu của nháp nhưng điện thoại mất mạng trước khi nhận trả lời, rồi tự gửi lại
- **THEN** điện thoại nhận mã phiếu đã có **AND** server vẫn chỉ có một phiếu cho nháp đó

#### Scenario: Bấm xác nhận hai lần
- **WHEN** Thủ kho bấm "Xác nhận nhập kho" hai lần liên tiếp
- **THEN** chỉ một yêu cầu được gửi **AND** chỉ có một phiếu

### Requirement: Nháp cũ
Nháp chưa gửi quá 3 ngày SHALL hiện nhãn "Nháp cũ" trên M1 và M7. Hệ thống SHALL không tự xóa nháp.

#### Scenario: Nháp 4 ngày
- **WHEN** hôm nay là 30/10/2026 và có nháp tạo ngày 26/10/2026 chưa gửi
- **THEN** M7 hiện nháp đó với nhãn "Nháp cũ"
