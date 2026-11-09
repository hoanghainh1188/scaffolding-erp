Tài liệu mô tả các phân hệ ở mức yêu cầu hệ thống (System Requirements), làm cơ sở thiết kế CSDL và luồng API.

> Cập nhật 26/10/2026: bổ sung bối cảnh doanh nghiệp, các quyết định nghiệp vụ đã chốt (Mục 0), và chia giai đoạn **[MVP]** / **[Bản 2]** cho từng chức năng.

---

## 0. BỐI CẢNH & QUYẾT ĐỊNH NGHIỆP VỤ

### 0.1. Bối cảnh

- Khách hàng: công ty vừa và nhỏ, chuyên **thu mua, gia công (sửa chữa/tân trang), buôn bán và cho thuê giàn giáo, vật tư xây dựng đã qua sử dụng**. Có thể kinh doanh cả **hàng mới**.
- Hệ thống khép kín vòng đời vật tư: mua → nhập kho → sửa chữa → bán/cho thuê → thu hồi → đền bù → công nợ.
- Quy mô hiện tại: **1 bãi + 1 xưởng**. CSDL vẫn hỗ trợ thêm kho/bãi sau này.
- Số liệu thật 10/2026 (khảo sát 28/10, `docs/discovery/2026-10-28-khao-sat.md`): vài chục khách đang thuê, gần trăm công trình, hơn trăm mã vật tư, hàng nghìn tấn hàng; doanh số, nợ, cọc giữ riêng, không ghi trong repo. Có 3 xe tải.
- Ngoài mua – sửa – bán – thuê, công ty còn **sản xuất thành phẩm từ nguyên liệu** (change `production-orders`).

### 0.2. Quyết định đã chốt

