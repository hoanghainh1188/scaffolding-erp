# Spec Delta

## MODIFIED Requirements

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
