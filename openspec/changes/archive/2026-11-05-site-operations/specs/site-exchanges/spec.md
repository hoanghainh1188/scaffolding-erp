# Spec Delta

## Purpose

Đổi hàng tại công trình trong một chuyến xe: một đợt xuất giao mã mới và một phiếu thu hồi nhận mã cũ về bãi, nối với nhau, không có chứng từ riêng.

## ADDED Requirements

### Requirement: Lập đổi hàng tạo đợt xuất và chờ thu hồi
Trên D6d, "Tạo đợt xuất + chờ thu hồi" SHALL tạo trong một transaction: một phiếu xuất Chờ nhặt (mã giao ra, từ một bãi) theo đúng quy tắc phiếu xuất thuê, và một lần đổi hàng "Chờ thu hồi" gắn phiếu xuất đó với danh sách mã nhận về và số dự kiến. Chỉ hợp đồng thuê Đang thực hiện SHALL lập được đổi hàng.

#### Scenario: Đổi chéo dài lấy chéo ngắn
- **WHEN** `quocbao` lập đổi hàng cho `102026/ANPHAT-MINHPHAT`: giao 100 `CHEO1,2` từ `BAI-01`, nhận về dự kiến 100 `CHEO1,7`
- **THEN** có `PX-2026-152` Đợt 4 Chờ nhặt 100 `CHEO1,2` **AND** một lần đổi hàng Chờ thu hồi gắn `PX-2026-152` với dự kiến 100 `CHEO1,7` **AND** không có dòng sổ nào

#### Scenario: Hợp đồng đã duyệt chưa xuất
- **WHEN** lập đổi hàng cho hợp đồng thuê Đã duyệt chưa có hàng ở công trình
- **THEN** hệ thống từ chối với "Chỉ đổi hàng cho hợp đồng thuê đang thực hiện."

### Requirement: Mã giao ra và mã nhận về
Mã giao ra SHALL có trên bản hợp đồng đang áp dụng (như phiếu xuất). Mã nhận về SHALL đang ở công trình của hợp đồng và số dự kiến không vượt số đang ở công trình. Phải có ít nhất một mã giao ra và một mã nhận về; số dự kiến SHALL lớn hơn 0.

#### Scenario: Mã giao ra chưa có trên hợp đồng
- **WHEN** giao 100 `CHEO1,2` mà bản đang áp dụng chưa có `CHEO1,2`
- **THEN** hệ thống từ chối với "Mã CHEO1,2 chưa có trên hợp đồng. Bạn lập phụ lục nếu khách cần thêm mã này." (câu của phiếu xuất)

#### Scenario: Nhận về quá số ở công trình
- **WHEN** công trình đang có 260 `CHEO1,7` và dự kiến nhận về 300
- **THEN** hệ thống từ chối với "CHEO1,7: dự kiến nhận về (300 cái) nhiều hơn số đang ở công trình (260 cái)."

#### Scenario: Chỉ giao không nhận
- **WHEN** lệnh lập đổi hàng không có mã nhận về
- **THEN** hệ thống từ chối với "Đổi hàng cần ít nhất một mã nhận về. Chỉ giao thêm thì tạo đợt xuất thường."

### Requirement: Đợt xuất của đổi hàng đi luồng phiếu xuất
Phiếu xuất của đổi hàng SHALL theo mọi quy tắc phiếu xuất thuê: nhặt trên M5, "Xác nhận xe rời bãi" ghi sổ, ngày giao = ngày ghi sổ, tính thuê từ hôm sau, cước và biển số như đợt xuất. Sửa, rút về phiếu Chờ nhặt SHALL như phiếu xuất. Hủy phiếu xuất khi lần đổi còn Chờ thu hồi SHALL hủy luôn lần đổi trong cùng transaction.

#### Scenario: Xe rời bãi
- **WHEN** `vantung` xác nhận `PX-2026-152` xuất 100 `CHEO1,2` ngày 06/11/2026
- **THEN** `CHEO1,2` tính thuê từ 07/11/2026 **AND** lần đổi vẫn Chờ thu hồi

#### Scenario: Hủy đợt xuất
- **WHEN** `quocbao` hủy `PX-2026-152` Chờ nhặt với lý do "Khách hoãn đổi"
- **THEN** `PX-2026-152` Đã hủy **AND** lần đổi Đã hủy

### Requirement: Phiếu thu hồi nối vào lần đổi
Khi hợp đồng có lần đổi Chờ thu hồi, M4 SHALL hiện "Đổi hàng PX-…: dự kiến nhận <số> <mã>" và ô "Phiếu này là hàng đổi" đã tích sẵn. Lưu phiếu thu hồi có ô đó SHALL nối phiếu vào lần đổi trong cùng transaction và đưa lần đổi sang Đã xong. Phiếu thu hồi SHALL ghi sổ, chia tình trạng, sinh phiếu đền bù như phiếu thu hồi thường; số dự kiến SHALL không ràng buộc số đếm.

#### Scenario: Thu hồi đúng dự kiến
- **WHEN** xe về ngày 06/11/2026, `vantung` mở M4 của An Phú, đếm 95 `CHEO1,7` Tốt và 5 Chờ sửa, để ô "Phiếu này là hàng đổi" tích rồi lưu
- **THEN** có `PTH-2026-080` ngày trả 06/11/2026 nối với lần đổi của `PX-2026-152` **AND** lần đổi Đã xong **AND** có phiếu đền bù cho 5 `CHEO1,7` Chờ sửa

