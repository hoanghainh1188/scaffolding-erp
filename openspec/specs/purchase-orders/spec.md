# purchase-orders Specification

## Purpose
Đơn thu mua hàng từ nhà cung cấp (cá nhân thanh lý, cai thầu, công ty). Đơn ghi hàng, số lượng, đơn giá và chi phí mua hàng **dự kiến**. Thủ kho dựa vào đơn để nhận hàng. Đơn không ghi sổ kho.

## Requirements

### Requirement: Nội dung đơn thu mua
Đơn thu mua SHALL có:
- mã đơn và một nhà cung cấp;
- loại hàng `NEW` (Hàng mới) hoặc `USED` (Đã qua sử dụng);
- ngày dự kiến nhập, giờ (không bắt buộc), phương tiện vận chuyển, ghi chú;
- cách chia chi phí `VALUE` (theo giá trị, mặc định) hoặc `WEIGHT` (theo trọng lượng);
- các dòng hàng: mã hàng, đơn vị đặt (`PIECE` hoặc `KG`), số lượng, đơn giá;
- các khoản chi phí mua hàng dự kiến: tên và số tiền.

Một mã hàng SHALL chỉ có một dòng trong một đơn.

#### Scenario: Trùng mã hàng
- **WHEN** lưu đơn có hai dòng `GG-K17`
- **THEN** hệ thống từ chối với "GG-K17 đã có trong đơn, sửa số lượng ở dòng cũ"

#### Scenario: Thiếu tên khoản chi phí
- **WHEN** lưu đơn có khoản chi phí 500.000 ₫ nhưng tên để trống
- **THEN** hệ thống từ chối với "Nhập tên khoản chi phí"

#### Scenario: Chi phí bằng 0
- **WHEN** lưu khoản chi phí "Bốc xếp" 0 ₫
- **THEN** hệ thống từ chối với "Chi phí phải lớn hơn 0"

### Requirement: Tiền dự kiến của đơn
Thành tiền dòng SHALL bằng số lượng × đơn giá, làm tròn đến 1 ₫ (0,5 làm tròn lên). Tiền hàng dự kiến = tổng thành tiền. Tổng cộng dự kiến = tiền hàng dự kiến + tổng chi phí dự kiến.

#### Scenario: Tổng cộng của đơn trên D3
- **WHEN** đơn có 4 dòng 37.000.000 ₫, 12.800.000 ₫, 21.750.000 ₫, 9.378.750 ₫ và 3 khoản chi phí: cước xe tải 3.500.000 ₫, bốc xếp 1.200.000 ₫, cầu đường 180.000 ₫
- **THEN** tiền hàng là 80.928.750 ₫, chi phí mua hàng là 4.880.000 ₫, tổng cộng là 85.808.750 ₫

#### Scenario: Thành tiền dòng kg có số lẻ
- **WHEN** dòng Phế liệu sắt lẫn đặt 212,5 kg × 8.201 ₫/kg (chính xác 1.742.712,5 ₫)
- **THEN** thành tiền là 1.742.713 ₫

### Requirement: Mã đơn thu mua
Mã đơn SHALL có dạng `PO-<năm>-<số 3 chữ số>`. Mã được cấp khi tạo đơn (kể cả đơn nháp), theo năm của ngày tạo theo giờ Việt Nam, và đánh số lại từ 001 mỗi năm. Hai đơn tạo cùng lúc SHALL nhận hai mã khác nhau. Mã SHALL không đổi được. Mã của đơn nháp đã xóa SHALL không cấp lại.

#### Scenario: Đơn tiếp theo trong năm
- **WHEN** đơn gần nhất năm 2026 là `PO-2026-054` và Kinh doanh tạo đơn mới ngày 26/10/2026
- **THEN** đơn mới có mã `PO-2026-055`

#### Scenario: Sang năm mới
- **WHEN** tạo đơn đầu tiên lúc 00:10 ngày 01/01/2027 giờ Việt Nam (17:10 ngày 31/12/2026 UTC)
- **THEN** đơn có mã `PO-2027-001`

#### Scenario: Tạo đồng thời
- **WHEN** hai người tạo đơn cùng lúc
- **THEN** hai đơn có hai mã liền nhau, không trùng

