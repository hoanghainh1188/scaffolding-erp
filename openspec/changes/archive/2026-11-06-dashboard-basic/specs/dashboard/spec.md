## Purpose

Màn D1 Tổng quan trên Desktop: câu chào, việc chờ duyệt, công nợ quá hạn, doanh số, hàng ở ngoài, công trình rủi ro, tra nhanh một công trình, tồn kho theo tình trạng và top 5 nhà thầu, mỗi vai trò chỉ nhận khối mình được phép.

## ADDED Requirements

### Requirement: Trang Tổng quan chỉ đọc
Trang `/dashboard` SHALL mở cho người có quyền `dashboard.view` (Giám đốc, Kế toán, Kinh doanh), tính số từ dữ liệu hiện có mỗi lần mở và không ghi gì (không chứng từ, không dòng sổ kho, không dòng nhật ký). Mọi số SHALL khớp màn gốc tương ứng (D6, D7, D10, D14).

#### Scenario: Mở trang không ghi gì
- **WHEN** Giám đốc mở `/dashboard` hai lần liên tiếp
- **THEN** số dòng `inventory_ledger`, `activity_log` và mọi bảng chứng từ không đổi

#### Scenario: Thủ kho mở Tổng quan
- **WHEN** tài khoản `WAREHOUSE` mở `/dashboard`
- **THEN** hệ thống chuyển tới `/m`

### Requirement: Câu chào và số việc chờ
Tiêu đề trang SHALL là câu chào theo tên người dùng kèm số việc chờ: Giám đốc "Chào <tên>, hôm nay có N việc chờ bạn duyệt"; vai trò khác "Chào <tên>, có N việc đang chờ Giám đốc duyệt"; N = 0 thì "không có việc nào". Dòng dưới SHALL ghi thứ, ngày và "số liệu lúc HH:MM" giờ Việt Nam. N SHALL bằng đúng số dòng của khối Chờ duyệt.

#### Scenario: Câu chào Giám đốc
- **WHEN** Giám đốc "Minh Anh" mở trang lúc 06:45 ngày 06/11/2026 và có 1 hợp đồng, 1 phiếu đền bù, 1 phiếu mua lại, 1 phiên kiểm kê chờ duyệt
- **THEN** tiêu đề là "Chào Minh Anh, hôm nay có 4 việc chờ bạn duyệt" và dòng dưới là "Thứ Sáu, 06/11/2026 · số liệu lúc 06:45"
- **AND** khối Chờ duyệt có đúng 4 dòng

#### Scenario: Không có việc chờ
- **WHEN** Giám đốc mở trang và không có chứng từ nào chờ duyệt
- **THEN** tiêu đề là "Chào Minh Anh, hôm nay không có việc nào chờ bạn duyệt"

