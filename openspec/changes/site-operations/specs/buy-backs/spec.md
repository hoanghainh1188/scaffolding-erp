# Spec Delta

## Purpose

Phiếu mua lại ghi việc khách mua luôn hàng đang thuê ở công trình: hàng thành hàng bán, ra khỏi sổ ở vị trí công trình, thôi tính thuê và thành tiền phải thu sau khi Giám đốc duyệt.

## ADDED Requirements

### Requirement: Phiếu mua lại của hợp đồng thuê
Mỗi phiếu mua lại SHALL thuộc đúng một hợp đồng thuê Đang thực hiện. Số phiếu SHALL có dạng `MLA-<năm>-<số 3 chữ số>`, đếm bằng bảng đếm chứng từ. Phiếu SHALL lưu lý do (bắt buộc, tối đa 500 ký tự) và các dòng (mã, số mua, đơn giá).

#### Scenario: Lập phiếu mua lại
- **WHEN** `quocbao` lập phiếu cho `102026/ANPHAT-MINHPHAT` với 20 `TR16`, 50 `BCH`, lý do "Ty ren, bát chuồn đã đổ bê tông, không tháo ra được"
- **THEN** hệ thống tạo `MLA-2026-003` Chờ duyệt gắn hợp đồng đó **AND** chưa có dòng sổ nào

#### Scenario: Hợp đồng bán
- **WHEN** gửi phiếu mua lại cho hợp đồng bán `112026/ANPHAT-PDLONG`
- **THEN** hệ thống từ chối với "Chỉ mua lại hàng đang thuê của hợp đồng thuê đang thực hiện."

#### Scenario: Thiếu lý do
- **WHEN** `quocbao` lưu phiếu mà để trống lý do
- **THEN** hệ thống từ chối với "Bạn ghi lý do khách mua lại."

### Requirement: Không mua lại quá số đang ở công trình
Với mỗi mã, số mua SHALL lớn hơn 0, là số nguyên với mã tính theo cái, và không vượt số đang ở công trình của hợp đồng (Mới + Tốt). Hệ thống SHALL kiểm khi lưu và kiểm lại khi duyệt. Mã không có ở công trình SHALL bị chặn.

#### Scenario: Mua quá
- **WHEN** công trình đang có 120 `TR16` và phiếu mua 130
- **THEN** hệ thống từ chối với "TR16: số mua (130 cái) nhiều hơn số đang ở công trình (120 cái)."

#### Scenario: Hàng đã trả trước khi duyệt
- **WHEN** `MLA-2026-003` Chờ duyệt mua 20 `TR16`, rồi phiếu thu hồi trả về bãi 110 `TR16` làm công trình còn 10, rồi `minhanh` duyệt
- **THEN** hệ thống từ chối với "TR16: số mua (20 cái) nhiều hơn số đang ở công trình (10 cái). Kinh doanh cần sửa phiếu." **AND** phiếu vẫn Chờ duyệt

#### Scenario: Mã không có ở công trình
- **WHEN** phiếu có 5 `MAM1,6` mà công trình không có `MAM1,6`
- **THEN** hệ thống từ chối với "MAM1,6 không có ở công trình của hợp đồng 102026/ANPHAT-MINHPHAT."

### Requirement: Đơn giá mua lại
Đơn giá mỗi dòng SHALL điền sẵn bằng giá mất của mã trên bản hợp đồng đang áp dụng hôm nay. Kinh doanh SHALL sửa được (số nguyên ≥ 0). Dòng có giá khác giá hợp đồng SHALL hiện nhãn "khác giá hợp đồng" kèm giá hợp đồng. Mã chưa có giá mất SHALL để trống và phải nhập trước khi lưu. Thành tiền = số × đơn giá; tổng = cộng các dòng.

#### Scenario: Giá điền sẵn
- **WHEN** hợp đồng có giá mất `TR16` 35.000 ₫, `BCH` 12.000 ₫ và phiếu mua 20 `TR16`, 50 `BCH`
- **THEN** dòng `TR16` 700.000 ₫, dòng `BCH` 600.000 ₫, tổng 1.300.000 ₫ **AND** hai dòng ghi "giá mất trên hợp đồng"

#### Scenario: Sửa giá
- **WHEN** `quocbao` sửa đơn giá `TR16` thành 30.000 ₫
- **THEN** dòng `TR16` 600.000 ₫ **AND** hiện "khác giá hợp đồng (35.000 ₫)"

#### Scenario: Chưa có giá mất
- **WHEN** hợp đồng không có giá mất `TR16` và `quocbao` lưu phiếu để trống đơn giá
- **THEN** hệ thống từ chối với "TR16 chưa có giá mất trên hợp đồng. Bạn nhập đơn giá mua lại."

