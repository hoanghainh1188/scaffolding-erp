## MODIFIED Requirements

### Requirement: Trạng thái hợp đồng
Hợp đồng SHALL có một trong các trạng thái: Nháp, Chờ duyệt, Đã duyệt, Đang thực hiện, Thanh lý, Đã hủy. Chuyển trạng thái SHALL theo bảng: Nháp → Chờ duyệt (gửi duyệt); Chờ duyệt → Đã duyệt (duyệt) hoặc → Nháp (trả lại, kèm lý do); Nháp → Đã hủy; Đã duyệt → Đã hủy khi chưa có phiếu xuất đã xuất, chưa nhận hàng chuyển công trình và không còn phiếu xuất hay phiếu chuyển tới chưa xong; Đã duyệt → Đang thực hiện tự động khi phiếu xuất đầu tiên hoặc phiếu chuyển công trình đầu tiên tới hợp đồng ghi sổ; → Thanh lý do change sau. Chuyển khác SHALL bị từ chối.

#### Scenario: Gửi duyệt
- **WHEN** `quocbao` bấm "Gửi Giám đốc duyệt" trên hợp đồng Nháp đủ dữ liệu
- **THEN** hợp đồng sang Chờ duyệt **AND** D4 tăng đếm "Chờ duyệt" lên 1

#### Scenario: Trả lại
- **WHEN** Giám đốc trả lại hợp đồng Chờ duyệt với lý do "Giá kích tăng U thấp quá, báo lại 450 ₫"
- **THEN** hợp đồng về Nháp **AND** D5 hiện lý do trả lại cho người lập

#### Scenario: Trả lại thiếu lý do
- **WHEN** Giám đốc bấm "Từ chối" mà để trống lý do
- **THEN** hệ thống từ chối với "Bạn ghi lý do để người lập biết cần sửa gì." và hợp đồng vẫn Chờ duyệt

#### Scenario: Hủy báo giá khách không lấy
- **WHEN** `quocbao` hủy hợp đồng Nháp với lý do "Khách thuê chỗ khác"
- **THEN** hợp đồng sang Đã hủy, giữ số, D4 xếp vào nhóm "Đã kết thúc"

#### Scenario: Chuyển không hợp lệ
- **WHEN** có lệnh gửi duyệt cho hợp đồng đang Đã duyệt
- **THEN** hệ thống từ chối với "Hợp đồng đã được duyệt nên không gửi duyệt lại được. Bạn lập phụ lục nếu cần đổi." và không đổi dữ liệu

#### Scenario: Phiếu xuất đầu tiên
- **WHEN** hợp đồng `112026/ANPHAT-MINHPHAT` Đã duyệt và thủ kho xác nhận phiếu xuất đầu tiên `PX-2026-001`
- **THEN** hợp đồng sang Đang thực hiện trong cùng lần ghi sổ **AND** D5 hiện trạng thái "Đang thực hiện"

#### Scenario: Phiếu chuyển công trình đầu tiên
- **WHEN** hợp đồng `112026/ANPHAT-MINHPHAT` Đã duyệt, chưa xuất lần nào, và `CCT-2026-004` chuyển hàng tới nó được ghi sổ
- **THEN** hợp đồng sang Đang thực hiện trong cùng lần ghi sổ

#### Scenario: Hủy hợp đồng còn phiếu xuất chưa xong
- **WHEN** hợp đồng Đã duyệt có `PX-2026-141` Chờ nhặt và Giám đốc hủy hợp đồng
- **THEN** hệ thống từ chối với "Hợp đồng còn phiếu xuất PX-2026-141 chưa xong. Bạn hủy phiếu xuất đó trước rồi hủy hợp đồng." và không đổi dữ liệu