### Requirement: Khối chờ duyệt theo vai trò
Khối Chờ duyệt SHALL liệt kê chứng từ đang Chờ duyệt: hợp đồng và phụ lục, phiếu đền bù, phiếu mua lại, phiên kiểm kê đã gửi, phiếu điều chỉnh kho (số lượng, đầu kỳ, giá trị). Mỗi dòng có loại, số, nhà thầu hoặc vị trí, tóm tắt, số tiền, và mở đúng màn duyệt. Giám đốc: tiêu đề "Chờ bạn duyệt", cả 5 loại. Kế toán, Kinh doanh: "Đang chờ Giám đốc duyệt" (0.2 #94); Kế toán cả 5 loại, Kinh doanh chỉ hợp đồng / phụ lục trong `canContract`, đền bù và mua lại khi xem được hợp đồng thuê.

#### Scenario: Thứ tự và nội dung dòng
- **WHEN** hợp đồng thuê `112026/ANPHAT-MINHPHAT` (giá trị dự kiến 186.200.000 ₫) gửi duyệt 05/11/2026 và phiếu đền bù `ĐB-2026-017` 4.600.000 ₫ gửi duyệt 04/11/2026
- **THEN** khối hiện `ĐB-2026-017` trước (gửi sớm hơn), rồi `112026/ANPHAT-MINHPHAT`, mỗi dòng có số tiền
- **AND** bấm dòng hợp đồng mở `/sales/contracts/<id>`

#### Scenario: Kinh doanh chỉ thấy phạm vi của mình
- **WHEN** tài khoản Kinh doanh phạm vi "Chỉ bán" mở trang, đang có 1 hợp đồng thuê và 1 phiếu điều chỉnh kho chờ duyệt
- **THEN** khối Chờ duyệt không có dòng nào và câu chào ghi "không có việc nào"

#### Scenario: Kế toán thấy điều chỉnh kho
- **WHEN** Kế toán mở trang, đang có phiếu điều chỉnh giá trị `ĐCG-2026-003` chờ duyệt
- **THEN** khối có dòng `ĐCG-2026-003` và câu chào "Chào Thu Hà, có 1 việc đang chờ Giám đốc duyệt"

### Requirement: Khối có tiền chỉ cho Giám đốc và Kế toán
Công nợ quá hạn, doanh số, đền bù và mua lại, top 5 nhà thầu và các dòng tiền khi tra nhanh SHALL chỉ tính và gửi cho người có quyền `receivables.view` (Giám đốc, Kế toán). Với vai trò khác, server SHALL không tính và không gửi các số đó (trang và API), không chỉ ẩn trên giao diện.

#### Scenario: Kinh doanh không nhận số tiền
- **WHEN** tài khoản Kinh doanh mở `/dashboard`
- **THEN** HTML trả về không có khối Công nợ quá hạn, Doanh số, Top 5 nhà thầu và không chứa số tiền của các khối đó

#### Scenario: Kế toán thấy khối tiền
- **WHEN** Kế toán mở `/dashboard`
- **THEN** trang có khối Công nợ quá hạn, Doanh số và Top 5 nhà thầu

### Requirement: Công nợ quá hạn
Khối Công nợ quá hạn SHALL hiện tổng tiền quá hạn, số nhà thầu có nợ quá hạn và số ngày quá hạn lâu nhất, lấy từ cùng nguồn với D14 (quá hạn theo ngày Việt Nam), kèm liên kết "Xem công nợ" tới `/receivables?filter=overdue`.

#### Scenario: Khớp D14
- **WHEN** D14 lọc "Quá hạn" ghi tổng quá hạn 189.700.000 ₫ của 2 nhà thầu, lâu nhất 36 ngày
- **THEN** khối hiện "189.700.000 ₫" và "2 nhà thầu · lâu nhất 36 ngày"

#### Scenario: Ranh giới hạn trả
- **WHEN** khoản nợ duy nhất có hạn 06/11/2026 và hôm nay 06/11/2026 (giờ Việt Nam)
- **THEN** khối hiện 0 ₫ quá hạn; ngày 07/11/2026 hiện quá hạn 1 ngày

### Requirement: Khối doanh số
Khối Doanh số SHALL có hai chế độ: **Theo tháng** (6 tháng gần nhất, cột chồng Thuê / Bán, tháng tạm tính có dấu *) và **Theo ngày** (các ngày của tháng này đến hôm nay). Khối SHALL ghi doanh số thuê và bán của hôm nay, khoản "Đền bù, mua lại" của tháng này ghi rõ "tính riêng, không cộng vào doanh số", và chú thích "Chưa gồm VAT". Ô số đầu trang SHALL hiện doanh số tháng này (thuê tạm tính + bán).

#### Scenario: Ô doanh số tháng
- **WHEN** đến 06/11/2026 doanh số thuê tạm tính tháng 11 là 49.800.000 ₫, bán 21.500.000 ₫
- **THEN** ô hiện "Doanh số tháng 11" "71.300.000 ₫" và "Thuê 49.800.000 ₫ tạm tính · bán 21.500.000 ₫"

#### Scenario: Chuyển theo ngày
- **WHEN** người dùng bấm "Theo ngày"
- **THEN** khối hiện một cột mỗi ngày từ 01/11/2026 đến 06/11/2026; tổng các cột bằng 71.300.000 ₫

### Requirement: Cách cộng cái và tấn
Mọi chỗ trên D1 ghi "cái" (Hàng ở ngoài, ô đầu trang, tra nhanh) SHALL chỉ cộng số lượng của mã có đơn vị **cái**; không cộng mã đơn vị khác (cây, bó, sọt, mét, kg...). "Tấn" SHALL cộng **mọi mã**: mã đơn vị kg lấy kg trực tiếp, mã khác lấy số lượng × trọng lượng chuẩn; hiện 1 chữ số lẻ.

#### Scenario: Một công trình có mã cái, mã mét, mã kg
- **WHEN** công trình `CT-0007` giữ 100 cái `PK-KU` (trọng lượng chuẩn 5 kg/cái), 50 mét `ONG-TH` (3 kg/mét) và 210 kg `PL-SAT`
- **THEN** công trình hiện 100 cái và 0,9 tấn (500 + 150 + 210 = 860 kg)

#### Scenario: Công trình chỉ có mã không phải cái
- **WHEN** công trình `CT-0040` chỉ giữ 30 cây `ONG-6M` (25,2 kg/cây)
- **THEN** công trình được đếm vào số công trình, hiện 0 cái và 0,8 tấn

### Requirement: Hàng ở ngoài theo khu vực
Khối Hàng ở ngoài SHALL hiện tổng số cái, tấn và số công trình đang có hàng (của bất kỳ mã nào), và bảng theo khu vực (Miền Bắc, Miền Trung, Miền Nam, "Chưa rõ" khi công trình chưa có tỉnh) với dòng Cộng, theo cách cộng cái và tấn ở trên. Số cái SHALL bằng tổng cột "Tại công trình" của D10 trên các mã đơn vị cái và bằng tổng số đang ở công trình của các hợp đồng (D6) trên các mã đó. Kinh doanh thấy khối này cho toàn công ty, không có tiền (0.2 #97).

#### Scenario: Gom theo khu vực
- **WHEN** 12 công trình Miền Bắc giữ 15.940 cái (231,2 tấn), 2 công trình Miền Trung 1.880 cái (27,6 tấn), 3 công trình Miền Nam 4.040 cái (59,6 tấn)
- **THEN** dòng Cộng là 17 công trình, 21.860 cái, 318,4 tấn và ô đầu trang hiện "21.860 cái" "318,4 tấn · 17 công trình"

#### Scenario: Công trình chưa có tỉnh
- **WHEN** công trình `CT-0031` chưa có tỉnh và đang giữ 100 cái
- **THEN** bảng có dòng "Chưa rõ" 1 công trình, 100 cái

#### Scenario: Khớp D10
- **WHEN** D10 cột "Tại công trình" cộng các mã đơn vị cái là 21.860, và có thêm 120 mét `ONG-TH` ở công trình
- **THEN** khối hiện 21.860 cái (không cộng 120 mét)

#### Scenario: Kinh doanh thấy toàn công ty
- **WHEN** tài khoản Kinh doanh phạm vi "Chỉ bán" mở trang
- **THEN** khối Hàng ở ngoài hiện cùng số cái, tấn, số công trình như Giám đốc thấy

### Requirement: Công trình rủi ro
Một hợp đồng thuê SHALL là rủi ro khi có ít nhất một dấu hiệu: (1) nhà thầu còn nợ quá hạn từ khoản của chính hợp đồng đó; (2) có hàng mất ghi trên phiếu thu hồi của hợp đồng với số ngày từ ngày mất đến hôm nay ≤ 30; (3) ngày kết thúc của bản hợp đồng đang áp dụng trước hôm nay mà hợp đồng còn hàng ở công trình. Ngày tính theo giờ Việt Nam; ngưỡng 30 ngày đặt một chỗ. Khối SHALL gom theo công trình; số công trình rủi ro SHALL bằng số công trình có ít nhất một hợp đồng rủi ro.

#### Scenario: Nợ quá hạn
- **WHEN** hợp đồng `122026/ANPHAT-SONGHONG` ở KCN Quang Minh có kỳ 09/2026 hạn 01/10/2026 chưa trả, hôm nay 06/11/2026
- **THEN** công trình KCN Quang Minh có dòng "Nợ quá hạn 36 ngày"

#### Scenario: Ranh giới 30 ngày hàng mất
- **WHEN** phiếu thu hồi ghi mất 3 `PK-KU` ngày 07/10/2026
- **THEN** ngày 06/11/2026 (30 ngày) công trình còn dấu hiệu "Mất 3 PK-KU ngày 07/10"
- **AND** ngày 07/11/2026 (31 ngày) dấu hiệu này không còn

#### Scenario: Quá ngày kết thúc mà còn hàng
- **WHEN** hợp đồng ở Nhà xưởng Phố Nối có ngày kết thúc 31/10/2026, còn 860 cái ở công trình, hôm nay 06/11/2026
- **THEN** công trình có dòng "Hết hạn HĐ 31/10, còn 860 cái"

#### Scenario: Đúng ngày kết thúc chưa rủi ro
- **WHEN** ngày kết thúc 06/11/2026, còn hàng, hôm nay 06/11/2026
- **THEN** dấu hiệu (3) chưa có

#### Scenario: Hợp đồng không có ngày kết thúc
- **WHEN** hợp đồng thuê không ghi ngày kết thúc, còn 500 cái, không nợ quá hạn, không mất hàng
- **THEN** hợp đồng không rủi ro

#### Scenario: Hai hợp đồng một công trình
- **WHEN** Chung cư An Phú – Block B có hợp đồng của Minh Phát (mất hàng 20/10/2026) và hợp đồng của Sông Hồng (nợ quá hạn)
- **THEN** khối có một dòng An Phú – Block B với hai dòng con theo từng hợp đồng, và số công trình rủi ro tính 1

#### Scenario: Kinh doanh thấy dấu hiệu không có tiền
- **WHEN** Kinh doanh phạm vi "Cả hai" xem khối, hợp đồng trong phạm vi có nợ quá hạn 36 ngày, 12.400.000 ₫
- **THEN** dòng ghi "Nợ quá hạn 36 ngày"; trang và dữ liệu gửi về không có 12.400.000 ₫

#### Scenario: Kinh doanh ngoài phạm vi không thấy công trình rủi ro
- **WHEN** Kinh doanh phạm vi "Chỉ bán" xem khối, có 3 công trình rủi ro
- **THEN** khối không có dòng nào

### Requirement: Tra nhanh một công trình
Ô tra nhanh SHALL tìm công trình theo mã, tên công trình hoặc tên nhà thầu (không phân biệt dấu, từ 2 ký tự). Kết quả là công trình: mã, tên, tỉnh (khu vực), tổng hàng đang giữ (cái, tấn theo cách cộng cái và tấn) và từng hợp đồng thuê ở đó: nhà thầu, số hợp đồng, ngày ký, trạng thái, hàng đang giữ; với người có `receivables.view` thêm tiền thuê tháng này tạm tính (bằng D7), đang nợ (quá hạn hay chưa), cọc tiền thỏa thuận và đã nhận.

#### Scenario: Tra theo mã
- **WHEN** Giám đốc gõ "CT-0007" ngày 06/11/2026
- **THEN** kết quả có "Chung cư An Phú – Block B", Minh Phát, `082026/ANPHAT-MINHPHAT`, ký 01/08/2026, Đang thực hiện, đang giữ 1.240 cái 18,6 tấn, thuê tháng này 4.560.000 ₫ tạm tính đến 06/11, đang nợ 33.050.000 ₫ chưa quá hạn, cọc 50.000.000 ₫ đã nhận

#### Scenario: Tra theo tên nhà thầu không dấu
- **WHEN** Kế toán gõ "minh phat"
- **THEN** kết quả gồm mọi công trình có hợp đồng thuê của Minh Phát

#### Scenario: Kinh doanh không thấy tiền
- **WHEN** Kinh doanh gõ "CT-0007"
- **THEN** kết quả có số hàng đang giữ nhưng phản hồi API và giao diện không có tiền thuê, đang nợ, cọc

#### Scenario: Kinh doanh ngoài phạm vi
- **WHEN** Kinh doanh phạm vi "Chỉ bán" gõ "CT-0007"
- **THEN** không có kết quả

#### Scenario: Chuỗi quá ngắn
- **WHEN** người dùng gõ "C"
- **THEN** hệ thống không tìm và không hiện kết quả

### Requirement: Tồn kho theo tình trạng
Khối Tồn kho SHALL hiện theo mã hàng: Mới, Tốt, Chờ sửa, Phế liệu (cộng mọi bãi và xưởng) và "Ở công trình", các mã có tồn khác 0 sắp theo tổng kg quy đổi giảm dần, tối đa 6 mã, liên kết "Xem tồn kho" tới `/inventory`. Mỗi dòng ghi theo đơn vị của mã như D10, không cộng chéo mã. Với mỗi mã, tổng 4 cột tình trạng SHALL bằng "Tại bãi" + "Tại xưởng" của D10 và "Ở công trình" bằng "Tại công trình" của D10.

#### Scenario: Khớp D10
- **WHEN** D10 dòng `KG-1,7` ghi tại bãi Tốt 1.200, Chờ sửa 150, Phế liệu 42, tại xưởng 76 (40 Tốt, 36 Chờ sửa), tại công trình 3.860
- **THEN** khối dòng `KG-1,7` hiện Mới 0, Tốt 1.240, Chờ sửa 186, Phế liệu 42, Ở công trình 3.860

### Requirement: Top 5 nhà thầu năm nay
Khối Top 5 SHALL xếp nhà thầu theo doanh thu từ 01/01 năm nay đến hôm nay (thuê + bán, chưa VAT, cùng cách tính doanh số) hoặc theo kg hàng đã giao trong năm (0.2 #95: phiếu xuất thuê và bán đã ghi sổ, không trừ hàng trả, hiện tấn), đổi bằng hai nút "Doanh thu" / "Theo kg". Bằng nhau thì xếp theo tên. Nhà thầu có số 0 không vào bảng.

#### Scenario: Xếp theo doanh thu
- **WHEN** năm 2026 Sông Hồng 1.284.500.000 ₫, Minh Phát 962.300.000 ₫, Thành Công 744.000.000 ₫, Đông Á 512.800.000 ₫, Trần Văn Hùng 186.400.000 ₫, Hòa Bình 90.000.000 ₫
- **THEN** bảng có 5 dòng từ Sông Hồng đến Trần Văn Hùng, không có Hòa Bình

#### Scenario: Theo kg không trừ hàng trả
- **WHEN** năm 2026 Minh Phát được giao 400 `PK-KU` (5 kg/cái) và trả về 300 cái, Đông Á được giao 300 cái và chưa trả
- **THEN** theo kg Minh Phát 2,0 tấn, xếp trên Đông Á 1,5 tấn

#### Scenario: Doanh thu năm khớp tổng các tháng
- **WHEN** cộng doanh số tháng 01 … 11/2026 của Minh Phát
- **THEN** tổng bằng doanh thu Minh Phát trong Top 5

### Requirement: Thời điểm số liệu và làm mới
Trang SHALL ghi giờ tính số liệu ("số liệu lúc HH:MM") và có nút "Làm mới" tính lại mọi khối mà không tải lại khung trang. Trang SHALL không tự làm mới theo thời gian.

#### Scenario: Bấm làm mới
- **WHEN** Giám đốc mở trang lúc 06:45, Kế toán ghi một phiếu thu, Giám đốc bấm "Làm mới" lúc 07:10
- **THEN** dòng dưới câu chào ghi "số liệu lúc 07:10" và khối Công nợ quá hạn hiện số sau phiếu thu
