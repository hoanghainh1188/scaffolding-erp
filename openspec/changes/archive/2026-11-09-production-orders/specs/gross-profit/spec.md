## MODIFIED Requirements

### Requirement: Giá vốn và hao hụt khớp sổ kho
Tổng giá vốn và hao hụt của kỳ SHALL bằng: − (tổng giá trị mọi dòng sổ trong kỳ, trừ tồn đầu kỳ, nhập mua, điều chỉnh giá trị) + tổng chi phí **không đi qua sổ kho** của phiếu sửa, lệnh sửa và lệnh sản xuất ghi sổ trong kỳ. Chi phí đó gồm: chi phí gõ tay của phiếu đơn giản, công khoán của lệnh sửa, công khoán của lệnh sản xuất. Không gồm vật tư, nguyên liệu, đầu thừa. Xuất thuê, chuyển công trình, chuyển hàng bãi ↔ xưởng của lệnh sửa SHALL cộng ra 0.

#### Scenario: Đối chiếu một tháng
- **WHEN** tháng 10/2026 các dòng sổ (trừ tồn đầu, nhập mua, `ĐCG`) cộng −127.340.000 ₫ và chi phí sửa trên phiếu sửa đơn giản ghi sổ trong tháng là 600.000 ₫
- **THEN** tổng giá vốn và hao hụt tháng 10/2026 là 127.940.000 ₫

#### Scenario: Đối chiếu tháng có lệnh sửa
- **WHEN** tháng 11/2026 chỉ có lệnh `PSC-2026-031` ghi sổ (công 1.640.000 ₫, vật tư 585.000 ₫, lỗ hỏng hàng 0 ₫), dòng sổ của lệnh cộng +1.640.000 ₫ và dòng chuyển bãi → xưởng cộng 0 ₫
- **THEN** đẳng thức cho −1.640.000 + 1.640.000 = **0 ₫** = khoản Sửa chữa 0 ₫ **AND** nếu cộng cả vật tư 585.000 ₫ vào chi phí ngoài sổ thì đẳng thức lệch 585.000 ₫ (lỗi trừ hai lần mà test phải bắt)

#### Scenario: Đối chiếu tháng có lệnh sản xuất
- **WHEN** tháng 11/2026 chỉ có lệnh `LSX-2026-004` ghi sổ: `PRODUCTION_OUT` nguyên liệu −41.119.500 ₫, `PRODUCTION_IN` thành phẩm +45.867.000 ₫, `PRODUCTION_IN` đầu thừa +352.500 ₫, công khoán 5.100.000 ₫
- **THEN** dòng sổ của lệnh cộng +5.100.000 ₫ **AND** đẳng thức cho −5.100.000 + 5.100.000 = **0 ₫** **AND** tổng giá vốn và hao hụt tháng 11/2026 là 0 ₫
- **AND** nếu cộng cả nguyên liệu 41.119.500 ₫ vào chi phí ngoài sổ thì đẳng thức lệch 41.119.500 ₫ (lỗi mà test phải bắt)

## ADDED Requirements

### Requirement: Sản xuất không là giá vốn
Ghi sổ lệnh sản xuất SHALL không tạo khoản giá vốn hay hao hụt nào trong kỳ. Nguyên liệu, công và phần dùng vượt định mức nằm trong giá thành phẩm Mới. Chúng vào lợi nhuận khi thành phẩm rời kho theo giá BQ. Đầu thừa nhập Phế liệu SHALL không thành lãi, vì giá trị đó đã trừ khỏi giá thành phẩm. Báo cáo SHALL ghi dưới bảng "Công sản xuất đã chi trong kỳ" = tổng công khoán của lệnh sản xuất ghi sổ trong kỳ, theo tháng của lần ghi sổ.

#### Scenario: Tháng chỉ có lệnh sản xuất
- **WHEN** tháng 11/2026 chỉ có lệnh `LSX-2026-004` ghi sổ ngày 09/11/2026 (công 5.100.000 ₫, dùng vượt 1.349.500 ₫)
- **THEN** mọi khoản giá vốn và hao hụt tháng 11/2026 là 0 ₫ **AND** dưới bảng ghi "Công sản xuất đã chi trong kỳ: 5.100.000 ₫"

#### Scenario: Bán thành phẩm sau đó
- **WHEN** tháng 12/2026 phiếu xuất bán 10 `GG-K17` Mới khi giá BQ Mới là 326.605 ₫ (chỉ có hàng của `LSX-2026-004`)
- **THEN** giá vốn hàng bán tháng 12/2026 tăng 3.266.050 ₫

#### Scenario: Thành phẩm vào hàng cho thuê, nguyên liệu và sắt vụn thì không
- **WHEN** `LSX-2026-004` nhập 300 cái Mới (nhóm Thiết bị) và 47 kg `PL-SATVUN` (nhóm Vật tư) về `BAI-01` ngày 09/11/2026
- **THEN** hàng cho thuê bình quân từ 09/11/2026 tính thêm 300 cái thành phẩm **AND** không tính nguyên liệu xuất ra hay 47 kg sắt vụn