### Requirement: Nhà cung cấp và vật tư của đơn
Đơn SHALL chỉ chọn được nhà cung cấp **đang dùng** và vật tư **đang dùng**. Kiểm tra này SHALL chạy lại lúc lưu và lúc đặt đơn. Nhà cung cấp hoặc vật tư bị ngừng dùng cùng lúc với lệnh lưu SHALL không lọt vào đơn.

#### Scenario: Nhà cung cấp ngừng dùng
- **WHEN** Kinh doanh lưu đơn với `NCC-0003` đã ngừng dùng
- **THEN** hệ thống từ chối với "Nhà cung cấp NCC-0003 đã ngừng dùng"

#### Scenario: Vật tư ngừng dùng
- **WHEN** Kinh doanh lưu đơn có dòng `KK-01` đã ngừng dùng
- **THEN** hệ thống từ chối với "Vật tư KK-01 đã ngừng dùng"

#### Scenario: Ngừng dùng cùng lúc với lệnh đặt đơn
- **WHEN** Kế toán ngừng dùng `NCC-0002` đúng lúc Kinh doanh bấm "Lưu đơn" cho một đơn của `NCC-0002`
- **THEN** chỉ có một trong hai kết quả:
  - đơn được đặt, và lệnh ngừng dùng bị từ chối vì nhà cung cấp còn đơn đang xử lý;
  - nhà cung cấp ngừng dùng trước, và lệnh đặt đơn bị từ chối với "Nhà cung cấp NCC-0002 đã ngừng dùng"

### Requirement: Đơn vị đặt hàng
Mã tính theo cái (`PIECE`) SHALL đặt được theo cái hoặc theo kg. Mã tính theo kg (`KG`) SHALL chỉ đặt theo kg. Dòng đặt theo cái SHALL có số lượng nguyên. Số lượng SHALL lớn hơn 0. Đơn giá SHALL là số nguyên đồng, không âm, tính trên đơn vị đặt. Dòng của mã tính theo cái nhưng đặt theo kg SHALL hiện kèm số cái quy đổi: số kg ÷ trọng lượng chuẩn, làm tròn xuống đến cái. Số cái quy đổi chỉ để tham khảo, không lưu.

#### Scenario: Mua khung theo kg
- **WHEN** dòng `GG-K17` (13,5 kg/cái) đặt 2.000 kg × 14.000 ₫/kg
- **THEN** thành tiền 28.000.000 ₫ **AND** dòng hiện "≈ 148 cái"

#### Scenario: Mã kg đặt theo cái
- **WHEN** dòng `PL-SAT` (tính theo kg) chọn đơn vị cái
- **THEN** hệ thống từ chối với "PL-SAT tính theo kg, chỉ đặt được theo kg"

#### Scenario: Số cái lẻ
- **WHEN** dòng `GG-CH` đặt 2,5 cái
- **THEN** hệ thống từ chối với "GG-CH tính theo cái, số lượng phải là số nguyên"

#### Scenario: Số lượng 0
- **WHEN** dòng `GG-M16` có số lượng 0
- **THEN** hệ thống từ chối với "Số lượng phải lớn hơn 0"

#### Scenario: Đơn giá 0
- **WHEN** dòng `GG-CH` đặt 20 cái × 0 ₫ (người bán cho kèm)
- **THEN** dòng được lưu với thành tiền 0 ₫

### Requirement: Trạng thái đơn thu mua
Trạng thái lưu SHALL chỉ là `DRAFT`, `IN_PROGRESS` hoặc `DONE`. Đơn `DONE` SHALL có kết quả `RECEIVED` (Đã nhận đủ), `CLOSED` (Đã đóng) hoặc `CANCELLED` (Đã hủy); đơn chưa `DONE` SHALL không có kết quả. Nhãn hiển thị:
- `DRAFT`: "Nháp";
- `IN_PROGRESS`: "Đang xử lý · Chờ xe về" khi chưa có chuyến nhập, "Đang xử lý · Đang nhận" khi đã có;
- `DONE`: "Hoàn thành · " + nhãn kết quả.

#### Scenario: Nhãn đơn đã hủy
- **WHEN** đơn `PO-2026-053` là `DONE` + `CANCELLED`
- **THEN** danh sách hiện "Hoàn thành · Đã hủy"