#### Scenario: Đếm khác dự kiến
- **WHEN** dự kiến nhận 100 `CHEO1,7` nhưng thủ kho đếm được 92
- **THEN** phiếu thu hồi được lưu với 92 **AND** D6 hiện "Đổi hàng: dự kiến 100, nhận 92 CHEO1,7"

#### Scenario: Bỏ tích
- **WHEN** thủ kho bỏ tích ô "Phiếu này là hàng đổi" rồi lưu
- **THEN** phiếu thu hồi không nối lần đổi nào **AND** lần đổi vẫn Chờ thu hồi

#### Scenario: Nối lần đổi của hợp đồng khác
- **WHEN** lệnh lưu phiếu thu hồi của `112026/ANPHAT-MINHPHAT` gửi mã lần đổi của `102026/ANPHAT-MINHPHAT`
- **THEN** hệ thống từ chối với "Lần đổi hàng không thuộc hợp đồng này." **AND** không có dòng sổ nào

#### Scenario: Lần đổi đã nối phiếu khác
- **WHEN** hai điện thoại cùng lưu hai phiếu thu hồi nối cùng một lần đổi
- **THEN** đúng một phiếu nối vào lần đổi **AND** phiếu kia bị từ chối với "Lần đổi hàng này đã nhận phiếu thu hồi PTH-2026-080." và không ghi sổ

### Requirement: Tiền thuê ngày đổi
Mã giao ra SHALL tính thuê từ hôm sau ngày giao của phiếu xuất; mã nhận về SHALL tính thuê đến hết ngày trả của phiếu thu hồi. Đổi hàng SHALL không có quy tắc tiền thuê riêng.

#### Scenario: Cùng một ngày
- **WHEN** `PX-2026-152` xuất 100 `CHEO1,2` (280 ₫/ngày) và `PTH-2026-080` nhận 100 `CHEO1,7` (300 ₫/ngày), cả hai ngày 06/11/2026
- **THEN** ngày 06/11 tính 100 `CHEO1,7` **AND** từ 07/11 tính 100 `CHEO1,2` **AND** tiền thuê 1 ngày giảm 2.000 ₫

#### Scenario: Xe về hôm sau
- **WHEN** `PX-2026-152` xuất ngày 06/11/2026 và `PTH-2026-080` ghi sổ ngày 07/11/2026
- **THEN** ngày 07/11 tính cả 100 `CHEO1,2` và 100 `CHEO1,7`

### Requirement: Bỏ chờ thu hồi
Văn phòng SHALL bỏ được lần đổi Chờ thu hồi (bắt buộc lý do) khi khách không trả hàng cũ; phiếu xuất của lần đổi giữ nguyên. Lần đổi Đã xong, Đã hủy SHALL không bỏ được.

#### Scenario: Khách giữ hàng cũ
- **WHEN** `PX-2026-152` đã xuất, khách giữ lại `CHEO1,7`, `quocbao` bỏ chờ thu hồi với lý do "Khách giữ chéo dài dùng tiếp"
- **THEN** lần đổi Đã hủy **AND** `PX-2026-152` vẫn Đã xuất **AND** 100 `CHEO1,7` vẫn đang ở công trình và vẫn tính thuê

### Requirement: Đổi hàng trên D6
Dòng thời gian D6 SHALL gắn nhãn "Đổi hàng" cho phiếu xuất và phiếu thu hồi của một lần đổi và mỗi dòng có liên kết tới phiếu kia (hoặc "Chờ thu hồi" khi chưa có). D6d SHALL hiện trước tiền thuê 1 ngày sau khi đổi và hai chứng từ sẽ tạo.

#### Scenario: Dòng thời gian
- **WHEN** `PX-2026-152` Đã xuất và lần đổi còn Chờ thu hồi
- **THEN** dòng của `PX-2026-152` có nhãn "Đổi hàng" và "Chờ thu hồi 100 CHEO1,7"

#### Scenario: Đổi xong
- **WHEN** `PTH-2026-080` đã nối vào lần đổi
- **THEN** dòng `PX-2026-152` có liên kết "Thu hồi PTH-2026-080" **AND** dòng `PTH-2026-080` có liên kết "Đổi hàng · PX-2026-152"

#### Scenario: Xem trước trên D6d
- **WHEN** `quocbao` nhập giao 100 `CHEO1,2` (280 ₫) và nhận 100 `CHEO1,7` (300 ₫)
- **THEN** D6d hiện "Tiền thuê 1 ngày sau khi đổi −2.000 ₫" và "100 × 300 ₫ → 100 × 280 ₫"

### Requirement: Quyền và nhật ký đổi hàng
Lập đổi hàng và bỏ chờ thu hồi SHALL cần quyền sửa hợp đồng thuê (vai trò và phạm vi). Nhặt, xác nhận xe rời bãi, lưu thu hồi SHALL theo quyền của phiếu xuất và phiếu thu hồi. Lập đổi hàng SHALL ghi đúng một dòng nhật ký Tạo của phiếu xuất có tóm tắt "Đổi hàng"; bỏ chờ thu hồi SHALL ghi đúng một dòng Sửa của phiếu xuất đó với tóm tắt "Bỏ chờ thu hồi: <lý do>".

#### Scenario: Thủ kho lập đổi hàng
- **WHEN** `vantung` gửi `POST /api/exchanges`
- **THEN** API trả 403 **AND** không có phiếu xuất nào được tạo

#### Scenario: Nhật ký lập đổi hàng
- **WHEN** `quocbao` lập đổi hàng tạo `PX-2026-152`
- **THEN** có đúng một dòng Tạo `PX-2026-152` "Đổi hàng · Đợt 4 · giao 100 CHEO1,2 · nhận về dự kiến 100 CHEO1,7"
