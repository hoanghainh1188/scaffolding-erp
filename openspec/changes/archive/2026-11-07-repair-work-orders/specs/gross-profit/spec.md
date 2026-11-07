## ADDED Requirements

### Requirement: Tháng của lệnh sửa theo lần ghi sổ
Lỗ hỏng hàng và chi phí sửa đã chi của một lệnh SHALL vào tháng của **lần ghi sổ lệnh**, không theo ngày xưởng nhận hàng hay ngày hủy. Dòng chuyển hàng bãi ↔ xưởng của lệnh SHALL không vào khoản giá vốn và hao hụt nào (cộng ra 0).

#### Scenario: Nhận tháng 10, ghi sổ tháng 11
- **WHEN** lệnh nhận hàng ngày 30/10/2026 và ghi sổ ngày 02/11/2026 với chi phí sửa 2.225.000 ₫, lỗ hỏng hàng 0 ₫
- **THEN** "Chi phí sửa đã chi" tháng 10/2026 không đổi **AND** tháng 11/2026 tăng 2.225.000 ₫

## MODIFIED Requirements

### Requirement: Sửa chữa không trừ hai lần
Chi phí sửa đã cộng vào giá hàng Tốt (0.2 #23) SHALL không trừ ngay khi ghi sổ phiếu sửa hay lệnh sửa. Nó SHALL vào lợi nhuận khi hàng đó rời kho theo giá BQ (bán, mất, trả về hỏng lại). Khoản "Sửa chữa" của kỳ SHALL bằng tổng **lỗ hỏng hàng** của phiếu sửa và lệnh sửa ghi sổ trong kỳ. Báo cáo SHALL ghi kèm "chi phí sửa đã chi trong kỳ" = chi phí gõ tay của phiếu đơn giản + công và vật tư của lệnh. Vật tư xuất cho sửa SHALL không vào khoản giá vốn và hao hụt nào: giá trị của nó đã nằm trong hàng Tốt.

#### Scenario: Trả về Chờ sửa, sửa, rồi mất
- **WHEN** công ty chỉ có 10 `H1,7` Tốt giá BQ 400.000 ₫ (đều ở công trình); tháng 10 trả về 10 cái Chờ sửa (giá BQ Chờ sửa 250.000 ₫); tháng 11 phiếu sửa 10 cái, sửa xong 10, chi phí 500.000 ₫ (vào Tốt 300.000 ₫/cái); tháng 12 10 cái này mất ở công trình
- **THEN** giảm giá trị tháng 10 là 1.500.000 ₫; khoản Sửa chữa tháng 11 là 0 ₫ kèm "chi phí sửa đã chi 500.000 ₫"; hàng mất tháng 12 là 3.000.000 ₫
- **AND** tổng 3 tháng là 4.500.000 ₫ = giá trị ban đầu 4.000.000 ₫ + chi phí sửa 500.000 ₫, không trừ 500.000 ₫ lần thứ hai

#### Scenario: Lệnh có vật tư, rồi hàng mất
- **WHEN** tháng 11 lệnh sửa 10 `H1,7` Chờ sửa (B 250.000 ₫), sửa xong 10, công 300.000 ₫, vật tư 200.000 ₫ (vào Tốt 300.000 ₫/cái); tháng 12 10 cái này mất ở công trình
- **THEN** khoản Sửa chữa tháng 11 là 0 ₫ kèm "chi phí sửa đã chi 500.000 ₫" **AND** vật tư 200.000 ₫ không xuất hiện ở khoản nào của tháng 11 **AND** hàng mất tháng 12 là 3.000.000 ₫, không trừ vật tư lần thứ hai

#### Scenario: Cả dòng hỏng hết
- **WHEN** phiếu sửa ghi sổ 15/11/2026 có dòng `GG-M16` lấy 5, sửa xong 0, phế liệu 5, lỗ hỏng hàng 600.000 ₫
- **THEN** khoản Sửa chữa tháng 11/2026 tăng 600.000 ₫

#### Scenario: Có phần hỏng nhưng còn hàng sửa xong
- **WHEN** phiếu sửa `GG-K17` sửa xong 36, phế liệu 4, phần hỏng 235.000 ₫, chi phí 1.980.000 ₫
- **THEN** khoản Sửa chữa của phiếu là 0 ₫ **AND** chi phí sửa đã chi tăng 1.980.000 ₫

### Requirement: Giá vốn và hao hụt khớp sổ kho
Tổng giá vốn và hao hụt của kỳ SHALL bằng: − (tổng giá trị mọi dòng sổ trong kỳ, trừ tồn đầu kỳ, nhập mua, điều chỉnh giá trị) + tổng chi phí sửa **không đi qua sổ kho** của phiếu sửa và lệnh sửa ghi sổ trong kỳ (chi phí gõ tay của phiếu đơn giản, công khoán của lệnh; không gồm vật tư). Xuất thuê, chuyển công trình, chuyển hàng bãi ↔ xưởng của lệnh SHALL cộng ra 0.

#### Scenario: Đối chiếu một tháng
- **WHEN** tháng 10/2026 các dòng sổ (trừ tồn đầu, nhập mua, `ĐCG`) cộng −127.340.000 ₫ và chi phí sửa trên phiếu sửa đơn giản ghi sổ trong tháng là 600.000 ₫
- **THEN** tổng giá vốn và hao hụt tháng 10/2026 là 127.940.000 ₫

#### Scenario: Đối chiếu tháng có lệnh sửa
- **WHEN** tháng 11/2026 chỉ có lệnh `PSC-2026-031` ghi sổ (công 1.640.000 ₫, vật tư 585.000 ₫, lỗ hỏng hàng 0 ₫), dòng sổ của lệnh cộng +1.640.000 ₫ và dòng chuyển bãi → xưởng cộng 0 ₫
- **THEN** đẳng thức cho −1.640.000 + 1.640.000 = **0 ₫** = khoản Sửa chữa 0 ₫ **AND** nếu cộng cả vật tư 585.000 ₫ vào chi phí ngoài sổ thì đẳng thức lệch 585.000 ₫ (lỗi trừ hai lần mà test phải bắt)