#### Scenario: Lưu kết quả cho đơn chưa xong
- **WHEN** một phép ghi cố lưu đơn `IN_PROGRESS` kèm kết quả `CLOSED`
- **THEN** DB từ chối phép ghi

### Requirement: Chuyển trạng thái đơn thu mua
Chỉ các lệnh sau SHALL hợp lệ; mọi lệnh khác SHALL bị từ chối và đơn giữ nguyên:
- Đặt đơn: `DRAFT` → `IN_PROGRESS`;
- Hủy đơn: `IN_PROGRESS` chưa có chuyến nhập → `DONE` + `CANCELLED`;
- Đóng đơn: `IN_PROGRESS` đã có chuyến nhập → `DONE` + `CLOSED`;
- Xác nhận phiếu nhập (`goods-receipt`, Thủ kho, Giám đốc), xét từng dòng đơn: mọi dòng nhận đủ → `DONE` + `RECEIVED`; còn dòng chờ giao bù → giữ `IN_PROGRESS`; còn dòng thiếu nhưng không dòng nào chờ → `DONE` + `CLOSED`.

#### Scenario: Đặt đơn nháp
- **WHEN** Kinh doanh bấm "Lưu đơn" cho `PO-2026-054` đang Nháp, có 2 dòng hàng
- **THEN** đơn chuyển `IN_PROGRESS` và hiện "Đang xử lý · Chờ xe về"

#### Scenario: Đặt đơn không có dòng hàng
- **WHEN** đặt một đơn nháp chưa có dòng hàng nào
- **THEN** hệ thống từ chối với "Đơn cần ít nhất một dòng hàng" **AND** đơn vẫn Nháp

#### Scenario: Đặt đơn thiếu ngày dự kiến
- **WHEN** đặt một đơn nháp chưa có ngày dự kiến nhập
- **THEN** hệ thống từ chối với "Nhập ngày dự kiến nhập"

#### Scenario: Đặt lại đơn đã đặt
- **WHEN** gửi lệnh đặt cho `PO-2026-055` đang `IN_PROGRESS`
- **THEN** hệ thống từ chối với "Đơn PO-2026-055 đã đặt rồi"

#### Scenario: Đổi đơn đã xong
- **WHEN** gửi lệnh hủy hoặc đóng cho `PO-2026-050` đã `DONE`
- **THEN** hệ thống từ chối với "Đơn PO-2026-050 đã xong, không đổi được nữa"

#### Scenario: Nhận đủ
- **WHEN** chuyến cuối của `PO-2026-052` được xác nhận và mọi dòng đã nhận ít nhất bằng số đặt
- **THEN** đơn chuyển `DONE` + `RECEIVED` và hiện "Hoàn thành · Đã nhận đủ"

#### Scenario: Nhận thiếu, chờ giao bù
- **WHEN** chuyến đầu của `PO-2026-051` thiếu 40 mâm và Thủ kho tích "Chờ giao bù phần thiếu"
- **THEN** đơn vẫn `IN_PROGRESS` và hiện "Đang xử lý · Đang nhận"

#### Scenario: Nhận thiếu, không chờ giao bù
- **WHEN** chuyến đầu của `PO-2026-051` thiếu 40 mâm và Thủ kho không tích "Chờ giao bù phần thiếu"
- **THEN** đơn chuyển `DONE` + `CLOSED`

#### Scenario: Một dòng chờ, một dòng chốt thiếu
- **WHEN** chuyến đầu của `PO-2026-052` có Khung thiếu 4 không chờ và Mâm "Chuyến này không có" đang chờ chuyến sau
- **THEN** đơn vẫn `IN_PROGRESS`
- **AND WHEN** chuyến 2 nhận đủ Mâm
- **THEN** đơn chuyển `DONE` + `CLOSED` vì Khung đã chốt ở 196/200

### Requirement: Sửa đơn thu mua
- Đơn nháp, hoặc đơn đặt chưa có chuyến nhập: SHALL sửa được mọi thông tin trừ mã đơn.
- Đơn đã có chuyến nhập: SHALL chỉ sửa được ngày dự kiến, giờ, phương tiện, ghi chú, vì phiếu nhập đã tính theo đơn giá và cách chia của đơn.
- Đơn đã xong: SHALL không sửa được.

