Tài liệu mô tả các phân hệ ở mức yêu cầu hệ thống (System Requirements), làm cơ sở thiết kế CSDL và luồng API.

> Cập nhật 26/10/2026: bổ sung bối cảnh doanh nghiệp, các quyết định nghiệp vụ đã chốt (Mục 0), và chia giai đoạn **[MVP]** / **[Bản 2]** cho từng chức năng.

---

## 0. BỐI CẢNH & QUYẾT ĐỊNH NGHIỆP VỤ

### 0.1. Bối cảnh

- Khách hàng: công ty vừa và nhỏ, chuyên **thu mua, gia công (sửa chữa/tân trang), buôn bán và cho thuê giàn giáo, vật tư xây dựng đã qua sử dụng**. Có thể kinh doanh cả **hàng mới**.
- Hệ thống khép kín vòng đời vật tư: mua → nhập kho → sửa chữa → bán/cho thuê → thu hồi → đền bù → công nợ.
- Quy mô hiện tại: **1 bãi + 1 xưởng**. CSDL vẫn hỗ trợ thêm kho/bãi sau này.
- Số liệu thật 10/2026 (khảo sát 28/10, `docs/discovery/2026-10-28-khao-sat.md`): ~68 khách đang thuê, 96 công trình, 142 mã vật tư, ~2.500 tấn hàng (~1.800 tấn đang ở công trình), nợ ~9,8 tỷ, cọc ~8,9 tỷ. Thuê ~1 tỷ/tháng, bán 1–4 tỷ/tháng. Có 3 xe tải.
- Ngoài mua – sửa – bán – thuê, công ty còn **sản xuất thành phẩm từ nguyên liệu** (change `production-orders`).

### 0.2. Quyết định đã chốt