#### Scenario: Giá 0
- **WHEN** Giám đốc đồng ý cho khách 5 `BCH` không tính tiền và `quocbao` nhập đơn giá 0 ₫
- **THEN** dòng `BCH` 0 ₫ được lưu **AND** hiện "khác giá hợp đồng (12.000 ₫)"

### Requirement: Trạng thái phiếu mua lại
Phiếu SHALL có một trong: Chờ duyệt, Đã duyệt, Đã từ chối. Chỉ Giám đốc SHALL duyệt hoặc từ chối. Từ chối SHALL bắt buộc lý do và không quay lại. Khi Chờ duyệt, Kinh doanh SHALL sửa được dòng, giá, lý do (gửi kèm `updatedAt`, lệch thì 409). Phiếu Đã duyệt, Đã từ chối SHALL bị khóa.

#### Scenario: Từ chối
- **WHEN** `minhanh` từ chối `MLA-2026-003` với lý do "Đục bê tông lấy ra được, cho trả về"
- **THEN** phiếu Đã từ chối **AND** không có dòng sổ nào **AND** hàng vẫn đang ở công trình và vẫn tính thuê

#### Scenario: Sửa phiếu đã duyệt
- **WHEN** có lệnh sửa `MLA-2026-003` Đã duyệt
- **THEN** hệ thống từ chối với "Phiếu mua lại đã duyệt nên không sửa được."

#### Scenario: Duyệt hai lần cùng lúc
- **WHEN** hai lệnh duyệt `MLA-2026-003` đến cùng lúc
- **THEN** đúng một lệnh duyệt và ghi sổ **AND** lệnh kia nhận "Phiếu MLA-2026-003 đã được duyệt." **AND** sổ chỉ có một bộ dòng của phiếu