Mỗi lần sửa đơn đã đặt SHALL ghi vào lịch sử. Lệnh sửa SHALL gửi kèm thời điểm sửa gần nhất đã đọc; nếu đơn đã bị sửa sau đó thì lệnh bị từ chối, không ghi gì.

#### Scenario: Sửa đơn giá trước khi xe về
- **WHEN** `PO-2026-055` đã đặt, chưa có chuyến nhập, Kinh doanh đổi đơn giá Khung 1,7m từ 185.000 ₫ thành 188.000 ₫
- **THEN** thay đổi được lưu **AND** lịch sử có dòng "Quốc Bảo sửa đơn"

#### Scenario: Hai người cùng sửa một đơn
- **WHEN** Quốc Bảo và Giám đốc cùng mở form sửa `PO-2026-055`, Giám đốc lưu trước, rồi Quốc Bảo bấm "Lưu thay đổi"
- **THEN** lệnh của Quốc Bảo trả 409 "Đơn vừa được người khác sửa, tải lại trang" **AND** đơn giữ thay đổi của Giám đốc

#### Scenario: Sửa dòng hàng khi đã có chuyến nhập
- **WHEN** `PO-2026-051` đã có phiếu nhập và Kinh doanh đổi số lượng Mâm
- **THEN** hệ thống từ chối với "Đơn đã có phiếu nhập, chỉ sửa được ngày dự kiến, phương tiện và ghi chú"

#### Scenario: Đổi ngày khi đã có chuyến nhập
- **WHEN** `PO-2026-051` đã có phiếu nhập và Kinh doanh đổi ngày dự kiến sang 30/10/2026 cho chuyến giao bù
- **THEN** thay đổi được lưu

### Requirement: Xóa đơn nháp
Chỉ đơn nháp SHALL xóa được, và bị xóa hẳn cùng các dòng. Đơn đã đặt dùng Hủy đơn.

#### Scenario: Xóa đơn nháp
- **WHEN** Kinh doanh xóa `PO-2026-054` đang Nháp
- **THEN** đơn và các dòng bị xóa hẳn **AND** đơn tạo sau đó không nhận lại mã `PO-2026-054`

#### Scenario: Xóa đơn đã đặt
- **WHEN** gửi lệnh xóa `PO-2026-055` đang `IN_PROGRESS`
- **THEN** hệ thống từ chối với "Đơn đã đặt không xóa được, dùng Hủy đơn"

### Requirement: Hủy và đóng đơn
- **Hủy đơn** chỉ dùng cho đơn đã đặt mà chưa có chuyến nhập, và SHALL bắt buộc ghi lý do.
- **Đóng đơn** chỉ dùng cho đơn đã có chuyến nhập (khi không chờ giao bù nữa). Lý do không bắt buộc. Sau khi đóng, tiền trả người bán chốt theo số đã nhận.

Đơn hủy hoặc đóng SHALL không còn hiện trong "Xe sắp về" và SHALL giữ nguyên mã, dòng hàng và lịch sử. Lý do hủy/đóng SHALL hiện trên D3b.

#### Scenario: Hủy đơn chưa có chuyến nhập
- **WHEN** Kinh doanh hủy `PO-2026-055` (chưa có chuyến nhập) với lý do "Người bán bán cho chỗ khác"
- **THEN** đơn chuyển `DONE` + `CANCELLED` **AND** D3b hiện "Đã hủy: Người bán bán cho chỗ khác"

#### Scenario: Hủy thiếu lý do
- **WHEN** Kinh doanh hủy `PO-2026-055` mà không ghi lý do
- **THEN** hệ thống từ chối với "Nhập lý do hủy đơn"

#### Scenario: Hủy đơn đã có chuyến nhập
- **WHEN** Kinh doanh hủy `PO-2026-051` đã có phiếu nhập `PN-2026-090`
- **THEN** hệ thống từ chối với "Đơn đã có phiếu nhập thì không hủy được. Hàng nhập sai thì lập phiếu điều chỉnh kho."

#### Scenario: Đóng đơn còn chờ giao bù
- **WHEN** Kinh doanh bấm "Đóng đơn, không chờ nữa" cho `PO-2026-051` (đang chờ giao bù 40 mâm)
- **THEN** đơn chuyển `DONE` + `CLOSED` **AND** lịch sử có dòng "Quốc Bảo đóng đơn"