| # | Chủ đề | Quyết định |
|---|---|---|
| 1 | Giá vốn | **Bình quân gia quyền** theo *mã hàng + tình trạng*. Không quản lý theo lô |
| 2 | Đơn vị quản lý | **Theo số lượng**, không quản lý từng chiếc (không serial). Mã QR dán theo mã hàng |
| 3 | Quy đổi kg ↔ cái | Mỗi mã hàng khai báo **trọng lượng chuẩn** (kg/cái). Phế liệu của mã tính theo cái **vẫn đếm theo cái** (hiện kèm kg quy đổi); mã tính theo kg dùng cho sắt vụn mua về (chốt 27/10/2026) |
| 4 | Tính tiền thuê | **Tính theo ngày**: tính ngày xuất, không tính ngày trả. Giá tháng quy ra giá ngày (giá tháng ÷ 30) |
| 4b | Thuê theo bộ | Giá thuê đặt theo **linh kiện**. "Bộ" chỉ dùng để báo giá cho nhanh |
| 5 | Hợp đồng – công trình | **1 hợp đồng = 1 công trình**. Chuyển công trình = trả về bãi rồi xuất theo hợp đồng mới |
| 6 | Vai trò | Giám đốc, Kế toán, Kinh doanh, Thủ kho, Xưởng. **Giám đốc duyệt** hợp đồng và phiếu đền bù |
| 7 | Offline | Không hỗ trợ offline ở MVP. PWA **lưu nháp trên máy** khi mất sóng |
| 8 | Phạm vi kế toán | Chỉ **quản lý công nợ** nội bộ. Không xuất hóa đơn VAT. Có **xuất Excel** cho kế toán |
| 9 | Kỹ thuật | **Next.js** (giao diện + API) + **PostgreSQL** |
| 10 | Làm tròn giá vốn | Giá vốn bình quân **làm tròn đến 1 ₫** sau mỗi lần nhập làm đổi giá bình quân (chốt 26/10/2026) |
| 11 | Giá ghi sổ khi xuất/thu hồi | Hàng **xuất** cho công trình, hàng **thu hồi** và hàng chuyển bãi ↔ xưởng chỉ là chuyển chỗ trong công ty (#24): ghi theo **giá vốn bình quân hiện tại** của (mã hàng + tình trạng), không làm đổi giá bình quân. Chỉ hàng vào từ ngoài (tồn đầu kỳ, nhập mua, nhập sau sửa chữa) mới làm đổi giá bình quân (chốt 26/10/2026, sửa 27/10/2026) |
| 12 | Nhận thiếu so với đơn mua | **Mặc định đóng đơn** theo số thực nhận. Thủ kho tích **"Chờ giao bù phần thiếu"** nếu người bán sẽ giao tiếp (chốt 26/10/2026) |
| 13 | Tiền trả người bán | Tính theo **số thực nhận** và **số kg cân thực tế**, không theo số trên đơn. Chi phí mua hàng (landed cost) chia theo hàng thực nhận. Đơn mua chỉ là dự kiến (chốt 26/10/2026) |
| 14 | Nhập nhiều chuyến | **1 đơn mua – nhiều phiếu nhập**, mỗi chuyến xe một phiếu. Trong một phiếu, mã nào chuyến đó không có thì đánh dấu **"Chuyến này không có"** (ghi 0). Chỉ xác nhận được khi mọi dòng đã đếm hoặc đã đánh dấu. Đơn ở trạng thái **Đang nhận** cho tới khi đủ hoặc bị đóng (chốt 26/10/2026) |
| 15 | Duyệt hợp đồng khi nhà thầu nợ quá hạn | **Chỉ cảnh báo**, không chặn. Giám đốc vẫn duyệt được nhưng **bắt buộc ghi lý do**. Lý do lưu cùng lần duyệt (chốt 26/10/2026) |
| 16 | Sửa hợp đồng đã duyệt | Không sửa thẳng. Đổi hàng, giá, đền bù hay thời hạn thì tạo **phụ lục**, Giám đốc **duyệt lại**. Giá mới chỉ tính **từ ngày hiệu lực** của phụ lục, không tính lại kỳ cũ (chốt 26/10/2026) |
| 17 | Kho không đủ hàng khi xuất | **Cho xuất thiếu.** Thủ kho xác nhận số thực nhặt; phần còn thiếu tự chuyển sang **đợt sau** của hợp đồng (chốt 26/10/2026) |
| 18 | Hạn thanh toán | **Ghi trong hợp đồng** (số ngày được nợ, mặc định lấy từ nhà thầu). Hạn = ngày chốt kỳ thuê / ngày duyệt đền bù / ngày giao hàng bán + số ngày đó. Quá hạn là trạng thái tính ra, không lưu (chốt 27/10/2026) |
| 19 | Trừ tiền khi nhà thầu trả | **Tự trừ khoản đến hạn sớm nhất trước.** Kế toán đổi được nếu khách chỉ định trả khoản khác (chốt 27/10/2026) |
| 20 | Đền bù theo tình trạng | Chờ sửa = giá "hỏng, sửa được". **Phế liệu = giá mất.** Mất = giá mất. Giám đốc được giảm trừ khi duyệt, **bắt buộc ghi lý do** (chốt 27/10/2026) |
| 21 | Tiền thuê hàng mất | Hàng mất coi như **trả vào ngày lập phiếu thu hồi**: thôi tính thuê từ ngày đó, chỉ tính đền bù (chốt 27/10/2026) |
| 22 | Kỳ tính tiền thuê đã chốt | **Khóa sau khi chốt.** Sai sót phát hiện sau đó ghi bằng **dòng điều chỉnh ở kỳ sau**, không sửa kỳ cũ (chốt 27/10/2026) |
| 23 | Chi phí sửa chữa | Nhập **riêng cho từng mã hàng** trên phiếu sửa. Chi phí chỉ chia cho **hàng sửa xong** (về Tốt). Hàng hỏng hẳn sang Phế liệu (vẫn đếm theo cái) với giá = **min(kg quy đổi × giá sắt vụn tham khảo lúc ghi sổ, số cái × giá vốn Chờ sửa)**, như phế liệu mua về (#27). **Phần hỏng** = số phế liệu × giá Chờ sửa − giá phế liệu: hàng sửa xong cùng mã **gánh thêm** phần này; nếu cả dòng hỏng hết thì ghi thành **lỗ hỏng hàng**. Chưa có giá sắt vụn thì không ghi sổ phiếu có phế liệu (chốt 27/10/2026, sửa 28/10/2026) |
| 24 | Phạm vi tính giá vốn bình quân | Giá BQ của (mã hàng + tình trạng) tính trên **toàn bộ hàng của công ty**: bãi + xưởng + công trình. Hàng ở công trình vẫn là tài sản công ty. Tổng giá trị trong sổ luôn bằng tồn × giá BQ (chốt 27/10/2026) |
| 25 | Chia chi phí mua hàng theo chuyến | Chi phí của **chuyến nào** (cước xe, bốc xếp...) chia vào giá nhập hàng của **chính chuyến đó**, theo cách chia đã chọn trên đơn (theo giá trị hoặc theo trọng lượng). Mỗi phiếu nhập ghi sổ kho một lần với giá đã gồm chi phí của nó (chốt 27/10/2026) |
| 26 | Chi phí mua hàng và tiền trả người bán | Chi phí mua hàng trả cho **nhà xe, bốc xếp**, chỉ tính vào giá vốn; **không cộng** vào tiền phải trả người bán. Tiền trả người bán = tiền hàng thực nhận (#13) (chốt 27/10/2026) |
| 27 | Giá lô hàng cũ theo tình trạng | Lô hàng cũ mua chưa phân loại, khi tách tình trạng: **Phế liệu** lấy giá = kg quy đổi (theo trọng lượng chuẩn) × **giá sắt vụn tham khảo** (₫/kg). Phần còn lại của tiền dòng (tiền hàng thực nhận + chi phí mua hàng phân bổ) **chia cho Tốt và Chờ sửa theo số cái**. Giá trị phế liệu lớn hơn tiền dòng, hoặc cả lô là phế liệu, thì phế liệu nhận đúng tiền dòng (chốt 27/10/2026) |
| 28 | Ai nhập chi phí từng chuyến | **Thủ kho nhập trên M3** lúc nhận hàng, trước khi xác nhận nhập kho. Chuyến đầu điền sẵn chi phí dự kiến của đơn; chuyến sau để trống. Thủ kho sửa theo số thật trả nhà xe, bốc xếp. Chi phí ghi cùng phiếu nhập và chia vào giá nhập ngay khi ghi sổ (#25) (chốt 27/10/2026) |
| 29 | Mã "Chuyến này không có" | Trên phiếu nhập, dòng đánh dấu **"Chuyến này không có"** mặc định **tích sẵn "Chờ chuyến sau"**: đơn giữ Đang nhận để chờ mã đó. Thủ kho bỏ tích nếu người bán không giao mã này nữa. Dòng **đếm thiếu** vẫn mặc định **không chờ** (#12) (chốt 27/10/2026) |
| 30 | Hỏi lại khi nhập bất thường | Trên phiếu nhập, Thủ kho phải **xác nhận lại** trước khi ghi sổ khi: dòng tính theo cái nhận **vượt** số đơn còn lại; dòng tính theo kg (kg cân) vượt **quá 10 %** số còn lại; **tổng chi phí chuyến lớn hơn tổng chi phí dự kiến của cả đơn**. Phần đã xác nhận ghi vào lịch sử đơn; D3b hiện nhãn "Nhận dư". Lý do: sổ kho chỉ ghi thêm và chưa có phiếu sửa giá trị (#42) (chốt 27/10/2026) |
| 31 | Phạm vi kiểm kê | Kiểm kê **chỉ đếm hàng ở bãi và xưởng** (`YARD`, `WORKSHOP`). Hàng ở công trình **không** kiểm kê bằng phiên đếm: đối chiếu với khách khi thu hồi và quyết toán. Có thể mở rộng sau (Q13) (chốt 28/10/2026) |
| 32 | Kiểm kê và xuất nhập | Kiểm kê **không khóa xuất nhập**. Số sổ của mỗi dòng (mã hàng + tình trạng) = tồn trong sổ kho tại vị trí **lúc thủ kho bấm "Xong mã này"**; chênh lệch = số đếm − số sổ lúc đó. **Đếm mù**: điện thoại không hiện số sổ. Dòng chưa đếm **không điều chỉnh**. Giám đốc duyệt thì ghi `ADJUST_OUT` (thiếu) / `ADJUST_IN` (thừa) theo **giá BQ lúc duyệt**, ngày = ngày duyệt; giá BQ không đổi (chốt 28/10/2026) |
| 33 | Bán SaaS cho nhiều công ty | Trước mắt app vẫn phục vụ **một công ty** (chưa có `tenant_id`). Khi bán cho khách khác: **mỗi công ty một database riêng**, cùng một bộ code (mỗi khách một bản deploy, hoặc chọn DB theo tên miền phụ). Chỉ chuyển sang **dùng chung bảng + `tenant_id` + RLS** (Postgres tự lọc dòng theo công ty) khi số khách lớn tới mức chạy nhiều DB quá tốn công, và việc đó làm thành một change OpenSpec riêng. Lý do: DB riêng gần như không phải sửa code (33 bảng, ràng buộc unique `code`/`username`, sequence mã đối tác đều đang tính toàn hệ thống) và không có nguy cơ lộ dữ liệu giữa các công ty. Code mới phải theo 5 quy ước giữ đường lui ở `CLAUDE.md` (mục Quy ước code). Các quyết định nghiệp vụ trong 0.2 (×30 ngày, giá BQ gộp vị trí, giá sắt vụn, luật mã, 5 vai trò) chưa thành cài đặt riêng từng công ty; quyết định khi có khách thứ hai (chốt 28/10/2026) |
| 34 | Nhật ký thao tác | Mọi thao tác làm đổi dữ liệu và mỗi lần đăng nhập thành công ghi vào **nhật ký chỉ ghi thêm** (D18), cùng transaction với thao tác; **không ai sửa, xóa được**, kể cả Giám đốc; **giữ mãi** ở MVP. Chỉ Giám đốc xem. **Giờ làm việc 06:00–21:00 giờ VN**: thao tác trước 06:00 hoặc từ 21:00 trở đi gắn cờ "Ngoài giờ". CCCD, số tài khoản chỉ lưu dạng đã che; không ghi mật khẩu. Xuất Excel trong MVP, tối đa 10.000 dòng một lần. Không ghi lại dữ liệu trước khi có nhật ký (chốt 29/10/2026, change `activity-log`) |
| 35 | Điều chỉnh giá trị kho | Sửa giá trị đã ghi sai bằng **phiếu điều chỉnh giá trị** (`ĐCG`): mỗi dòng là (mã hàng + tình trạng) + chênh lệch giá trị, **không đổi số lượng**; **Giám đốc duyệt** mới ghi sổ. Sổ kho ghi một dòng `REVALUE` **số lượng 0, không có vị trí**; giá BQ mới = (tồn × giá BQ + chênh lệch) ÷ tồn, tồn gộp mọi vị trí **kể cả công trình** (#24), tính theo số **lúc duyệt**, làm tròn 1 ₫ (#10). Tồn bằng 0 thì **chặn**; còn tồn thì **toàn bộ** chênh lệch vào hàng đang tồn (tổng giá vốn công ty vẫn đúng); giá trị sau âm thì chặn. **Lý do và chứng từ gốc bắt buộc** (chứng từ phải có dòng sổ của từng mã + tình trạng trên phiếu). Chia lại tự động theo phiếu gốc **chỉ cho chi phí chuyến của phiếu nhập**, và chỉ khi dựng lại ra đúng số đã ghi; trường hợp khác nhập dòng tay (chốt 29/10/2026, change `stock-value-adjustment`) |

### 0.2b. Quyết định đang chờ chủ doanh nghiệp xác nhận (khảo sát 28/10/2026)

Các quyết định dưới đây có thể đổi sau khi chủ trả lời câu hỏi ở issue [#44](https://github.com/hoanghainh1188/scaffolding-erp/issues/44). Chưa dùng làm căn cứ propose cho change bị ảnh hưởng.

| Quyết định | Điều có thể đổi | Câu hỏi |
|---|---|---|
| #4 Tính tiền thuê | Có trừ ngày Tết/lễ không; giá tháng ÷ 30 hay ÷ số ngày của tháng; thuê tối thiểu | Q1, Q2 |
| #5 Hợp đồng – công trình | Có cho chuyển hàng thẳng công trình → công trình | Q8 |
| #8 Phạm vi kế toán | Không xuất hóa đơn, nhưng **tiền VAT có trong công nợ** theo từng hợp đồng | Q4 |
| #18 Hạn thanh toán | Có phạt/lãi chậm trả không | Q5 |
| #20 Đền bù | Bảng giá đền bù lấy từ đâu | Q6 |
| Danh mục (`master-data`) | Luật mã vật tư (mã cũ có dấu phẩy, `*`, `+`); cho thuê mã tính theo kg/mét; đơn vị bó, sọt, mét | Q3, Q9, Q10 |

### 0.3. Tình trạng hàng (thay cho khái niệm "3 kho")

Mỗi mã hàng có tồn kho tách theo **4 tình trạng**:

| Tình trạng | Ý nghĩa | Được bán/cho thuê |
|---|---|---|
| **Mới** | Hàng mới mua từ nhà cung cấp | Có |
| **Tốt** | Hàng đã qua sử dụng, dùng được ngay | Có |
| **Chờ sửa** | Hỏng nhẹ, cần đưa vào xưởng | Không |
| **Phế liệu** | Biến dạng hoàn toàn. Đếm theo cái trong mã của nó, hiện kèm kg quy đổi (0.2 #3) | Bán theo kg (chốt ở `inventory-ledger`) |

Mỗi tình trạng có **giá vốn bình quân riêng**.

### 0.4. Vai trò & quyền chính

| Vai trò | Thiết bị | Việc chính |
|---|---|---|
| Giám đốc | Desktop | Xem báo cáo, duyệt hợp đồng, duyệt đền bù |
| Kế toán | Desktop | Tính tiền thuê, công nợ, xuất Excel |
| Kinh doanh | Desktop | Thu mua, báo giá, hợp đồng, lịch xuất hàng |
| Thủ kho | Mobile | Nhập, xuất, thu hồi, kiểm kê |
| Xưởng | Mobile | Ghi nhận sửa chữa **[Bản 2]** |

### 0.5. Đăng nhập & tài khoản (chốt 26/10/2026)

| # | Chủ đề | Quyết định |
|---|---|---|
| 1 | Cách đăng nhập | **Tên đăng nhập + mật khẩu.** Không dùng email hay số điện thoại (thủ kho, thợ xưởng thường không có email công ty) |
| 2 | Ai tạo tài khoản | **Chỉ Giám đốc**, ở màn D17 |
| 3 | Mật khẩu ban đầu | Hệ thống tạo **mật khẩu tạm**; người dùng **bắt buộc đổi** ở lần đăng nhập đầu |
| 4 | Quên mật khẩu | **Giám đốc đặt lại** (cấp mật khẩu tạm mới). Không có tự khôi phục qua email/SMS |
| 5 | Giữ đăng nhập | Có ô "Giữ đăng nhập trên máy này" (dành cho điện thoại thủ kho ngoài bãi) |
| 6 | Vai trò | **Mỗi người một vai trò** |
| 7 | Khóa tài khoản | Giám đốc khóa được tài khoản (nghỉ việc). Tài khoản khóa vẫn giữ lịch sử, không xóa |

Thời gian giữ đăng nhập cụ thể (khi có và không tick ô) do change `auth-and-roles` đề xuất.

---

## 1. Phân hệ Thu mua & Nhập kho (Inbound Procurement)

- **Quản lý Đơn thu mua (Purchase Order - PO)** **[MVP]**:
    - Tạo PO với các thông tin: Nhà cung cấp/Cai thầu, Ngày dự kiến nhập, Phương tiện vận chuyển.
    - Phân loại PO: **Hàng mới** (mua từ NCC) hoặc **Hàng đã qua sử dụng/phế liệu**.
    - Hỗ trợ nhập liệu đa ĐVT trên cùng một form: nhập theo số lượng (cái/chiếc) cho hàng còn hình dáng, hoặc theo khối lượng (kg/tấn) cho đống phế liệu lẫn lộn. Hệ thống quy đổi bằng trọng lượng chuẩn.
- **Nhập thực tế & Phân loại tình trạng tại bãi** **[MVP]**:
    - Khi xe về bãi, thủ kho dùng PWA mở PO và "Tạo phiếu nhập thực tế".
    - PO hàng mới: nhập thẳng vào tình trạng **Mới**.
    - PO hàng cũ: từ 1 mã hàng (VD: Khung giàn giáo 1.7m), thủ kho tách thành 3 số lượng: **Tốt / Chờ sửa / Phế liệu**.
- **Phân bổ Landed Cost (Giá vốn thực tế)** **[MVP]**:
    - Ghi nhận chi phí phát sinh: cước xe tải, tiền bốc xếp, cầu đường.
    - Phân bổ chi phí vào từng dòng hàng theo **tỷ lệ giá trị** hoặc **trọng lượng** (người dùng chọn).
    - Giá nhập sau phân bổ được đưa vào **giá vốn bình quân** của mã hàng + tình trạng tương ứng.

## 2. Phân hệ Quản lý Tồn kho & Vật tư (Inventory Management)

- **Danh mục vật tư** **[MVP]**:
    - Danh mục chung cho mọi loại vật tư xây dựng, không riêng giàn giáo.
    - Mỗi mã hàng có: tên, nhóm, đơn vị tính, **trọng lượng chuẩn**, giá thuê ngày/tháng mặc định.
- **Bộ (BOM) & Rã/Đóng bộ** **[MVP]** – *tùy chọn theo mã hàng*:
    - Cấu hình bộ khi cần. VD: 1 Bộ giàn giáo 1.7m = 2 Khung 1.7m + 2 Chéo + 1 Mâm.
    - Kinh doanh báo giá theo "Bộ". Khi lệnh xuống kho, hệ thống tự rã thành linh kiện rời để thủ kho nhặt hàng.
    - Tồn kho và giá thuê luôn tính theo **linh kiện**.
- **Sổ kho (Inventory Ledger)** **[MVP]**:
    - Mọi phiếu nhập/xuất/chuyển tình trạng/điều chỉnh đều ghi vào sổ kho.
    - Đây là nguồn dữ liệu duy nhất để tính tồn kho, giá vốn, tiền thuê và báo cáo.
- **Báo cáo tồn kho theo vị trí & tình trạng** **[MVP]**:
    - Số lượng tại Bãi (theo 4 tình trạng), tại Xưởng, tại từng Công trình.
- **Kiểm kê (Stocktake) qua thiết bị di động** **[MVP]** – chỉ bãi và xưởng (0.2 #31):
    - Thủ kho tạo phiên kiểm kê trên PWA, nhập số lượng đếm thực tế.
    - Sau khi Giám đốc duyệt, hệ thống ghi dòng điều chỉnh vào sổ kho để cân bằng sổ sách.

## 3. Phân hệ Sửa chữa & Tân trang (Refurbishment)

- **Bản đơn giản** **[MVP]**:
    - Phiếu chuyển tình trạng: **Chờ sửa → Tốt** (hoặc Chờ sửa → Phế liệu nếu không sửa được).
    - Ghi **tổng chi phí sửa chữa** của phiếu.
    - Hệ thống cộng chi phí vào giá vốn: [Giá vốn Chờ sửa] + [Chi phí sửa / số lượng] → nhập vào bình quân của tình trạng Tốt.
- **Bản đầy đủ** **[Bản 2]**:
    - **Lệnh Sửa chữa (Work Order):** rút hàng từ Chờ sửa đưa vào Xưởng.
    - **Vật tư phụ & Nhân công:** xuất kho vật tư tiêu hao (sơn, que hàn, ốc vít); ghi công thợ/khoán việc.
    - **Nghiệm thu:** nhập thành phẩm vào Tốt. Giá vốn mới = Giá vốn cũ + Vật tư phụ + Nhân công.
    - Xưởng ghi nhận trên PWA; văn phòng tạo lệnh và nghiệm thu trên desktop.

## 4. Phân hệ Bán hàng & Cho thuê (Sales & Rental Operations)

- **Báo giá & Hợp đồng** **[MVP]**:
    - Mỗi hợp đồng gắn với **1 nhà thầu** và **1 công trình**.
    - Thiết lập đơn giá bán đứt hoặc đơn giá thuê theo ngày/tháng (giá tháng tự quy ra giá ngày).
    - Bảng giá đền bù mất/hỏng ghi trong hợp đồng (VD: mất khung đền 200k/cái, bẹp khung đền phí sửa 50k/cái).
    - Hợp đồng cần **Giám đốc duyệt** trước khi xuất hàng.
- **Lệnh xuất kho theo Tiến độ (Delivery Schedule)** **[MVP]**:
    - Một hợp đồng có thể sinh ra nhiều phiếu xuất kho theo từng đợt.
    - Chỉ xuất hàng tình trạng **Mới** hoặc **Tốt**.
    - Ghi nhận cước vận chuyển chiều đi (nếu công ty gọi xe giúp nhà thầu).
- **Chốt khối lượng & Tính tiền thuê tự động (Billing)** **[MVP]**:
    - Kế toán chọn kỳ (VD: 01/10 – 31/10).
    - Hệ thống quét sổ kho của công trình, tính số ngày thuê thực tế từng linh kiện.
    - Quy tắc: **tính ngày xuất, không tính ngày trả**; phần đã trả giữa kỳ được trừ đúng ngày trả.
    - Kết quả hiển thị chi tiết từng dòng để kế toán kiểm tra trước khi chốt.

## 5. Phân hệ Thu hồi & Đền bù (Return & Compensation)

- **Phiếu Nhập Thu Hồi (Return Note)** **[MVP]**:
    - Thủ kho dùng PWA chọn công trình đang trả hàng.
    - Đếm và phân loại khi xe hạ tải: **Tốt / Chờ sửa / Phế liệu**, và số lượng **mất** (thiếu so với số đang ở công trình).
    - Chụp ảnh trực tiếp hàng bị móp méo, đính kèm vào phiếu làm bằng chứng.
    - Hàng thu hồi nhập về với giá vốn bình quân hiện tại của mã hàng.
- **Tính toán Đền bù** **[MVP]**:
    - Dựa vào số lượng hỏng/mất và bảng giá đền bù trong hợp đồng, hệ thống sinh **Phiếu tính phí đền bù**.
    - Phiếu cần **Giám đốc duyệt**, sau đó mới cộng vào công nợ nhà thầu.

## 6. Phân hệ Tài chính & Công nợ (Finance & Receivables/Payables)

- **Công nợ Phải Thu (AR)** **[MVP]**:
    - Gộp trên 1 sổ chi tiết của nhà thầu: Tiền thuê kỳ này + Tiền bán vật tư + Phí vận chuyển + Phí đền bù.
    - Ghi nhận các lần thanh toán.
    - Theo dõi hạn thanh toán và cảnh báo nợ quá hạn.
    - Xuất Excel.
- **Công nợ Phải Trả (AP)** **[Bản 2]**:
    - Theo dõi tiền cần trả cho cá nhân thanh lý phế liệu, nhà cung cấp, đơn vị thuê xe ngoài.
- **Báo cáo Quản trị (Dashboards)** **[Bản 2]**:
    - Lợi nhuận gộp: Doanh thu − Giá vốn (đã gồm Landed Cost) − Chi phí sửa chữa.
    - Tỷ lệ khai thác (Utilization): % hàng đang ở công trình (sinh lời) vs % nằm ở bãi.

---

## 7. NGOÀI PHẠM VI (hiện tại)

- Xuất hóa đơn VAT, tích hợp phần mềm kế toán (MISA...). (Tiền VAT trong công nợ: đang chờ Q4, xem 0.2b.)
- Quản lý từng chiếc theo serial.
- Quản lý giá vốn theo lô.
- Chạy offline hoàn toàn trên PWA.
- Nhiều chi nhánh.