| # | Chủ đề | Quyết định |
|---|---|---|
| 1 | Giá vốn | **Bình quân gia quyền** theo *mã hàng + tình trạng*. Không quản lý theo lô |
| 2 | Đơn vị quản lý | **Theo số lượng**, không quản lý từng chiếc (không serial). Mã QR dán theo mã hàng |
| 3 | Quy đổi kg ↔ cái | Mỗi mã hàng khai báo **trọng lượng chuẩn** (kg/cái). Phế liệu của mã tính theo cái **vẫn đếm theo cái** (hiện kèm kg quy đổi); mã tính theo kg dùng cho sắt vụn mua về (chốt 27/10/2026) |
| 4 | Tính tiền thuê | **Tính theo số ngày thực tế**: ngày xuất tính từ ngày hôm sau (N+1) đến ngày trả hàng (số ngày = ngày trả − ngày xuất). Tiền thuê theo tháng/kỳ = **Đơn giá ngày × số ngày thực tế trong tháng** (28/29/30/31 ngày). Hợp đồng có điều khoản **thời gian thuê tối thiểu (mặc định 45 ngày)**: trả sớm vẫn tính đủ 45 ngày (chốt 26/10/2026, sửa 01/11/2026 từ đối soát file kế toán thật) |
| 4b | Thuê theo bộ | Giá thuê đặt theo **linh kiện**. "Bộ" chỉ dùng để báo giá cho nhanh |
| 5 | Hợp đồng – công trình | **1 hợp đồng = 1 công trình**. Cho phép **chuyển thẳng vật tư giữa các công trình** mà không cần trả về bãi (chốt 01/11/2026 theo #38) |
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
| 36 | Quyền kết nối cơ sở dữ liệu | Ứng dụng kết nối DB bằng **role quyền tối thiểu** (`erp_app`): không là chủ bảng, không đổi cấu trúc, không TRUNCATE. Ba bảng chỉ ghi thêm (`inventory_ledger`, `activity_log`, `scrap_price`) role app chỉ có `SELECT, INSERT`. **Chỉ role owner** được chạy migration và sao lưu/khôi phục; URL owner (`DATABASE_URL_MIGRATE`) **không bao giờ nằm trên server app**. Trigger chỉ ghi thêm vẫn giữ làm lớp chặn thứ hai. Lý do: rà soát bảo mật 01/11/2026 — lộ `DATABASE_URL` hoặc lỗi chèn SQL không được sửa/xóa được sổ kho và nhật ký (chốt 01/11/2026, change `db-least-privilege`) |
| 37 | Luật mã và quy cách vật tư | Mã vật tư **cho phép ký tự thực tế**: dấu phẩy `,`, dấu sao `*`, dấu cộng `+`, gạch ngang `-`, khoảng trắng (`H1,7`, `KU0,5`, `X5*10*3`, `KB+KU34`, `NỐI 34`). Hàng **có đầu / không đầu** (VD `H1,7` và `H1,7KĐ`) là **hai mã vật tư riêng biệt** trong danh mục (cùng trọng lượng chuẩn). Mã ghép (`KB+KU34`, `KB+KU38`) quản lý như một mã riêng. Đơn vị tính mở rộng thêm: `Mét` (M), `Kg`, `Bó`, `Sọt`, `Cuộn`, `Hộp`, `Thùng` (chốt 01/11/2026 từ file thực tế kế toán, change `catalog-extensions`) |
| 38 | Nghiệp vụ điều chuyển công trình, mua lại và đổi hàng | **Cho phép chuyển hàng thẳng giữa các công trình**: ghi nhận giảm số hàng ở công trình xuất và tăng số hàng ở công trình nhận mà không cần qua bãi trung gian. Nghiệp vụ **"Mua lại"**: vật tư phụ kiện tiêu hao (ty ren, bát chuồn...) khách mua đứt thì ghi nhận thu hồi giảm số lượng phải trả ở hợp đồng thuê và chuyển sang doanh thu bán hàng. Nghiệp vụ **"Đổi hàng"**: đổi quy cách vật tư tại công trình (xuất đổi chéo dài ↔ chéo ngắn, xuất đầu nối rời ghép vào khung không đầu) (chốt 01/11/2026 từ file thực tế kế toán; ban đầu thuộc change `returns-and-compensation`, tách sang change `site-operations` #132 ngày 03/11/2026) |
| 39 | Thời hạn thuê tối thiểu và VAT công nợ | Hợp đồng thuê có điều khoản **thời gian thuê tối thiểu (mặc định 45 ngày)**: trả hàng trước 45 ngày vẫn tính tròn 45 ngày thuê. **Thuế VAT**: tiền thuế VAT chỉ tính và cộng vào công nợ khi khách hàng yêu cầu xuất hóa đơn (chốt 01/11/2026 từ file thực tế kế toán, change `contracts` và `rental-billing`) |
| 40 | Mã hợp đồng, phụ lục & cấn trừ cọc | Cấu trúc số hợp đồng chuẩn: `MMYYYY/<VIẾT_TẮT_CÔNG_TY>-<TÊN_HOẶC_MÃ_KHÁCH>`, phụ lục đánh số `/01`, `/02`... **Tiền cọc giữ riêng theo từng hợp đồng**: hàng tháng khách vẫn trả đủ tiền thuê; tiền cọc **chỉ cấn trừ vào đợt thanh lý công trình cuối cùng** (sau khi đã tính đủ tiền thuê, vận chuyển và đền bù hư hỏng/mất mát; nếu cọc thừa thì hoàn trả lại cho khách) (chốt 01/11/2026 từ file thực tế kế toán, change `contracts` và `receivables`) |
| 41 | Đội xe tải, phân khu bãi & nhân viên phụ trách | Công ty vận hành xe tải nội bộ (đã ghi nhận 2 xe biển số `51X-000.01` và `51X-000.02`). Bãi và xưởng được chia thành **11 khu vực lưu trữ (KV 1 đến KV 11)**, phân định rõ **Thiết bị** (hàng kinh doanh giàn giáo) và **Vật tư** (máy móc, dụng cụ xưởng, que hàn...). Khách hàng được phân công theo **nhân viên kinh doanh phụ trách** (Khang, Thảo, Vy...) (chốt 01/11/2026 từ file thực tế kế toán, change `truck-management`, `stocktake`, `catalog-extensions`) |
| 42 | Chuẩn hóa thuật ngữ menu: Mua hàng | Đổi tên phân hệ/menu từ "Thu mua" sang **"Mua hàng"** (bao gồm mua sắm vật tư mới, phụ kiện, phụ tùng và thu mua giàn giáo cũ/sắt vụn) (chốt 02/11/2026, change `natural-ui-copy`) |
| 43 | Chuẩn hóa thuật ngữ menu: Cho thuê & Bán | Đổi tên phân hệ/menu từ "Bán & Thuê" sang **"Cho thuê & Bán"** (ưu tiên đưa nghiệp vụ cho thuê lên trước vì chiếm 90% doanh thu cốt lõi của doanh nghiệp) (chốt 02/11/2026, change `natural-ui-copy`) |
| 44 | Chuẩn hóa thuật ngữ di động: Việc hôm nay | Nhất quán nhãn tab chính của giao diện Mobile PWA là **"Việc hôm nay"** thay vì "Phiếu hôm nay" (ngắn gọn, thân thiện, phản ánh danh sách công việc trong ngày của thủ kho và thợ xưởng) (chốt 02/11/2026, change `natural-ui-copy`) |
| 45 | Phong cách microcopy và thông điệp hệ thống | Thông điệp cảnh báo, lỗi và đối thoại (microcopy) được chuẩn hóa theo **tiếng Việt tự nhiên, có chủ ngữ/vị ngữ rõ ràng**, nêu rõ lý do và hành động khắc phục, loại bỏ lối hành văn dịch máy cộc lốc (VD: *"Số lượng nhận (2.000 cái) vượt quá số lượng còn lại trên đơn (200 cái). Bạn có chắc chắn muốn nhập không?"*, *"Chỉ hỗ trợ kiểm kê tại Bãi và Xưởng"*) (chốt 02/11/2026, change `natural-ui-copy`) |
| 46 | Đơn vị "Cây" và khu vực của công trình | Thêm đơn vị **Cây** (đếm, có trọng lượng chuẩn; thép ống thô mua/bán theo cây 6 m) vào danh sách đơn vị của 0.2 #37. Công trình có **tỉnh/thành** (34 tỉnh/thành sau sắp xếp 07/2025); **khu vực suy ra từ tỉnh**: **Miền Bắc (15)** Hà Nội, Hải Phòng, Quảng Ninh, Bắc Ninh, Hưng Yên, Ninh Bình, Phú Thọ, Thái Nguyên, Tuyên Quang, Lào Cai, Lạng Sơn, Cao Bằng, Điện Biên, Lai Châu, Sơn La; **Miền Trung (11)** Thanh Hóa, Nghệ An, Hà Tĩnh, Quảng Trị, Huế, Đà Nẵng, Quảng Ngãi, Gia Lai, Đắk Lắk, Khánh Hòa, Lâm Đồng (gộp Tây Nguyên); **Miền Nam (8)** TP. Hồ Chí Minh, Đồng Nai, Tây Ninh, Cần Thơ, Vĩnh Long, Đồng Tháp, An Giang, Cà Mau. Đổi bảng chỉ sửa `src/domain/province.ts` (chốt 02/11/2026 khi duyệt PR #119, change `catalog-extensions`) |
| 47 | Hàng tính theo mét và tổng nhiều đơn vị | (1) **Chưa sửa chữa hàng tính theo mét**: phiếu sửa chữa từ chối mã đơn vị m (báo rõ lý do); hàng đếm có trọng lượng chuẩn (cái, cây, bó...) sửa như cái. Luật sửa hàng mét (số lẻ, hao hụt khi cắt) chốt sau. (2) **Nhận dư hàng tính theo mét** được dung sai **10 %** như kg; đơn vị đếm không có dung sai. (3) **Tổng số lượng không cộng lẫn đơn vị**: tổng phiếu sửa và danh sách D12 ghi tách theo đơn vị ("40 cái, 9 bó"). (4) Thẻ **"Chờ sửa" D10** đếm mọi mã có trọng lượng chuẩn, kể cả hàng mét (chốt 02/11/2026 khi review PR #119, change `catalog-extensions`) |
| 48 | Chậm thanh toán (mặc định tạm, Q5) | **Chưa tính lãi hay phạt chậm trả.** Hợp đồng lưu hạn thanh toán (mặc định lấy từ nhà thầu, sửa được); quá hạn chỉ **cảnh báo** trên Công nợ và khi duyệt hợp đồng mới (0.2 #15). Chủ trả lời Q5 khác thì thêm sau, không đổi dữ liệu cũ (chốt tạm 02/11/2026, change `contracts`, `receivables`) |
| 49 | Bảng giá đền bù (mặc định tạm, Q6) | Công ty có **một bảng giá đền bù chung** (mất, hỏng sửa được) theo mã hàng. Hợp đồng mới **chép giá từ bảng chung** rồi sửa riêng được; giá đã chép không đổi khi bảng chung đổi. Giá khác bảng chung được đánh dấu để Giám đốc thấy khi duyệt. Đổi giá sau duyệt đi qua phụ lục (0.2 #16) (chốt tạm 02/11/2026, change `contracts`, `returns-and-compensation`) |
| 50 | Bảo lãnh ngân hàng (mặc định tạm, Q7) | Cọc của hợp đồng gồm **cọc tiền** và/hoặc **bảo lãnh ngân hàng**. Bảo lãnh lưu: ngân hàng, số chứng thư, giá trị, ngày hết hạn. **Cảnh báo trước 30 ngày** khi sắp hết hạn, và khi gửi duyệt nếu bảo lãnh hết hạn trước ngày kết thúc dự kiến. Bảo lãnh không phải tiền nên không cấn trừ tự động khi thanh lý (0.2 #40) (chốt tạm 02/11/2026, change `contracts`) |
| 51 | Tách quyền hợp đồng thuê và bán | Quyền xem và tạo/sửa hợp đồng **tách theo loại** (cho thuê, bán) trong bảng quyền; thêm **phạm vi hợp đồng theo từng tài khoản** Kinh doanh: **Cả hai** (mặc định), **Chỉ cho thuê**, **Chỉ bán**, do **Giám đốc đặt ở D17**. Phạm vi chỉ áp cho vai trò Kinh doanh; Kế toán xem được cả hai loại, Giám đốc làm được tất cả. Server kiểm cả quyền vai trò lẫn phạm vi. Giữ nguyên 5 vai trò (#6), không tách vai trò Kinh doanh. Lý do: "người hàng thuê biết hàng thuê, người bán biết hàng bán" mà hai người cùng vai trò (chốt 02/11/2026 khi review PR #128, change `contracts`) |
| 52 | Tháng trong số hợp đồng | Phần `MMYYYY` của số hợp đồng (0.2 #40) lấy theo **ngày bắt đầu** của hợp đồng (thuê từ ngày; hợp đồng bán là ngày giao), không theo ngày ký hay ngày tạo. Số cấp lúc lưu lần đầu và **không đổi** sau đó, kể cả khi sửa ngày. Trùng gốc trong tháng thì thêm `-2`, `-3`; số đã cấp không dùng lại (chốt 02/11/2026 khi review PR #128, change `contracts`) |
| 53 | Đổi bảo lãnh, cọc sau khi duyệt | Ở MVP, **gia hạn bảo lãnh, đổi số chứng thư** hay đổi khoản cọc của hợp đồng đã duyệt đều đi qua **phụ lục** và Giám đốc **duyệt lại** (0.2 #16), để có dấu vết; không thêm cơ chế riêng. Nếu sau này thấy nặng thì tách khối cọc ra khỏi bản hợp đồng bằng một change riêng (chốt 02/11/2026 khi review PR #128, change `contracts`) |
| 54 | Trạng thái phiếu xuất | Phiếu xuất theo đợt: **Chờ nhặt → Đang nhặt → Đã xuất**; Đang nhặt về Chờ nhặt khi Thủ kho **trả lại văn phòng** hoặc văn phòng **rút về để sửa** (bắt buộc lý do); Chờ nhặt, Đang nhặt → **Đã hủy** (lý do). **Văn phòng lập** (quyền sửa hợp đồng đúng loại, 0.2 #51), **Thủ kho nhặt và xác nhận** xe rời bãi. Văn phòng chỉ sửa phiếu Chờ nhặt. Phiếu đã xuất không sửa, không hủy: xuất nhầm thì thu hồi. Một phiếu = một chuyến xe, lấy hàng từ **một bãi** (không xuất từ xưởng) (chốt 03/11/2026 khi review PR #130, change `deliveries`) |
| 55 | Ngày giao trên phiếu xuất | **Ngày giao = ngày ghi sổ** (giờ VN) lúc Thủ kho bấm "Xác nhận xe rời bãi"; không nhập tay, không ghi lùi. Xe đi tối, tới công trình sáng hôm sau vẫn lấy ngày xe rời bãi (tiền thuê tính từ hôm sau, #4). Giờ bấm trên điện thoại chỉ để xem; nháp gửi muộn sang ngày sau thì mang ngày gửi được, D6 nhắc để kế toán biết (chốt 03/11/2026 khi review PR #130, change `deliveries`) |
| 56 | Xuất thiếu và còn phải giao | Xuất thiếu (#17) **không tự tạo phiếu mới**: phần thiếu nằm trong **"còn phải giao"**, tính ra mỗi lần đọc, không lưu. **Hợp đồng thuê**: còn phải giao = số trên bản hợp đồng đang áp dụng − **số đang ở công trình** của hợp đồng (đọc từ sổ kho tại vị trí công trình: vào − ra), nên trả rồi lấy lại không bị coi là xuất vượt. **Hợp đồng bán**: số trên hợp đồng − **tổng đã giao**. Thuê xuất vượt chỉ **cảnh báo**, người lập xác nhận và nhật ký gắn cờ "Có xác nhận bất thường"; bán xuất vượt bị **chặn** (cần phụ lục), trừ dung sai cân (#57) (chốt 03/11/2026 khi review PR #130, change `deliveries`) |
| 57 | Dung sai cân khi bán theo kg | Dòng hợp đồng bán **theo kg**: số cần và còn phải giao tính bằng **kg**; khi nhặt so **kg cân**, số cái chỉ để trừ tồn. Mỗi chuyến, kg cân được vượt **số cần của phiếu** tới **10 %**; **tổng đã giao (kể cả chuyến này) được vượt số trên hợp đồng tới 10 %** (giống nhận dư hàng kg, #47), nên chuyến cuối nặng hơn phần còn lại vẫn đi được; vượt quá mới chặn. Hằng số dung sai đặt **một chỗ** trong `src/domain` (#33 quy ước 5) (chốt 03/11/2026 khi review PR #130, change `deliveries`) |
| 58 | Rã bộ khi xuất | Bộ trên phiếu xuất tách thành linh kiện theo **thành phần bộ trong danh mục lúc lập đợt** (hợp đồng không chép thành phần bộ); phiếu lưu số theo mã, bộ đổi sau không đổi phiếu. Mọi linh kiện phải có trên bản hợp đồng đang áp dụng (chốt 03/11/2026 khi review PR #130, change `deliveries`) |
| 59 | Xuất bán và phế liệu không đếm được | Xuất bán ghi `SALE_OUT` ở bãi, số lượng theo **đơn vị của mã**, kèm **kg cân** khi bán theo kg; không có dòng ở công trình. Phế liệu không đếm được số cái: Thủ kho nhập kg cân, máy **ước tính số cái** = kg ÷ trọng lượng chuẩn (làm tròn, tối thiểu 1, không quá tồn bãi), Thủ kho sửa được; phiếu đánh dấu "ước tính". Hợp đồng bán không có công trình xuất ở cùng màn D6 (theo hợp đồng) (chốt 03/11/2026 khi review PR #130, change `deliveries`) |
| 60 | Cước và giá trên phiếu xuất, mẫu in | "Công ty gọi xe" và cước một chiều lấy từ hợp đồng làm **mặc định**, văn phòng sửa trên phiếu; biển số gõ tay (chưa có danh mục xe). Phiếu lưu **cước** và **đơn giá bán từng dòng** (theo bản hợp đồng tại ngày giao); tiền tính ra, không lưu số cộng dồn. Điện thoại (M5) **không hiện giá, cước**. In phiếu lấy thông tin công ty từ Cài đặt; phiếu chưa xuất in "Phiếu nhặt hàng" không giá (chốt 03/11/2026 khi review PR #130, change `deliveries`) |
| 61 | Phiếu thu hồi | Mỗi phiếu thu hồi thuộc **một hợp đồng thuê Đang thực hiện** và về **một bãi**. Thủ kho chia số trả về thành **Tốt / Chờ sửa / Phế liệu** và nhập số **Mất**; tổng trả về + mất mỗi mã không vượt **số đang ở công trình của hợp đồng**. Mã không có ở công trình của hợp đồng (kể cả hàng của hợp đồng khác cùng nhà thầu) bị **chặn**: lập phiếu riêng cho hợp đồng kia; hàng không thuộc công ty ghi vào ghi chú. **Ngày trả = ngày ghi sổ** (giờ VN), như #55; hàng mất tính trả cùng ngày (#21). Phiếu chỉ có trên server khi đã ghi sổ, **không sửa, không hủy**: đếm sai thì điều chỉnh tồn và giảm trừ đền bù (chốt 03/11/2026 khi review PR #134, change `returns-and-compensation`) |
| 62 | Đổi tình trạng khi thu hồi | Ở công trình hệ thống rút **Mới trước, rồi Tốt** (lần lượt cho Tốt, Chờ sửa, Phế liệu, Mất). Hàng ra ở giá BQ của tình trạng gốc, vào bãi ở **giá BQ của tình trạng mới**: giá BQ không đổi (#11), mỗi nhóm vẫn tồn × giá BQ (#24), tổng giá trị kho giảm đúng phần chênh ("Giá trị giảm do đổi tình trạng", tính từ sổ, không lưu). (Mã + tình trạng) chưa từng có giá thì lấy giá dòng ra; riêng **Phế liệu lần đầu = min(kg quy đổi × giá sắt vụn tham khảo lúc ghi sổ, giá dòng ra)** như #23, #27; chưa có giá sắt vụn thì không ghi sổ được phiếu đó (chốt 03/11/2026 khi review PR #134, change `returns-and-compensation`) |
| 63 | Hàng mất trên sổ kho | Hàng mất ghi loại dòng sổ riêng **`LOSS_OUT`** ở vị trí công trình, giá trị = số × giá BQ, không đổi giá BQ; tách khỏi `ADJUST_OUT` (điều chỉnh, kiểm kê) để báo cáo và tính thuê phân biệt được. "Giá trị hàng mất" trên phiếu tính từ sổ (chốt 03/11/2026 khi review PR #134, change `returns-and-compensation`) |
| 64 | Phiếu đền bù | **Tự sinh khi ghi sổ thu hồi** nếu có Chờ sửa, Phế liệu hoặc Mất (không có thì không tạo); giá chép từ bản hợp đồng tại **ngày trả** theo #20. Trạng thái **Chờ duyệt → Đã duyệt / Đã từ chối**, chỉ Giám đốc chuyển. Trước khi duyệt chỉ sửa **giá của dòng hợp đồng chưa có giá** và **giảm trừ** (bắt buộc lý do); không sửa số lượng. Nhà thầu nợ quá hạn: chỉ cảnh báo, duyệt bắt buộc lý do (như #15). Từ chối bắt buộc lý do, **không quay lại**. Khi duyệt lưu **tiền phải thu** (sau giảm trừ), ngày duyệt, **hạn trả = ngày duyệt + số ngày được nợ** của hợp đồng (#18); phiếu bị khóa. Kinh doanh (phạm vi có cho thuê) và Kế toán **xem** được phiếu và ảnh, không duyệt (chốt 03/11/2026 khi review PR #134, change `returns-and-compensation`) |
| 65 | Ảnh thu hồi | Lưu trong **Postgres** (`bytea`) ở giai đoạn demo: server kiểm loại theo nội dung, **xóa EXIF**, nén lại **WebP cạnh dài 1.280 px, chất lượng 70** (khoảng 100 KB), tối đa **4 MB / ảnh gửi lên** và **6 ảnh / phiếu**; dùng thư viện `sharp`. Xem qua route có kiểm quyền, không có đường dẫn công khai. **Cảnh báo** khi tổng ảnh vượt **200 MB** (ngưỡng một chỗ trong `src/domain`) vì Neon Free chỉ có 0,5 GB cho cả DB. Lên production trả phí thì làm change chuyển sang kho đối tượng riêng tư; mốc ghi ở `docs/ops/demo.md` (chốt 03/11/2026 khi review PR #134, change `returns-and-compensation`) |
| 66 | Chuyển hàng thẳng giữa công trình | Văn phòng lập phiếu chuyển trên desktop (từ D6 của hợp đồng đi, D6b), chọn hợp đồng thuê nhận và số theo mã; **hai cách xác nhận**: (1) văn phòng xác nhận ngay khi xe đã chở xong, hoặc (2) gửi điện thoại để người đi xe xác nhận khi hàng tới nơi (M9), được sửa số thực chở. Ngày chuyển = ngày ghi sổ (như #55): hợp đồng đi tính thuê đến hết ngày đó, hợp đồng nhận tính từ hôm sau. Rút Mới trước rồi Tốt như thu hồi; hàng giữ nguyên tình trạng; hàng hỏng không chuyển mà về bãi bằng phiếu thu hồi. Mã phải có trên hợp đồng nhận; khác nhà thầu thì phải tích xác nhận (chốt 03/11/2026, change `site-operations`) |
| 67 | Mua lại hàng đang thuê | Đơn giá **điền sẵn bằng giá mất** trên bản hợp đồng đang áp dụng, Kinh doanh sửa được (giá khác hợp đồng được đánh dấu). **Giám đốc duyệt** (D6c, như phiếu đền bù; nợ quá hạn thì bắt buộc lý do, #15); duyệt xong mới ghi sổ (dòng bán ở vị trí công trình, theo giá BQ), thôi tính thuê từ ngày duyệt (tính đến hết ngày đó) và tính tiền bán cho công nợ. Không mua lại quá số đang ở công trình (chốt 03/11/2026, change `site-operations`) |
| 68 | Đổi hàng tại công trình | Làm bằng **một đợt xuất + một phiếu thu hồi nối với nhau** (D6d), dùng lại M5 và M4, không có chứng từ riêng. Mã giao ra phải có trên hợp đồng đang áp dụng; số nhận về chỉ là dự kiến, Thủ kho đếm và chia tình trạng trên M4 (hỏng, mất tự sinh phiếu đền bù). Tiền thuê theo ngày giao của phiếu xuất và ngày trả của phiếu thu hồi (chốt 03/11/2026, change `site-operations`) |
| 69 | Phiếu chuyển công trình: chi tiết | Chuyển vượt **còn phải giao** của hợp đồng nhận chỉ **cảnh báo**, người lập xác nhận, nhật ký gắn cờ "Có xác nhận bất thường" (như #56); mã chưa có trên hợp đồng nhận vẫn chặn (#66). Trên điện thoại (M9) **chỉ được giảm** số thực chở, không tăng; muốn chở thêm thì văn phòng rút phiếu về sửa. **Cho chuyển giữa hai hợp đồng cùng một công trình** (gia hạn bằng hợp đồng mới): tồn vị trí không đổi, chỉ đổi hợp đồng tính thuê. Phiếu chuyển **không lưu cước** (chỉ biển số), làm sau nếu kế toán cần (chốt 04/11/2026 khi review PR #138, change `site-operations`) |
| 70 | Thuê tối thiểu khi chuyển công trình | **Cùng nhà thầu**: phần hàng chuyển **không áp tối thiểu 45 ngày ở hợp đồng đi** (chỉ tính số ngày thật tới hết ngày chuyển), vì khách vẫn thuê liên tục, không trả hai lần cho thời gian chồng nhau. **Khác nhà thầu**: tối thiểu áp riêng từng hợp đồng. Phiếu chuyển lưu **cờ cùng nhà thầu**; cách gộp chuỗi thuê liên tục khi tính tối thiểu ở hợp đồng nhận do `rental-billing` chốt (liên quan 0.2b Q2) (chốt 04/11/2026 khi review PR #138, change `site-operations`) |
| 71 | Phiếu mua lại: chi tiết | Hàng mua lại **áp tối thiểu 45 ngày** như hàng trả về, coi như trả vào **ngày duyệt**. Phiếu **không có Nháp**: lưu là Chờ duyệt, Kinh doanh sửa được khi còn Chờ duyệt, lập sai thì Giám đốc từ chối. Đơn giá **khác giá hợp đồng** (kể cả 0 ₫) thì nhật ký gắn cờ "Có xác nhận bất thường" (chốt 04/11/2026 khi review PR #138, change `site-operations`) |
| 72 | Đổi hàng: chi tiết | Số nhận về chỉ là **dự kiến**, không chặn khi đếm khác. **Thứ tự hai phiếu tự do**: phiếu thu hồi lưu được trước khi đợt xuất ghi sổ. Văn phòng được **"Bỏ chờ thu hồi"** (bắt buộc lý do) khi khách giữ hàng cũ; đợt xuất giữ nguyên. Đổi hàng chỉ có cước chiều đi trên đợt xuất (chốt 04/11/2026 khi review PR #138, change `site-operations`) |
| 73 | Ngày nghỉ không tính thuê (mặc định tạm, Q1) | Giám đốc khai **bảng ngày nghỉ chung** ở Cài đặt (VD Tết Nguyên đán, lễ): mỗi dòng có tên và khoảng ngày. Khi tính tiền thuê, những ngày đó **không tính** cho mọi hợp đồng thuê (thay cho việc gõ tay −9, −1, −2 trong Excel). Bảng kê hiện rõ số ngày bị trừ trên từng dòng. Chủ trả lời Q1 khác thì đổi sau (chốt tạm 04/11/2026, change `rental-billing`) |
| 74 | Thuê tối thiểu theo từng lượng hàng (mặc định tạm, Q2) | Tối thiểu 45 ngày (#39) tính **theo từng lượng hàng xuất**: mỗi lượng tính từ ngày giao của nó; lượng nào trả (hoặc mua lại; hàng mất không bù, xem #76) trước 45 ngày thì bù cho đủ 45 ngày, dù phần còn lại của hợp đồng vẫn đang thuê. Hàng chuyển công trình cùng nhà thầu theo #70. Chủ trả lời Q2 khác thì đổi sau (chốt tạm 04/11/2026, change `rental-billing`) |
| 75 | Ngày nghỉ và tối thiểu khi tính tiền thuê | Tối thiểu (#39, #74) so với **số ngày tính đã trừ ngày nghỉ** (#73) của lượng hàng qua mọi kỳ, để khách luôn trả ít nhất 45 ngày tiền: VD giao 01/02, trả 20/02/2027 (Tết 9 ngày) tính 10 ngày + bù 35 ngày. **Dòng bù ghi ở kỳ có ngày trả**, không có Từ / Đến, không trừ ngày nghỉ, **giá ngày tại ngày trả** (chốt 04/11/2026 khi review PR #140, change `rental-billing`) |
| 76 | Hàng mất và hàng trả cùng ngày giao không bù tối thiểu | **Hàng mất không bù 45 ngày**: giữ đúng #21, mất thì thôi tính thuê từ ngày lập phiếu thu hồi, chỉ tính đền bù. Phế liệu, Chờ sửa là hàng trả về nên vẫn bù. Hàng **giao và trả cùng ngày** (VD xuất nhầm mã) **miễn tối thiểu**: 0 ngày thuê, không có dòng bù (chốt 04/11/2026 khi review PR #140, change `rental-billing`) |
| 77 | Trả hàng trừ lượng giao nào trước | Mỗi dòng giao của một mã (phiếu xuất, phiếu chuyển tới) là một **lượng hàng**. Hàng trả, mất, mua lại, chuyển đi **trừ lượng giao sớm nhất trước** (FIFO; cùng ngày thì chứng từ mã nhỏ trước), không theo tình trạng. Lý do: giống cách kế toán trừ trong Excel, có lợi cho khách (lượng cũ dễ đủ 45 ngày) (chốt 04/11/2026 khi review PR #140, change `rental-billing`) |
| 78 | Chốt kỳ tiền thuê | Kỳ = tháng dương lịch. Chỉ chốt khi **kỳ đã hết**, và **chốt kỳ trước rồi mới chốt kỳ sau** (tháng không có tiền thì bỏ qua). Phiếu chưa xong (Chờ nhặt, Đang nhặt, chuyển Chờ xác nhận, mua lại Chờ duyệt, nháp trên máy) **không chặn** chốt: khi ghi sổ chúng tính vào kỳ của ngày ghi sổ. **Hạn trả = ngày cuối kỳ + số ngày được nợ** của hợp đồng ("ngày chốt kỳ" ở #18 là ngày cuối tháng), không theo ngày kế toán bấm chốt. Kinh doanh chỉ **xem** D7 (mở từ D5 của hợp đồng, theo phạm vi #51), không chốt, không ghi điều chỉnh (chốt 04/11/2026 khi review PR #140, change `rental-billing`) |
| 79 | VAT của kỳ tiền thuê | VAT (khi khách lấy hóa đơn, #39) áp lên **tiền thuê, dòng điều chỉnh và cước vận chuyển**. Phụ lục đổi VAT giữa kỳ thì **mỗi dòng theo VAT của bản hợp đồng tại ngày của dòng** (dòng thuê: ngày Từ; dòng bù: ngày trả; cước: ngày giao; điều chỉnh: cuối kỳ); VAT làm tròn tới 1 ₫ trên tổng cùng thuế suất (chốt 04/11/2026 khi review PR #140, change `rental-billing`) |
| 80 | Dòng điều chỉnh kỳ trước | Kế toán hoặc Giám đốc ghi sai sót của kỳ đã chốt (#22) thành **một dòng tiền kèm lý do** ở một kỳ chưa chốt sau đó, **không cần Giám đốc duyệt**. Được ghi **số âm** (tính thừa thì giảm cho khách); **khoản âm gắn cờ "Có xác nhận bất thường"** trên nhật ký để Giám đốc thấy ở D18 (chốt 04/11/2026 khi review PR #140, change `rental-billing`) |
| 81 | Thanh lý hợp đồng | Thanh lý (Đang thực hiện → Thanh lý) làm trong change `receivables`. Điều kiện: không còn hàng ở công trình, kỳ tiền thuê cuối đã chốt, không còn đền bù / mua lại Chờ duyệt, không còn phiếu xuất / chuyển chưa xong. Khi thanh lý: **cọc tiền đã nhận cấn trừ các khoản còn nợ của chính hợp đồng đó** (#40), cọc thừa ghi **hoàn lại khách**; cọc thiếu thì phần còn lại vẫn là nợ thường. Thanh lý xong hợp đồng bị khóa. Ai thanh lý: #85 (chốt 05/11/2026, change `receivables`, thiết kế D14b) |
| 82 | Nhà thầu trả dư | Phần trả nhiều hơn số đang nợ **giữ làm tiền trả trước** của nhà thầu, **tự trừ vào khoản phát sinh sau** theo #19 (khoản đến hạn sớm nhất trước). Tiền trả trước không cấn với cọc (chốt 05/11/2026, change `receivables`) |
| 83 | Phiếu thu ghi sai | Phiếu thu **không sửa**. Ghi sai thì **Kế toán hủy, bắt buộc ghi lý do**: các khoản đã trừ mở lại, rồi lập phiếu mới. Phiếu đã hủy vẫn giữ và có trên nhật ký (chốt 05/11/2026, change `receivables`) |
| 84 | VAT ngoài kỳ tiền thuê | **Hàng bán** (và cước của phiếu xuất bán) cộng VAT theo bản hợp đồng tại **ngày giao**, khi hợp đồng bật VAT (#39). **Đền bù và mua lại không cộng VAT** (là bồi thường). Công nợ hiện số đã gồm VAT; Excel tách cột VAT (chốt 05/11/2026, change `receivables`) |
| 85 | Ai thanh lý hợp đồng | **Kế toán hoặc Giám đốc** bấm thanh lý (D14b), **không cần Giám đốc duyệt riêng**: mọi khoản được cấn đã qua duyệt, hoàn cọc là phép trừ. Giám đốc thấy dòng "Thanh lý" trên nhật ký D18 (chốt 05/11/2026 khi review PR #145, change `receivables`) |
| 86 | Kinh doanh và màn Công nợ | Kinh doanh **không xem D14** (công nợ do Kế toán, Giám đốc quản lý, 0.4). Kinh doanh vẫn thấy **cảnh báo nợ quá hạn** của nhà thầu trên hợp đồng như cũ (#15) (chốt 05/11/2026 khi review PR #145, change `receivables`) |
| 87 | Thanh lý hợp đồng bán | Hợp đồng bán **cũng thanh lý được**. Điều kiện: không còn phiếu xuất Chờ nhặt / Đang nhặt, không còn phụ lục Nháp / Chờ duyệt; hàng chưa giao hết **không chặn** (chốt 05/11/2026 khi review PR #145, change `receivables`) |
| 88 | Nộp cọc tiền | Phiếu thu nộp cọc chỉ nhận khi hợp đồng **Đã duyệt hoặc Đang thực hiện**, và tổng cọc đã nhận **không vượt** tổng cọc tiền thỏa thuận của bản hợp đồng đang áp dụng (chốt 05/11/2026 khi review PR #145, change `receivables`) |
| 89 | Phụ lục hợp đồng bán | Ngày hiệu lực phụ lục của hợp đồng bán **phải sau ngày giao của phiếu xuất bán gần nhất**, để VAT và hạn trả của hàng đã giao không đổi (giống luật "sau kỳ đã chốt" của hợp đồng thuê). Không lưu VAT, hạn lên phiếu xuất (chốt 05/11/2026 khi review PR #145, change `receivables`) |
| 90 | Doanh số trên Tổng quan | Tính **theo phát sinh**: **thuê** = tiền thuê từng ngày tính từ sổ kho theo cùng công thức kỳ tiền thuê (giá ngày × số đang ở công trình, trừ ngày nghỉ; dòng bù tối thiểu tính vào ngày trả); tháng chưa chốt hiện **tạm tính**, tháng đã chốt lấy số chụp của kỳ. **Bán** = hàng bán + cước theo **ngày giao**. **Đền bù, mua lại hiện riêng**, không cộng vào doanh số. Số **chưa gồm VAT**. Xem theo ngày và theo tháng (chốt 06/11/2026, change `dashboard-basic`) |
| 91 | Ai thấy tiền trên Tổng quan | Doanh số, top nhà thầu theo doanh thu, công nợ quá hạn và số tiền khi tra nhanh công trình: **Giám đốc, Kế toán**. Kinh doanh tra công trình thấy **số hàng**, không thấy tiền (chốt 06/11/2026, change `dashboard-basic`) |
| 92 | Công trình đang rủi ro | Một công trình rủi ro khi có ít nhất một dấu hiệu: **nợ quá hạn** (của hợp đồng ở công trình đó); **có hàng mất trong 30 ngày** gần nhất; **quá ngày kết thúc hợp đồng mà còn hàng** ở công trình. Tính ra, không lưu; ngưỡng 30 ngày đặt một chỗ trong `src/domain` (chốt 06/11/2026, change `dashboard-basic`) |
| 93 | Xếp hạng nhà thầu | Tổng quan có **Top 5 nhà thầu năm nay**, đổi được **theo doanh thu** (thuê + bán, chưa VAT, như #90) hoặc **theo kg** (nghĩa "kg" chốt trong PR propose). Bảng xếp hạng đầy đủ để Bản 2 (`management-reports`) (chốt 06/11/2026, change `dashboard-basic`) |
| 94 | Việc chờ duyệt trên Tổng quan | Giám đốc thấy "chờ bạn duyệt". Kế toán, Kinh doanh thấy khối **"đang chờ Giám đốc duyệt"** trong phạm vi mình xem được (Kế toán: hợp đồng / phụ lục, đền bù, mua lại, kiểm kê, điều chỉnh kho; Kinh doanh: hợp đồng / phụ lục trong phạm vi tài khoản, đền bù, mua lại). Câu chào đổi theo, VD "Chào Thu Hà, có 3 việc đang chờ Giám đốc duyệt" (chốt 06/11/2026 khi review PR #148, change `dashboard-basic`) |
| 95 | Top 5 "theo kg" | = **kg hàng đã giao trong năm**: thuê + bán, theo phiếu xuất đã ghi sổ có ngày giao từ 01/01 đến hôm nay (số lượng × trọng lượng chuẩn; mã theo kg hoặc dòng có kg cân lấy kg). **Không trừ hàng trả** (chốt 06/11/2026 khi review PR #148, change `dashboard-basic`) |
| 96 | Cước của hợp đồng thuê trong doanh số | Cước vận chuyển trên bảng kê kỳ tiền thuê cộng vào cột **Thuê**, theo ngày giao. "Bán = hàng bán + cước" ở #90 chỉ nói cước của phiếu xuất bán (chốt 06/11/2026 khi review PR #148, change `dashboard-basic`) |
| 97 | Hàng ở ngoài cho Kinh doanh | Kinh doanh thấy khối Hàng ở ngoài cho **toàn công ty**: chỉ số lượng và tấn, không có tiền (chốt 06/11/2026 khi review PR #148, change `dashboard-basic`) |
| 98 | Công nợ phải trả: trả cho ai | Chỉ theo dõi tiền phải trả **người bán hàng** (nhà cung cấp, cá nhân, cai thầu bán hàng cũ / phế liệu). Cước xe, bốc xếp của chuyến (chi phí mua hàng, #26) trả ngay, **không** thành khoản phải trả (chốt 06/11/2026, change `payables`, thiết kế D14c) |
| 99 | Khoản phải trả phát sinh và hạn trả | **Mỗi phiếu nhập đã ghi sổ** là một khoản phải trả: số thực nhận × đơn giá dòng đơn (kg theo cân thực tế, #13). **Hạn = ngày nhập + số ngày được nợ** của người bán; thêm trường số ngày được nợ vào danh mục người bán (D16), **mặc định 0 = trả ngay khi nhập**. Quá hạn tính theo ngày Việt Nam (chốt 06/11/2026, change `payables`) |
| 100 | Ứng trước cho người bán | Cho phép **ứng tiền trước** khi nhận hàng (phiếu chi loại Ứng trước). Tiền ứng và phần chi dư giữ làm **tiền ứng trước** của người bán, **tự trừ vào phiếu nhập sau** theo khoản đến hạn sớm nhất trước, giống tiền trả trước phải thu (#82). Phiếu chi không sửa; ghi sai thì Kế toán hủy, bắt buộc lý do (như #83) (chốt 06/11/2026, change `payables`) |
| 101 | VAT hàng mua | **Chưa tính VAT đầu vào**: giá trên đơn là số phải trả người bán (chốt 06/11/2026, change `payables`) |
| 102 | Phiếu ứng trước | Phiếu chi loại **Ứng trước chỉ ghi được khi người bán hết nợ**. Còn nợ thì ghi Trả tiền hàng; phần dư tự thành tiền ứng trước (chốt 06/11/2026 khi review PR #152, change `payables`) |
| 103 | Ai ghi phiếu chi | **Giám đốc, Kế toán** ghi và hủy phiếu chi. Thủ kho trả tiền mặt lúc nhận hàng thì báo Kế toán ghi, **ngày chi = ngày trả thật**. M3 không có ô tiền (chốt 06/11/2026 khi review PR #152, change `payables`) |
| 104 | Tình hình người bán trên D14c | Theo **đúng luật D14**: khoản hạn sớm nhất còn ≤ 7 ngày thì hiện "Hạn dd/mm", xa hơn hiện "Chưa đến hạn". Bản vẽ D14c ghi "Hạn 20/11" là vẽ sai, đã sửa (chốt 06/11/2026 khi review PR #152, change `payables`) |
| 105 | Phiếu nhập trước khi dùng phải trả | Phiếu nhập đã ghi sổ trước khi deploy **thành khoản còn nợ, hạn = ngày nhập**; Kế toán ghi phiếu chi bù cho khoản đã trả. Nợ đầu kỳ người bán (từ Excel) nhập ở change `data-migration` (#48) (chốt 06/11/2026 khi review PR #152, change `payables`) |
| 106 | Khóa phiếu nhập ở DB | Phiếu nhập đã ghi sổ (phiếu, dòng, chi phí chuyến) **chỉ ghi thêm ở DB**; trigger khóa đơn giá / đơn vị / mã của dòng đơn đã có phiếu nhập (chốt 06/11/2026 khi review PR #152, change `payables`) |
| 107 | Lợi nhuận gộp (Q12) | Lợi nhuận gộp = **doanh thu chưa VAT** (thuê gồm cước thuê, bán gồm cước bán, đền bù đã duyệt, mua lại đã duyệt) − **giá vốn và hao hụt thực tế**: giá vốn hàng bán, giá vốn hàng khách mua lại, hàng mất ở công trình, giảm giá trị khi hàng trả về đổi tình trạng (#112), sửa chữa (lỗ hỏng hàng; chi phí sửa vào lợi nhuận khi hàng rời kho, #111), chênh lệch kiểm kê và điều chỉnh (#113). Hàng cho thuê **không trừ khấu hao**; mọi số lấy từ sổ kho và chứng từ (chốt 06/11/2026, change `management-reports`, thiết kế D15; sửa 06/11/2026 khi review PR #155) |
| 108 | Chỉ số hao hụt (Q12) | Hao hụt = **tấn hàng mất, thành phế, phải sửa** (khi thu hồi) **trên mỗi 100 tấn hàng cho thuê bình quân** trong kỳ (Mới, Tốt ở bãi, xưởng và công trình, #114). Theo tháng / quý / năm và theo mã hàng (chốt 06/11/2026, change `management-reports`; sửa 06/11/2026 khi review PR #155) |
| 109 | Tỷ lệ khai thác | Tỷ lệ khai thác = hàng **ở công trình ÷ tổng hàng Mới, Tốt**, **bình quân theo ngày** trong kỳ. Tổng cả kho tính **theo tấn**; bảng chi tiết **theo từng mã, tính theo cái** (chốt 06/11/2026, change `management-reports`) |
| 110 | Ai xem Báo cáo quản trị | D15 cho **Giám đốc, Kế toán**. Có thêm bảng xếp hạng nhà thầu đầy đủ của năm (theo doanh thu / theo kg, như #93, #95) (chốt 06/11/2026, change `management-reports`) |
| 111 | Chi phí sửa trong lợi nhuận gộp | Chi phí sửa đã cộng vào giá hàng Tốt (#23) nên **không trừ ngay khi ghi sổ phiếu sửa**; nó vào lợi nhuận khi hàng đó rời kho (bán, mất, trả về hỏng lại) theo giá BQ. Dòng "Sửa chữa" trên D15 chỉ gồm **lỗ hỏng hàng**; dưới bảng ghi "Chi phí sửa đã chi trong kỳ: x ₫". Lý do: trừ ngay thì khoản đó bị trừ hai lần khi hàng rời kho (chốt 06/11/2026 khi review PR #155, change `management-reports`) |
| 112 | Giảm giá trị khi trả về | = giá trị hàng rời công trình − giá trị hàng nhập bãi của từng phiếu thu hồi, **gồm cả Mới → Tốt**, đúng số "Giá trị giảm do đổi tình trạng" trên phiếu; hàng mất tính riêng. Nhãn D15: "Giảm giá trị khi trả về đổi tình trạng" (chốt 06/11/2026 khi review PR #155, change `management-reports`) |
| 113 | Phiếu điều chỉnh trong lợi nhuận | Phiếu `ĐC` (số lượng, tình trạng, vị trí) **vào lợi nhuận**, gộp với kiểm kê thành dòng "Chênh lệch kiểm kê và điều chỉnh". Phiếu `ĐCG`, tồn đầu kỳ, phiếu nhập **không** vào (sửa giá hàng còn trong kho, vào lợi nhuận khi hàng rời kho) (chốt 06/11/2026 khi review PR #155, change `management-reports`) |
| 114 | Hàng cho thuê bình quân | Gồm hàng **Mới, Tốt ở mọi vị trí: bãi, xưởng, công trình** (hàng Tốt vừa sửa xong ở xưởng vẫn là hàng cho thuê); dùng cho hao hụt (#108) và tỷ lệ khai thác (#109) (chốt 06/11/2026 khi review PR #155, change `management-reports`) |
| 115 | Xếp hạng nhà thầu trên D15 | Hiện **đủ mọi nhà thầu** (bảng cuộn), không gộp "N nhà thầu khác"; Excel cũng đủ (chốt 06/11/2026 khi review PR #155, change `management-reports`) |
| 116 | Tháng của hàng mất và đền bù | Hàng mất tính theo **ngày trả** (ngày ghi sổ phiếu thu hồi), đền bù theo **ngày duyệt**; hai khoản có thể rơi vào hai tháng khác nhau, D15 ghi chú dưới bảng. Lũy kế năm đủ cả hai (chốt 06/11/2026 khi review PR #155, change `management-reports`) |
| 117 | Công thợ sửa chữa | **Khoán theo cái**: mỗi mã hàng có **đơn giá công sửa / cái** (trường mới ở danh mục mã hàng D9). Công của một dòng lệnh = **số sửa xong × đơn giá**; hàng thành phế không tính công (chốt 07/11/2026, change `repair-work-orders`, thiết kế D12 đầy đủ, M8) |
| 118 | Vật tư phụ khi sửa | Vật tư phụ (que hàn, sơn, bu lông…) là mã nhóm **Vật tư** (`MATERIAL`) trong danh mục, có tồn ở xưởng. Xưởng ghi số lượng dùng **theo từng dòng mã hàng** của lệnh; ghi sổ thì **trừ tồn theo giá BQ**. Chi phí sửa của dòng = công khoán + vật tư; chia cho hàng sửa xong như #23 (chốt 07/11/2026, change `repair-work-orders`) |
| 119 | Rút hàng sang xưởng | Hàng Chờ sửa **chuyển vị trí bãi → xưởng khi xưởng nhận lệnh** (ghi sổ chuyển vị trí, không đổi giá). Giá trị Tốt / Phế liệu, công, vật tư chỉ ghi sổ khi **ghi sổ lệnh** (chốt 07/11/2026, change `repair-work-orders`) |
| 120 | Nghiệm thu lệnh sửa | Luồng: Kế toán / Giám đốc lập lệnh và giao xưởng → Xưởng nhận (M8) → Xưởng ghi sửa xong, phế, vật tư và **báo sửa xong** (M8, không thấy giá) → **Thủ kho đếm lại** và xác nhận số → **Kế toán ghi sổ** (`repairs.manage` như nay), có thể trả lại xưởng sửa số (chốt 07/11/2026, change `repair-work-orders`) |
| 121 | Phiếu sửa đơn giản sau khi có lệnh sửa | **Ngừng lập phiếu sửa đơn giản mới**: nút tạo trên `/repairs` mở lệnh sửa. Phiếu đơn giản Nháp đã có vẫn sửa, xóa, ghi sổ được (chi phí gõ tay); phiếu đã ghi sổ giữ nguyên (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 122 | Đơn vị lít | Thêm **đơn vị Lít** cho vật tư như sơn: đơn vị đo, tối đa 3 chữ số lẻ, cần trọng lượng chuẩn (kg/lít) như mét (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 123 | Ai sửa đơn giá công sửa | Đơn giá công sửa / cái trên D9 do **Giám đốc, Kế toán** sửa (`repairs.manage`); người có `repairs.view` xem được (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 124 | Hủy lệnh sửa sau khi xưởng đã nhận | **Tự ghi sổ chuyển hàng Chờ sửa về bãi gốc** (xưởng → chỗ lấy, ngày hủy) trong cùng thao tác hủy; vật tư chưa ghi sổ nên không đổi (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 125 | Vật tư trong chỉ số hàng cho thuê | D15 **bỏ mã nhóm Vật tư** khỏi hàng cho thuê bình quân, hao hụt và tỷ lệ khai thác (#108, #109, #114) (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 126 | Lúc chụp đơn giá công | Đơn giá công của dòng lệnh **chụp lúc giao xưởng**; sửa danh mục sau đó không đổi lệnh đã giao; thu hồi rồi giao lại thì chụp lại (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 127 | Tình trạng vật tư xuất dùng | Vật tư phụ xuất **Mới trước rồi Tốt**, như luật thu hồi (#62) (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 128 | Thủ kho nghiệm thu | Thủ kho **đếm lại sửa xong / phế và sửa được số vật tư**; ghi sổ dùng số Thủ kho đếm; D12 hiện số xưởng báo cạnh số đếm khi khác nhau (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 129 | Khi nào số của xưởng lên server | Số sửa xong, phế, vật tư của xưởng **chỉ lên server khi bấm "Báo sửa xong"**; trước đó nằm trong nháp trên máy, D12 hiện "Xưởng đang sửa" (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 130 | Nơi nhập hàng sau sửa | Khi ghi sổ lệnh, **hàng Tốt và Phế liệu nhập về bãi gốc** (bãi đã lấy hàng), không ở lại xưởng: phiếu xuất chỉ lấy hàng từ một bãi. Chờ sửa xuất ở xưởng, vật tư trừ ở xưởng. Lệnh lấy hàng tại chính xưởng thì nhập ở xưởng. Thủ kho đếm khi hàng về bãi (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 131 | Phiếu nhập vật tư vào xưởng | Phiếu nhập **được nhập thẳng vào xưởng** khi **mọi dòng là mã nhóm Vật tư**; có mã Thiết bị thì vẫn chỉ nhập vào bãi. Server kiểm, M3 chỉ hiện xưởng khi đơn chỉ có vật tư (chốt 07/11/2026 khi review PR #158, change `repair-work-orders`) |
| 132 | Thư viện vẽ mã QR | Thêm **`uqr`** (MIT, không phụ thuộc gói nào) để vẽ mã QR khi bật xác thực 2 lớp, vẽ thành `<svg>`. Màn bật **luôn hiện cả chuỗi bí mật** để gõ tay. K5 #40 (in nhãn QR) dùng lại được thư viện này (chốt 09/11/2026 khi review PR #162, change `director-mfa`) |
| 133 | Ai bắt buộc xác thực 2 lớp | Bắt buộc cho **Giám đốc và Kế toán** (Kế toán giữ công nợ, phiếu thu, phiếu chi). Kinh doanh, Thủ kho, Xưởng không bị hỏi. Bản demo (`DEMO_MODE=true`) không dùng (chốt 09/11/2026 khi review PR #162, change `director-mfa`) |
| 134 | Mã dự phòng xác thực 2 lớp | Mỗi người **10 mã**, mỗi mã **16 ký tự** dạng `XXXX-XXXX-XXXX-XXXX`, không phân biệt hoa thường. Hiện đúng một lần, chỉ lưu dạng băm, mỗi mã dùng một lần (chốt 09/11/2026 khi review PR #162, change `director-mfa`) |
| 135 | Tin thiết bị khi xác thực 2 lớp | Ở bước nhập mã có ô **"Tin thiết bị này 30 ngày"**, mặc định không chọn. Máy đã tin chỉ cần mật khẩu; hạn 30 ngày tính lại sau mỗi lần đăng nhập trên máy đó. Mã dự phòng không tin được máy. Đổi mật khẩu, đặt lại mật khẩu, đổi điện thoại, lệnh cứu hộ, hoặc bấm "Quên mọi thiết bị đã tin" thì mọi máy đều mất tin (chốt 09/11/2026 khi review PR #162, change `director-mfa`) |
| 136 | Màn xác thực 2 lớp | **Vẽ trước khi apply**: bước nhập mã ở đăng nhập và trang `/two-factor` (`docs/design/screens/`, `docs/ui.md` mục 3.4). Chỉ apply sau khi người dùng duyệt bản vẽ (chốt 09/11/2026 khi review PR #162, change `director-mfa`) |
| 137 | Ai chạy lệnh cứu hộ xác thực 2 lớp | **Admin hệ thống** (người giữ quyền vào DB production) chạy `auth:reset-2fa`, sau khi xác minh người yêu cầu bằng gặp mặt hoặc gọi số đã biết. Admin là người vận hành, **không phải vai trò mới** trong app: vẫn 5 vai trò như cũ (chốt 09/11/2026 khi review PR #162, change `director-mfa`) |
| 138 | Cờ Admin hệ thống | Mỗi tài khoản có **cờ Admin hệ thống**, gắn thêm vào vai trò hiện có, chỉ đặt bằng lệnh `auth:set-admin`. Người có cờ **bắt buộc bật 2 lớp** và **gỡ được 2 lớp cho người khác trên D17** (nhập lại mật khẩu và mã của mình, không gỡ cho chính mình, có nhật ký). Giám đốc không có cờ thì không gỡ được. Lệnh `auth:reset-2fa` vẫn giữ cho khi admin cũng mất điện thoại (chốt 09/11/2026 khi review PR #162, change `director-mfa`) |

### 0.2b. Quyết định đang chờ chủ doanh nghiệp xác nhận (khảo sát 28/10/2026)

Các quyết định dưới đây có thể đổi sau khi chủ trả lời câu hỏi ở issue [#44](https://github.com/hoanghainh1188/scaffolding-erp/issues/44). Chưa dùng làm căn cứ propose cho change bị ảnh hưởng.

| Quyết định | Điều có thể đổi | Câu hỏi |
|---|---|---|
| Sản xuất (`production-orders`) | Chi phí công thợ tính khoán theo thành phẩm hay chi phí chung | Q11 |

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
    - Quy tắc (0.2 #4): **không tính ngày xuất, tính ngày trả** (đếm từ N+1); phần đã trả giữa kỳ được trừ đúng ngày trả; thuê tối thiểu 45 ngày (0.2 #39).
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