#### Scenario: Đóng đơn chưa có chuyến nhập
- **WHEN** gửi lệnh đóng cho `PO-2026-055` chưa có chuyến nhập
- **THEN** hệ thống từ chối với "Đơn chưa có phiếu nhập, dùng Hủy đơn"

### Requirement: Đơn thu mua không ghi sổ kho
Lập, đặt, sửa, hủy, đóng hay xóa đơn thu mua SHALL không thêm dòng nào vào sổ kho và SHALL không đổi tồn kho hay giá vốn bình quân. Giá nhập xem trước trên đơn SHALL không dùng để ghi sổ.

#### Scenario: Đặt đơn không đổi tồn
- **WHEN** đặt `PO-2026-055` có 200 Khung 1,7m, khi tồn `GG-K17` Mới là 0 cái
- **THEN** tồn `GG-K17` Mới vẫn 0 **AND** sổ kho không có dòng mới

### Requirement: Lịch sử đơn
Mỗi đơn SHALL có lịch sử chỉ ghi thêm. Mỗi dòng gồm thời điểm, người làm và việc đã làm: tạo, đặt (hiện "gửi đơn cho kho"), sửa, hủy, đóng, ghi sổ phiếu nhập (kèm mã phiếu và các điểm bất thường Thủ kho đã xác nhận), đánh dấu chờ giao bù (kèm phần còn chờ), nhận đủ. Đơn bị đóng vì phiếu nhận thiếu SHALL có dòng đóng mang tên người nhập. D3b SHALL hiện lịch sử, mới nhất ở trên.

#### Scenario: Lịch sử sau khi đặt
- **WHEN** Quốc Bảo tạo `PO-2026-051` lúc 15:50 ngày 23/10/2026 rồi đặt lúc 16:05
- **THEN** lịch sử D3b hiện "23/10 16:05 · Quốc Bảo gửi đơn cho kho" trên dòng "23/10 15:50 · Quốc Bảo tạo đơn"

#### Scenario: Lịch sử sau chuyến có chờ giao bù
- **WHEN** Văn Tùng ghi sổ `PN-2026-090` lúc 09:10 ngày 24/10/2026, đánh dấu chờ giao bù 40 mâm
- **THEN** lịch sử D3b có dòng "24/10 09:10 · Văn Tùng ghi sổ PN-2026-090, đánh dấu chờ giao bù 40 mâm giàn giáo 1,6m"

#### Scenario: Phiếu nhận thiếu đóng đơn
- **WHEN** Đức Thắng ghi sổ chuyến cuối và đơn đóng vì nhận thiếu, không chờ
- **THEN** lịch sử có dòng "Đức Thắng ghi sổ PN-…" và dòng "Đức Thắng đóng đơn: Nhận thiếu, không chờ giao bù"

### Requirement: Quyền với đơn thu mua
- Xem danh sách và chi tiết đơn (trang và API `purchasing`): Giám đốc, Kế toán, Kinh doanh.
- Tạo, sửa, đặt, hủy, đóng, xóa đơn: chỉ Giám đốc và Kinh doanh.
- Thủ kho đọc đơn đang xử lý chỉ qua API nhận hàng (`receiving.manage`), không có đơn giá; trang D2, D3, D3b vẫn chỉ cho văn phòng.
- Nút ghi chỉ hiện cho người có quyền ghi. Server SHALL kiểm quyền ở mọi lệnh, dù giao diện có hiện nút hay không.

#### Scenario: Kinh doanh tạo đơn
- **WHEN** `quocbao` (Kinh doanh) gửi `POST /api/purchasing/orders`
- **THEN** đơn nháp được tạo

#### Scenario: Kế toán chỉ xem
- **WHEN** `thuha` (Kế toán) mở `/purchasing/orders/PO-2026-051` rồi gửi `POST /api/purchasing/orders`
- **THEN** trang mở được và không có nút "Tạo đơn thu mua", "Sửa", "Hủy đơn", "Đóng đơn, không chờ nữa" **AND** API trả 403 "Bạn không có quyền thực hiện thao tác này"