### Requirement: Duyệt khi nhà thầu đang nợ quá hạn
Khi nhà thầu của hợp đồng đang nợ quá hạn, D6c SHALL hiện cảnh báo; duyệt SHALL vẫn được nhưng bắt buộc lý do duyệt, lưu cùng lần duyệt, như duyệt hợp đồng (0.2 #15).

#### Scenario: Nợ quá hạn không ghi lý do
- **WHEN** Minh Phát đang nợ quá hạn 96.000.000 ₫ (7 ngày) và `minhanh` duyệt `MLA-2026-003` không ghi lý do duyệt
- **THEN** hệ thống từ chối với "Nhà thầu đang nợ quá hạn 96.000.000 ₫ (7 ngày). Bạn cần ghi lý do duyệt."

### Requirement: Duyệt thì ghi sổ bán ở công trình
Duyệt SHALL chạy trong một transaction (trạng thái phiếu, sổ kho, nhật ký). Mỗi (mã + tình trạng) SHALL có dòng `SALE_OUT` ở vị trí công trình của hợp đồng, đơn giá = giá BQ hiện tại, rút Mới trước rồi Tốt. Giá BQ SHALL không đổi; tổng giá trị kho giảm đúng số × giá BQ. Ngày nghiệp vụ SHALL là ngày duyệt theo giờ Việt Nam.

#### Scenario: Ghi sổ khi duyệt
- **WHEN** công trình có 120 `TR16` Tốt (giá BQ 18.000 ₫) và 300 `BCH` Tốt (5.000 ₫), và `minhanh` duyệt `MLA-2026-003` ngày 05/11/2026
- **THEN** sổ có `SALE_OUT` −20 `TR16` Tốt (−360.000 ₫) và −50 `BCH` Tốt (−250.000 ₫) ở công trình, ngày 05/11/2026 **AND** giá BQ `TR16` Tốt vẫn 18.000 ₫ **AND** `npm run inventory:check` in "Sổ kho khớp: 0 lệch"

#### Scenario: Rút Mới trước
- **WHEN** công trình có 5 `TR16` Mới và 115 Tốt, và phiếu mua 20 `TR16`
- **THEN** sổ có `SALE_OUT` −5 Mới và −15 Tốt

### Requirement: Thôi tính thuê từ ngày duyệt
Hàng mua lại SHALL tính như trả vào ngày duyệt: tính thuê đến hết ngày duyệt, từ hôm sau không tính. Phiếu Chờ duyệt hay Đã từ chối SHALL không làm đổi tiền thuê. Thuê tối thiểu 45 ngày SHALL áp như hàng trả về.

#### Scenario: Thôi tính thuê
- **WHEN** 20 `TR16` (giá ngày 100 ₫) xuất ngày 01/09/2026 và `MLA-2026-003` được duyệt ngày 05/11/2026
- **THEN** số ngày thực của 20 cái đó là 65 (05/11 − 01/09) **AND** tiền thuê 1 ngày từ 06/11/2026 giảm 2.000 ₫

#### Scenario: Lập ngày 04, duyệt ngày 05
- **WHEN** `quocbao` lập `MLA-2026-003` ngày 04/11/2026 và `minhanh` duyệt ngày 05/11/2026
- **THEN** ngày thôi tính thuê là 05/11/2026 **AND** ngày 05/11 vẫn tính thuê

### Requirement: Số liệu phiếu đã duyệt cho công nợ
Khi duyệt, phiếu SHALL lưu tiền bán (tổng các dòng), ngày duyệt, người duyệt và hạn trả = ngày duyệt + số ngày được nợ của bản hợp đồng đang áp dụng tại ngày duyệt. Hệ thống SHALL không lưu số cộng dồn nào khác; công nợ đọc từ các phiếu Đã duyệt.

#### Scenario: Hạn trả
- **WHEN** hợp đồng cho nợ 30 ngày và `MLA-2026-003` tổng 1.300.000 ₫ được duyệt ngày 05/11/2026
- **THEN** phiếu lưu tiền bán 1.300.000 ₫, ngày duyệt 05/11/2026, hạn trả 05/12/2026

### Requirement: Quyền với phiếu mua lại
Lập và sửa phiếu SHALL cần quyền sửa hợp đồng thuê (vai trò và phạm vi hợp đồng của tài khoản Kinh doanh). Duyệt, từ chối SHALL chỉ Giám đốc. Xem SHALL cần quyền xem hợp đồng thuê. Server SHALL kiểm mọi lệnh và trả 403 khi thiếu quyền.

#### Scenario: Kinh doanh duyệt
- **WHEN** `quocbao` gửi `POST /api/buy-backs/<id>/approve`
- **THEN** API trả 403 **AND** phiếu vẫn Chờ duyệt

#### Scenario: Kinh doanh chỉ bán lập phiếu
- **WHEN** `thuyvy` (phạm vi "Chỉ bán") gửi `POST /api/buy-backs`
- **THEN** API trả 403

#### Scenario: Kế toán xem
- **WHEN** `thuha` mở `/sales/buy-backs/MLA-2026-003`
- **THEN** trang hiện phiếu chỉ xem, không có nút sửa, duyệt, từ chối

### Requirement: Nhật ký phiếu mua lại
Mỗi lệnh Tạo, Sửa (chỉ khi có trường đổi), Duyệt, Từ chối phiếu mua lại SHALL ghi đúng một dòng nhật ký loại Phiếu mua lại trong cùng transaction. Lệnh bị từ chối SHALL không ghi.

#### Scenario: Duyệt
- **WHEN** `minhanh` duyệt `MLA-2026-003`
- **THEN** có đúng một dòng Duyệt `MLA-2026-003` "Mua lại 20 ty ren, 50 bát chuồn · 1.300.000 ₫" **AND** không có dòng nhật ký riêng cho sổ kho

#### Scenario: Giá khác hợp đồng
- **WHEN** `quocbao` tạo phiếu có đơn giá `TR16` 30.000 ₫ khác giá hợp đồng 35.000 ₫
- **THEN** dòng Tạo gắn cờ "Có xác nhận bất thường"

### Requirement: Màn D6c Phiếu mua lại
D6c SHALL mở từ D6 (nút "Khách mua lại") và hiện nguồn (nhà thầu, công trình, hợp đồng thuê), lý do, bảng hàng (số đang ở công trình, số mua, đơn giá, thành tiền), tổng tiền bán, và khối "Khi duyệt" (dòng sổ sẽ ghi, ngày thôi tính thuê, tiền thuê 1 ngày giảm). Với Giám đốc và phiếu Chờ duyệt, D6c SHALL có thanh duyệt với nút "Từ chối" và "Duyệt <tổng>".

#### Scenario: Giám đốc mở phiếu chờ duyệt
- **WHEN** `minhanh` mở `MLA-2026-003` Chờ duyệt do Quốc Bảo gửi lúc 16:20 04/11/2026
- **THEN** trang có "Phiếu mua lại đang chờ bạn duyệt", "Quốc Bảo gửi lúc 16:20 04/11/2026" và nút "Duyệt 1.300.000 ₫"

#### Scenario: Khối khi duyệt
- **WHEN** mở `MLA-2026-003` mua 20 `TR16` (100 ₫/ngày) và 50 `BCH` (20 ₫/ngày)
- **THEN** khối "Khi duyệt" hiện "Sổ kho: ra 20 TR16, 50 BCH ở công trình" và "Tiền thuê 1 ngày ở An Phú giảm 3.000 ₫"
