# Spec Delta

## MODIFIED Requirements

### Requirement: Thao tác trên chứng từ được ghi
Mỗi lệnh làm đổi chứng từ SHALL ghi đúng một dòng nhật ký cho mỗi thao tác: đơn thu mua (Tạo, Sửa, Đặt đơn, Hủy, Đóng đơn, Xóa nháp), phiếu nhập (Ghi sổ), phiếu sửa chữa (Tạo, Sửa, Xóa nháp, Ghi sổ), kiểm kê (Tạo, Gửi, Duyệt, Trả lại, Yêu cầu đếm lại, Hủy), phiếu điều chỉnh, tồn đầu kỳ và phiếu điều chỉnh giá trị (Tạo, Sửa, Xóa nháp, Gửi, Duyệt, Trả lại), hợp đồng và phụ lục hợp đồng (Tạo, Sửa, Gửi duyệt, Duyệt, Trả lại, Hủy). Tóm tắt của phiếu điều chỉnh giá trị SHALL ghi chứng từ gốc, số dòng và tổng chênh lệch. Lọc theo loại chứng từ trên D18 SHALL có Hợp đồng và Phụ lục hợp đồng.

#### Scenario: Lưu đơn ghi hai thao tác
- **WHEN** `lanphuong` bấm "Lưu đơn" trên D3 tạo `PO-2026-056` và đặt đơn luôn
- **THEN** có hai dòng `PO-2026-056`: Tạo "Hòa Phát mẫu · 5 mã hàng · 52.942.500 ₫" và Đặt đơn "Dự kiến về 30/10/2026"

#### Scenario: Ghi sổ phiếu sửa chữa
- **WHEN** `thuha` ghi sổ `PSC-2026-024`: 56 cái về Tốt, 4 phế liệu, chi phí 2.220.000 ₫
- **THEN** có một dòng Ghi sổ `PSC-2026-024` với tóm tắt "56 cái về Tốt, 4 phế liệu · chi phí 2.220.000 ₫"

#### Scenario: Xóa nháp phiếu sửa
- **WHEN** `thuha` xóa nháp `PSC-2026-025` có 2 mã hàng
- **THEN** có một dòng Xóa nháp `PSC-2026-025` "Nháp có 2 mã hàng, chưa ghi sổ" **AND** dòng vẫn còn dù phiếu đã mất

#### Scenario: Gửi lại cùng mã nháp không ghi thêm
- **WHEN** điện thoại của `vantung` gửi lại phiếu nhập cùng mã nháp sau khi `PN-2026-093` đã ghi sổ
- **THEN** vẫn chỉ có một dòng Ghi sổ `PN-2026-093`

#### Scenario: Duyệt phiếu điều chỉnh giá trị
- **WHEN** Giám đốc duyệt `ĐCG-2026-001` sửa chi phí `PN-2026-094`, 2 dòng, tổng −31.500.000 ₫
- **THEN** có một dòng Duyệt `ĐCG-2026-001` với tóm tắt "Sửa PN-2026-094 · ghi sổ 2 dòng điều chỉnh giá · −31.500.000 ₫"

#### Scenario: Trả lại hợp đồng
- **WHEN** Giám đốc trả lại `112026/ANPHAT-MINHPHAT` với lý do "Giá kích tăng U thấp quá, báo lại 450 ₫"
- **THEN** có một dòng Trả lại loại Hợp đồng `112026/ANPHAT-MINHPHAT` với tóm tắt là lý do đó

#### Scenario: Lọc phụ lục trên D18
- **WHEN** Giám đốc lọc D18 theo loại Phụ lục hợp đồng
- **THEN** bảng chỉ hiện các dòng có mã dạng `112026/ANPHAT-MINHPHAT/01`