#### Scenario: Thủ kho và Xưởng
- **WHEN** `vantung` (Thủ kho) gửi `GET /api/purchasing/orders`
- **THEN** API trả 403

#### Scenario: Thủ kho đọc đơn để nhận hàng
- **WHEN** `vantung` (Thủ kho) gửi `GET /api/receiving/orders/PO-2026-052`
- **THEN** API trả các dòng còn mở của đơn **AND** kết quả không có đơn giá hay thành tiền

#### Scenario: Chưa đăng nhập
- **WHEN** gửi `GET /api/purchasing/orders` không có phiên đăng nhập
- **THEN** API trả 401

### Requirement: Danh sách đơn thu mua D2
Trang `/purchasing` SHALL hiện bảng đơn với các cột Số đơn, Nhà cung cấp / cai thầu, Loại, Ngày nhập (ngày dự kiến, kèm giờ nếu có), Số mã, Tổng cộng (dự kiến), Trạng thái. Thứ tự: đơn đang xử lý (ngày dự kiến gần nhất trước), rồi Nháp, rồi đơn đã xong (mới nhất trước). Phân trang 20 đơn một trang. Bấm một dòng SHALL mở D3b.

#### Scenario: Chưa có đơn nào
- **WHEN** chưa có đơn thu mua nào
- **THEN** bảng hiện "Chưa có đơn thu mua" **AND** người có quyền ghi thấy nút "Tạo đơn thu mua"

### Requirement: Lọc và tìm đơn trên D2
D2 SHALL có tab Tất cả, Nháp, Chờ xe về, Đang nhận, Đã nhập (đơn đã nhận đủ hoặc đã đóng), mỗi tab kèm số đơn. Đơn đã hủy chỉ hiện ở tab Tất cả. D2 SHALL tìm được theo mã đơn hoặc tên nhà cung cấp (không phân biệt dấu) và lọc được theo loại hàng. Tab, ô tìm, bộ lọc và trang SHALL lưu trên URL.

#### Scenario: Tab Chờ xe về
- **WHEN** Kinh doanh chọn tab "Chờ xe về" khi có 2 đơn đặt chưa có chuyến nhập
- **THEN** bảng chỉ có 2 đơn đó **AND** tab hiện "Chờ xe về · 2" **AND** URL có `?tab=waiting`

#### Scenario: Tìm không dấu
- **WHEN** gõ "phuc lam" vào ô tìm
- **THEN** bảng hiện các đơn của "Cty TNHH Thép Phúc Lâm"

### Requirement: Lời nhắc xe sắp về trên D2
Đầu D2 SHALL hiện "Hôm nay có N xe sắp về bãi" khi có N > 0 đơn `IN_PROGRESS` dự kiến nhập hôm nay theo giờ Việt Nam, và không hiện gì khi N = 0.

#### Scenario: Xe sắp về hôm nay
- **WHEN** hôm nay là 26/10/2026 và có 2 đơn `IN_PROGRESS` dự kiến nhập 26/10/2026
- **THEN** đầu trang hiện "Hôm nay có 2 xe sắp về bãi"

#### Scenario: Không có xe về hôm nay
- **WHEN** không có đơn `IN_PROGRESS` nào dự kiến nhập hôm nay
- **THEN** đầu trang không có lời nhắc xe sắp về

### Requirement: Form đơn thu mua D3
Trang `/purchasing/orders/new` và `/purchasing/orders/<mã>/edit` SHALL có các khối như bản vẽ D3:
- Thông tin chung (nhà cung cấp chọn trong danh sách đang dùng);
- Hàng hóa, mỗi dòng có nút đổi cái/kg, cột chi phí phân bổ và giá nhập / đơn vị;
- Chi phí mua hàng, gợi ý tên Cước xe tải, Bốc xếp, Cầu đường;
- Cách chia chi phí;
- Tổng cộng (khối `primary` duy nhất).

Lỗi SHALL hiện ngay dưới ô sai.

#### Scenario: Ô bị khóa khi đã có chuyến nhập
- **WHEN** mở form sửa của đơn đã có phiếu nhập
- **THEN** chỉ ô ngày dự kiến, giờ, phương tiện, ghi chú sửa được **AND** form hiện "Đơn đã có phiếu nhập, chỉ sửa được ngày dự kiến, phương tiện và ghi chú"

### Requirement: Xem trước chi phí trên D3
Cột "Chi phí phân bổ" và "Giá nhập / đơn vị" SHALL tính lại ngay khi đổi số lượng, đơn giá, đơn vị, chi phí hay cách chia, theo luật của `landed-cost`, trên số dự kiến của đơn.

#### Scenario: Xem trước giá nhập
- **WHEN** Kinh doanh nhập 4 dòng và 3 khoản chi phí như D3, chọn "Theo giá trị"
- **THEN** dòng Khung 1,7m hiện chi phí phân bổ "+2.231.098" và giá nhập "196.155 ₫" **AND** khối Tổng cộng hiện "85.808.750 ₫"

#### Scenario: Đổi cách chia
- **WHEN** trên đơn đó Kinh doanh chọn "Theo trọng lượng"
- **THEN** dòng Khung 1,7m hiện "+1.960.568" và giá nhập "194.803 ₫" ngay, không cần lưu

#### Scenario: Đổi đơn vị sang kg
- **WHEN** dòng `GG-K17` đổi từ cái sang kg và nhập 2.000
- **THEN** dòng hiện "≈ 148 cái" **AND** giá nhập hiện theo ₫/kg

### Requirement: Lưu đơn từ D3
D3 SHALL có nút "Lưu đơn" (lưu và đặt đơn trong một lệnh) và "Lưu nháp". Đơn đã đặt chỉ có nút "Lưu thay đổi". Lưu nháp SHALL chỉ cần nhà cung cấp; dòng hàng và ngày dự kiến kiểm khi đặt.

#### Scenario: Lưu đơn
- **WHEN** Kinh doanh bấm "Lưu đơn" với dữ liệu hợp lệ
- **THEN** đơn được tạo và đặt trong cùng một lệnh **AND** trình duyệt mở D3b của đơn **AND** hiện thông báo "Lưu xong, đơn hiện ở mục "Xe sắp về" trên điện thoại của thủ kho."

#### Scenario: Lưu nháp thiếu thông tin
- **WHEN** Kinh doanh bấm "Lưu nháp" khi mới chọn nhà cung cấp, chưa có dòng hàng và ngày dự kiến
- **THEN** đơn nháp được lưu

### Requirement: Chi tiết đơn thu mua D3b
Trang `/purchasing/orders/<mã>` SHALL hiện:
- đầu trang: mã đơn, nhãn trạng thái, "nhà cung cấp · loại hàng · N chuyến đã nhập";
- thông tin chung: nhà cung cấp, loại hàng, ngày dự kiến, phương tiện, người lập và ngày lập, ghi chú, lý do hủy/đóng nếu có;
- bảng "Đặt và thực nhận" (cộng dồn mọi chuyến): Hàng (tên + mã), Đặt, Đã nhận kèm "đủ" / "thiếu N" / "Chờ giao bù" / "Nhận dư" và số dư, Đơn giá, Thành tiền theo số thực nhận, dòng cộng;
- chi phí mua hàng dự kiến và cách chia;
- lịch sử.

#### Scenario: Mã đơn không có
- **WHEN** mở `/purchasing/orders/PO-2026-999`
- **THEN** trang 404 "Không tìm thấy đơn thu mua"

#### Scenario: Bảng đặt và thực nhận
- **WHEN** `PO-2026-051` đặt 100 Mâm × 145.000 ₫, đã nhận 60 và đang chờ giao bù, đặt 200 kg `PL-SAT` × 8.200 ₫/kg, đã cân 212,5 kg
- **THEN** dòng Mâm hiện "60 cái", "thiếu 40", "Chờ giao bù", thành tiền 8.700.000 ₫ **AND** dòng `PL-SAT` hiện "212,5 kg", nhãn "Nhận dư", "cân dư 12,5 kg", thành tiền 1.742.500 ₫

### Requirement: Phần nhận hàng trên D3b
D3b SHALL có:
- "Các chuyến nhập": mỗi phiếu một khối (mã, "Đã ghi sổ", ngày giờ, xe, người nhập, số đã nhận, chi phí, "Chi phí chuyến này"), thêm khối "Chuyến tiếp theo" khi còn chờ giao bù;
- "Phải trả người bán" = tiền hàng thực nhận, kèm "chưa chốt vì còn chờ giao bù" khi đơn còn chờ;
- "So với đơn": tiền hàng và chi phí, dự kiến so với thực tế, kèm chênh lệch từng dòng thiếu/dư;
- thanh "Còn chờ giao bù …" với nút "Đóng đơn, không chờ nữa" khi đơn đang nhận và còn dòng chờ.

#### Scenario: Đơn chưa có chuyến nhập
- **WHEN** mở D3b của `PO-2026-055` chưa có chuyến nhập
- **THEN** cột "Đã nhận" của mọi dòng là "–" **AND** khối chuyến nhập hiện "Chưa có chuyến nhập. Thủ kho nhập hàng trên điện thoại khi xe về." **AND** "Phải trả người bán" là "0 ₫"

#### Scenario: Đơn đang chờ giao bù
- **WHEN** mở D3b của `PO-2026-051` có `PN-2026-090` (chi phí 1.800.000 ₫) và `PN-2026-093` (chi phí 500.000 ₫), còn chờ giao bù 40 mâm, tiền hàng thực nhận 54.942.500 ₫
- **THEN** đầu trang hiện "Còn chờ giao bù 40 mâm giàn giáo 1,6m" và nút "Đóng đơn, không chờ nữa" **AND** "Các chuyến nhập" có 2 khối và khối "Chuyến tiếp theo" **AND** "Phải trả người bán" là 54.942.500 ₫ kèm "chưa chốt vì còn chờ giao bù" **AND** "Chi phí thực tế (2 chuyến)" là 2.300.000 ₫

#### Scenario: Chi phí không cộng vào tiền trả người bán
- **WHEN** một đơn có tiền hàng thực nhận 58.438.750 ₫ và chi phí các chuyến 4.880.000 ₫
- **THEN** "Phải trả người bán" là 58.438.750 ₫

### Requirement: Nút thao tác trên D3b
D3b SHALL chỉ hiện nút người xem được làm, theo quyền và trạng thái: Sửa; Đặt đơn và Xóa (đơn nháp); Hủy đơn (đơn đặt chưa có chuyến nhập); Đóng đơn, không chờ nữa (đơn đã có chuyến nhập). Hủy, đóng và xóa SHALL hỏi lại trước khi làm.

#### Scenario: Chi tiết đơn đã đặt
- **WHEN** Kinh doanh mở `/purchasing/orders/PO-2026-055` đã đặt, chưa có chuyến nhập
- **THEN** trang hiện "Đang xử lý · Chờ xe về", 3 dòng hàng, tổng tiền hàng dự kiến **AND** có nút "Sửa" và "Hủy đơn" **AND** không có nút "Đóng đơn, không chờ nữa"

#### Scenario: Hỏi lại khi hủy
- **WHEN** Kinh doanh bấm "Hủy đơn"
- **THEN** hộp thoại hỏi lý do hủy **AND** chưa có gì thay đổi cho tới khi bấm xác nhận

### Requirement: Đơn giá đã nhận hàng không đổi
Khi một dòng đơn đã có trên phiếu nhập, đơn giá, đơn vị và vật tư của dòng đó SHALL không đổi được, kể cả khi ghi thẳng vào cơ sở dữ liệu (trigger chặn), vì khoản phải trả người bán tính từ chúng (spec `payables`). Dòng đơn đã có trên phiếu nhập SHALL không xóa được.

#### Scenario: Đổi đơn giá qua DB bị chặn
- **WHEN** dòng Khung 1,7m của `PO-2026-051` đã có trên `PN-2026-087` và role app chạy `UPDATE purchase_order_line SET unit_price = 1 WHERE id = <dòng đó>`
- **THEN** PostgreSQL từ chối với "Dòng đơn đã có phiếu nhập: không đổi đơn giá, đơn vị, vật tư." **AND** khoản `PN-2026-087` vẫn phát sinh 58.000.000 ₫

#### Scenario: Dòng chưa nhận vẫn sửa được
- **WHEN** `PO-2026-055` đã đặt, chưa có phiếu nhập, và Kinh doanh đổi đơn giá Khung 1,7m từ 185.000 ₫ thành 188.000 ₫
- **THEN** thay đổi được lưu như trước change này
