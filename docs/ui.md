Tài liệu này dùng để cung cấp Context cho các công cụ AI (Cursor, v0, Claude) khi bắt đầu khởi tạo dự án Frontend.
Tech stack: **Next.js (giao diện + API) + Tailwind CSS + Shadcn UI / Radix UI + PostgreSQL**.
Design system: **Bright Blue Base** — token và hướng dẫn gốc ở `docs/design-system/` (`tokens.json`, `README.md`). **Mọi màu, chữ, bo góc lấy từ đó; tài liệu này chỉ gọi tên token, không ghi mã màu.**
Tài liệu nghiệp vụ đi kèm: `docs/requirements.md` (các quyết định nghiệp vụ ở Mục 0).

> Cập nhật 26/10/2026:
> - Bổ sung các màn hình còn thiếu, mã màn hình (D = Desktop, M = Mobile).
> - Áp dụng quyết định nghiệp vụ: 4 tình trạng hàng (Mới / Tốt / Chờ sửa / Phế liệu), danh mục vật tư chung, "Bộ" là tùy chọn.
> - Chia giai đoạn **[MVP]** / **[Bản 2]** cho từng màn hình.

---

## 0. LUỒNG NGHIỆP VỤ CHÍNH

1. **Mua hàng** (D3) → xe về bãi → **Nhập thực tế** (M3): hàng mới vào *Mới*; hàng cũ tách *Tốt / Chờ sửa / Phế liệu*.
2. **Chờ sửa** → **Sửa chữa** (D12; M8 ở Bản 2) → về **Tốt** (giá vốn cộng thêm chi phí sửa).
3. **Mới / Tốt** → **Hợp đồng** (D4, D5) → Giám đốc duyệt → **Xuất kho theo đợt** (D6, M5) ra công trình.
4. **Công trình trả hàng** → **Nhập thu hồi** (M4) → **Phiếu đền bù** (D8) → Giám đốc duyệt.
5. Cuối kỳ → **Tính tiền thuê** (D7) → **Công nợ** (D14) → **Báo cáo** (D1, D15).
6. Định kỳ → **Kiểm kê** bãi/xưởng (M6a, M6) → **Duyệt chênh lệch** (D13) → sổ kho ghi dòng điều chỉnh.

---

## 1. LAYOUT CHUNG (MASTER LAYOUTS)

Hệ thống có 2 Layout riêng biệt phục vụ 2 nhóm người dùng:

### A. Desktop Layout (Văn phòng: Giám đốc, Kế toán, Kinh doanh)

- **Sidebar (Cố định bên trái):** Logo và Menu điều hướng chính. Có thể thu gọn (Collapse). Nền sáng (`card`), viền `border`; mục đang chọn nền `accent`.
    - Menu: Tổng quan, Mua hàng, Kho, Sửa chữa, Cho thuê & Bán, Công nợ, Báo cáo, Danh mục, Cài đặt.
    - Menu hiển thị theo vai trò (VD: Kinh doanh không thấy Công nợ phải trả).
- **Top Header:** Tìm kiếm toàn cục, Nút tạo mới nhanh (+ Tạo Hợp đồng, + Tạo Đơn mua hàng), Notification (có mục "Chờ duyệt" cho Giám đốc), Profile User.
- **Main Content Area:** Bảng dữ liệu (Table), biểu đồ (Chart), hoặc Form chi tiết. Nền trang `background`, nội dung nằm trong thẻ `card` (viền `border`, bo `radius-lg`).

### B. Mobile PWA Layout (Thủ kho, Xưởng)

- **Bottom Navigation (Cố định dưới đáy):** 4 tab: Việc hôm nay, Quét mã, Lịch sử, Cá nhân.
- **Top App Bar:** Tên trang hiện tại, Nút Back (nếu ở trang chi tiết), Nút lọc (Filter).
- **Floating Action Button (FAB):** Nút tròn to ở góc dưới bên phải (hoặc giữa Bottom Nav) để quét QR hoặc tạo phiếu nhập/xuất nhanh.
- **Main Scrollable Area:** Danh sách dạng Thẻ (Cards) thay vì Bảng (Table).
- **Lưu nháp:** khi mất sóng, phiếu đang làm được lưu nháp trên máy. Hiện thanh báo "Mất kết nối – đã lưu nháp" ở đầu màn hình. Gửi lại khi có mạng.

---

## 2. HỆ THỐNG THÀNH PHẦN (UI COMPONENTS)

Các "viên gạch" cần thiết lập trước để tái sử dụng toàn dự án:

- **Buttons (Nút bấm):**
    - `Primary`: token `primary` – Hành động chính (Lưu, Xác nhận).
    - `Secondary`: token `secondary` – Hành động phụ (Hủy, Quay lại).
    - `Danger`: token `destructive` – Hành động rủi ro (Xóa, Từ chối).
    - `Stepper (+/-)`: Dành cho Mobile để thủ kho bấm tăng giảm số lượng nhanh.
- **Badges (Thẻ trạng thái):**
    - _Tình trạng hàng:_ Mới (`highlight`), Tốt (`success`), Chờ sửa (`warning`), Phế liệu (`muted`).
    - _Trạng thái chứng từ:_ Nháp (`muted`), Chờ duyệt (`warning`), Đang xử lý (`primary`), Hoàn thành (`success`), Quá hạn (`destructive`).
    - _Ghi chú:_ "Quá hạn" được **tính ra** từ ngày đến hạn, không phải trạng thái lưu trong DB.
    - Badge luôn có chữ, không dùng màu là cách duy nhất để báo trạng thái.
    - _Vị trí:_ Tại bãi, Tại xưởng, Tại công trình.
- **Data Entry (Nhập liệu):**
    - Input text chuẩn, Search box có icon kính lúp.
    - Dropdown/Select dạng searchable để tìm nhanh tên vật tư.
    - Date Range Picker (Chọn từ ngày – đến ngày).
    - Image Uploader (gọi Camera trên mobile).
    - **Unit Switch:** chuyển đơn vị trên cùng dòng (cái ↔ kg). Hiện số quy đổi theo trọng lượng chuẩn bên cạnh.
    - **Condition Split:** nhập tổng số lượng, chia ra *Tốt / Chờ sửa / Phế liệu* (thu hồi có thêm ô *Mất*). Tự kiểm tra tổng khớp. Dùng chung cho M3, M4.
- **Data Display (Hiển thị):**
    - Data Table (Desktop): sort, pagination, sticky header. Trạng thái rỗng là lời mời + một nút (VD: "Chưa có đơn thu mua nào" + "Tạo đơn"), không ghi "Không có dữ liệu".
    - Data Card (Mobile): thẻ dọc (Tên vật tư in đậm, số lượng chữ to, badge tình trạng góc phải).
    - **KPI Card:** số liệu lớn kèm so sánh kỳ trước.
    - **Cost Breakdown:** bảng cấu thành giá vốn (giá mua + landed cost + sửa chữa).
    - **Delivery Timeline:** dòng thời gian các đợt xuất/trả của một công trình.
    - **Approval Bar:** thanh Duyệt / Từ chối ở đầu chứng từ chờ duyệt (chỉ Giám đốc thấy).

---

## 3. PHÂN CHIA MÀN HÌNH (SITEMAP & SCREENS)

### 3.1. Phân hệ Desktop (Văn phòng)

#### Tổng quan

- **D1. Dashboard** **[MVP: bản rút gọn]**:
    - Tiêu đề trang là **câu chào** theo người dùng và số việc chờ, VD: "Chào Minh Anh, hôm nay có 4 việc chờ bạn duyệt" (đã chốt 26/10/2026). Mục menu vẫn tên "Tổng quan".
    - MVP: công nợ quá hạn (khối màu chính), doanh số theo tháng / ngày (0.2 #90), hàng ở ngoài (cái, tấn) theo khu vực, công trình rủi ro (0.2 #92), tra nhanh một công trình, việc chờ duyệt, tồn kho theo tình trạng, top 5 nhà thầu (0.2 #93). Khối có tiền chỉ Giám đốc, Kế toán thấy (0.2 #91).
    - Bản 2: thêm lợi nhuận, bảng xếp hạng đầy đủ (D15).

#### Mua hàng & Nhập hàng

- **D2. Danh sách Đơn thu mua (PO)** **[MVP]**: Lọc theo NCC/cai thầu, loại (hàng mới/hàng cũ), trạng thái, ngày dự kiến nhập.
- **D3. Tạo/Sửa PO** **[MVP]**: Thông tin NCC, loại PO, ngày dự kiến, phương tiện vận chuyển. Bảng hàng có Unit Switch (cái hoặc kg). Bảng chi phí Landed Cost (cước xe, bốc xếp, cầu đường), chọn cách phân bổ (theo giá trị / trọng lượng). Xem trước giá nhập từng dòng sau phân bổ.

#### Kho

- **D9. Danh mục vật tư** **[MVP]**: Danh sách mã hàng (tên, nhóm, ĐVT, trọng lượng chuẩn, giá thuê mặc định). Tab "Bộ" để cấu hình bộ cho mã nào cần (tùy chọn).
- **D10. Tồn kho tổng hợp** **[MVP]**: Bảng tồn theo mã hàng. Cột: Tại bãi (Mới / Tốt / Chờ sửa / Phế liệu), Tại xưởng, Tại công trình (tổng, bấm để xem từng công trình). Hiện giá vốn bình quân. Bấm vào số để mở Thẻ kho.
- **D11. Thẻ kho** **[MVP]**: Lịch sử xuất/nhập/chuyển tình trạng của 1 mã hàng, kèm biến động giá vốn bình quân.
- **D13. Kết quả kiểm kê** **[MVP]**: Danh sách phiên kiểm kê. Chi tiết: số sổ lúc đếm, số đếm thực tế, chênh lệch số lượng và giá trị, cờ cảnh báo. Lọc dòng lệch / khớp. Approval Bar: Duyệt và ghi sổ, Yêu cầu đếm lại dòng đã chọn, Trả lại.

#### Sửa chữa

- **D12. Sửa chữa**:
    - **[MVP] Phiếu sửa chữa đơn giản:** chọn mã hàng và số lượng từ Chờ sửa → chuyển sang Tốt (hoặc Phế liệu). Nhập tổng chi phí. Hiện Cost Breakdown: giá vốn cũ + chi phí sửa = giá vốn mới.
    - **[Bản 2] Lệnh sửa chữa đầy đủ:** danh sách lệnh (Nháp / Đang sửa / Đã nghiệm thu), vật tư phụ, công thợ, nghiệm thu.

#### Bán & Cho thuê

- **D4. Danh sách Hợp đồng / Báo giá** **[MVP]**: Lọc theo nhà thầu, công trình, loại (bán/thuê), trạng thái (gồm Chờ duyệt).
- **D5. Chi tiết Hợp đồng** **[MVP]**: Nhà thầu + 1 công trình. Dòng hàng theo "Bộ" hoặc linh kiện (bộ tự rã để hiển thị linh kiện bên dưới). Đơn giá bán đứt hoặc giá thuê ngày/tháng (hiện giá ngày quy đổi). Bảng giá đền bù mất/hỏng. Approval Bar cho Giám đốc.
- **D5a. Soạn hợp đồng / báo giá** **[MVP]**: Chọn loại (Cho thuê / Bán), nhà thầu, công trình. Số hợp đồng tự sinh theo 0.2 #40. Dòng hàng theo bộ hoặc mã, giá lấy từ danh mục, sửa riêng (đánh dấu giá khác danh mục). Điều khoản: thuê tối thiểu, chốt kỳ, hạn thanh toán, VAT. Bảng giá đền bù chép từ bảng chung (0.2 #49). Cọc tiền và bảo lãnh (0.2 #50). Kế hoạch giao theo đợt. Ô "Kiểm tra trước khi gửi duyệt" (tồn kho, bảo lãnh, giá khác, nợ quá hạn). Báo giá = in bản nháp.
- **D5b. Lập phụ lục** **[MVP]**: Chỉ cho hợp đồng đã duyệt. Ngày hiệu lực (không trước kỳ đã chốt), lý do, bảng hiện tại ↔ mới cho số lượng, giá, điều khoản khác. Ô ảnh hưởng: kỳ đã chốt không đổi, kỳ đang mở tách giá cũ/mới tại ngày hiệu lực (0.2 #16). Gửi Giám đốc duyệt lại.
- **D6. Tiến độ cấp hàng theo Công trình** **[MVP]**: Delivery Timeline các đợt xuất/trả. Số lượng đang ở công trình. Tạo phiếu xuất đợt mới (chỉ chọn hàng Mới/Tốt). Ghi cước vận chuyển chiều đi.
- **D7. Tính tiền thuê (Billing)** **[MVP]**: Chọn kỳ (tháng). Băng ngày nghỉ trong kỳ (0.2 #73). Danh sách hợp đồng thuê trong kỳ kèm trạng thái chốt. Bảng chi tiết từng lượng hàng: từ ngày (đầu kỳ hoặc hôm sau ngày giao), đến ngày (cuối kỳ hoặc ngày trả, gồm), ngày lịch, trừ ngày nghỉ, ngày tính, giá ngày, thành tiền; tách dòng khi phụ lục đổi giá; dòng bù tối thiểu 45 ngày (0.2 #74); dòng điều chỉnh kỳ trước (0.2 #22). Cước vận chuyển trong kỳ, VAT, phải thu, hạn trả. Nút In bảng kê, Xuất Excel, Chốt kỳ và ghi công nợ.
- **D6b. Chuyển công trình** **[MVP]**: Từ D6 của hợp đồng đi. Chọn hợp đồng nhận, số chuyển theo mã (rút Mới trước), ảnh hưởng tiền thuê hai hợp đồng. Văn phòng xác nhận ngay hoặc gửi điện thoại (M9) xác nhận (0.2 #66).
- **D6c. Phiếu mua lại** **[MVP]**: Khách mua luôn hàng đang thuê. Giá điền sẵn bằng giá mất, Giám đốc duyệt (0.2 #67).
- **D6d. Đổi hàng** **[MVP]**: Một chuyến xe giao mã mới, nhận mã cũ; tạo đợt xuất + phiếu thu hồi nối với nhau (0.2 #68).
- **D8. Phiếu tính phí đền bù** **[MVP]**: Sinh tự động từ phiếu thu hồi. Số lượng hỏng/mất × đơn giá đền bù trong hợp đồng. Ảnh hiện trạng đính kèm. Approval Bar cho Giám đốc; duyệt xong mới cộng vào công nợ.

#### Tài chính & Công nợ

- **D14. Công nợ**:
    - **[MVP] Phải thu:** theo nhà thầu, tách loại (thuê & cước, bán, đền bù, mua lại, VAT); các khoản nợ với hạn và tình hình; ghi phiếu thu (tự trừ khoản đến hạn sớm nhất trước, trả dư giữ làm tiền trả trước); nộp cọc tiền; hủy phiếu thu có lý do; cọc và bảo lãnh (nhắc bảo lãnh sắp hết hạn); cảnh báo quá hạn; xuất Excel.
    - **D14b. Thanh lý hợp đồng [MVP]:** kiểm điều kiện, cấn trừ cọc vào nợ của hợp đồng, hoàn cọc thừa (0.2 #81).
    - **[Bản 2] Phải trả:** theo NCC, cá nhân thanh lý phế liệu, đơn vị thuê xe ngoài.

#### Báo cáo

- **D15. Báo cáo Quản trị** **[Bản 2]**:
    - Lợi nhuận gộp: Doanh thu − Giá vốn − Chi phí sửa chữa.
    - Tỷ lệ khai thác (Utilization): % ở công trình vs % nằm ở bãi.

#### Danh mục & Cài đặt

- **D16. Danh mục đối tác & địa điểm** **[MVP]**: Nhà cung cấp/Cai thầu, Nhà thầu (khách hàng), Công trình, Kho/Bãi/Xưởng.
- **D17. Người dùng & Vai trò** **[MVP]**: Danh sách tài khoản, gán vai trò (Giám đốc, Kế toán, Kinh doanh, Thủ kho, Xưởng).
- **D18. Nhật ký thao tác** **[MVP]** (Giám đốc, trong Cài đặt): ai, lúc nào, làm gì với chứng từ nào. Bốn ô tóm tắt (tổng, duyệt/ghi sổ, sửa/xóa/trả lại, cần xem kỹ), lọc người / loại chứng từ / ngày / mã / loại thao tác, bảng nhóm theo ngày, mở dòng xem trước → sau. Cờ "Ngoài giờ", "Dữ liệu nhạy cảm", "Có xác nhận bất thường". Chỉ ghi thêm. Xuất Excel.

### 3.2. Phân hệ Mobile (Thủ kho, Xưởng)

- **M1. Home / Tasks** **[MVP]**: Xe sắp về bãi (chờ nhập), Lệnh xuất hàng hôm nay, Công trình sắp trả hàng. Bản 2 thêm lệnh sửa chữa.
- **M2. Quét & Xử lý (Scan/Action)** **[MVP]**: Bật Camera quét QR mã hàng hoặc chọn thủ công.
- **M3. Nhập thực tế từ PO** **[MVP]**: Chọn PO đang chờ. PO hàng mới: chỉ đếm, tự vào tình trạng Mới. PO hàng cũ: đếm (Stepper hoặc kg) rồi dùng Condition Split tách Tốt / Chờ sửa / Phế liệu. Chụp ảnh nếu cần.
- **M4. Form Nhập Thu hồi (Màn hình phức tạp nhất)** **[MVP]**:
    - Phần 1: Thông tin chung (Công trình, Biển số xe). Hiện số lượng đang ở công trình để đối chiếu.
    - Phần 2: Danh sách vật tư (Stepper để đếm).
    - Phần 3: Condition Split: Tốt / Chờ sửa / Phế liệu / Mất (VD: 100 khung → 80 tốt, 15 chờ sửa, 3 phế liệu, 2 mất).
    - Phần 4: Chụp ảnh hiện trạng hàng hỏng.
    - _Ghi chú:_ M3 và M4 dùng chung một form, chỉ khác Phần 1 (chọn PO hay chọn Công trình) và ô *Mất*.
- **M5. Xuất kho theo đợt** **[MVP]**: Danh sách nhặt hàng đã rã bộ thành linh kiện. Tick từng dòng khi nhặt xong. Xác nhận xe rời bãi.
- **M6a. Bắt đầu kiểm kê** **[MVP]**: Chọn vị trí (chỉ bãi, xưởng) và nhóm hàng cần đếm.
- **M6. Đếm hàng** **[MVP]**: Đếm mù (không hiện số sổ). Mỗi mã đếm theo tình trạng bằng Stepper, bấm "Xong mã này". Thêm hàng không có trong danh sách. Gửi kết quả về văn phòng (D13).
- **M7. Lịch sử** **[MVP]**: Phiếu đã làm, lọc theo loại và ngày. Phiếu nháp chưa gửi hiện ở đầu danh sách.
- **M9. Xác nhận chuyển công trình** **[MVP]**: Người đi xe xem lộ trình, sửa số thực chở bằng stepper, nhập biển số, bấm xác nhận khi hàng đã hạ ở công trình nhận. Không hiện giá (0.2 #66).
- **M8. Sửa chữa tại Xưởng** **[Bản 2]**: Xem lệnh được giao. Ghi vật tư phụ và công thợ. Báo hoàn thành để văn phòng nghiệm thu.

### 3.3. Tổng hợp theo giai đoạn

| Giai đoạn | Desktop | Mobile |
|---|---|---|
| **MVP** | D1 (rút gọn), D2, D3, D4, D5, D5a, D5b, D6, D6b, D6c, D6d, D7, D8, D9, D10, D11, D12 (đơn giản), D13, D14 (phải thu), D14b, D16, D17, D18 | M1, M2, M3, M4, M5, M6a, M6, M7, M9 |
| **Bản 2** | D1 (đầy đủ), D12 (đầy đủ), D14 (phải trả), D15 | M8 |

### 3.4. Thiết kế đã vẽ (Claude Design)

Canvas: **Scaffolding ERP – Thiết kế màn hình** — https://claude.ai/artifact/1maxh81Uzyzb7iLM8xf6z9 (riêng tư, chỉ chủ tài khoản mở được).

Bản chép trong repo: **`docs/design/screens/`** (cùng tên file với cột Artboard). Cách đọc và những gì không được copy nguyên: `docs/design/screens/README.md`.

| Màn | Artboard | Dùng cho change | Trạng thái |
|---|---|---|---|
| D1 Tổng quan | `Main.dc.html` | `dashboard-basic` | Đã duyệt (vẽ lại 06/11/2026) |
| D3 Tạo đơn thu mua | `D3-PurchaseOrder.dc.html` | `purchase-orders` | Đã chốt phong cách |
| M4 Nhập thu hồi | `M4-ReturnNote.dc.html` | `returns-and-compensation` | Đã chốt phong cách |
| Đăng nhập | `Login.dc.html` | `auth-and-roles` | Đã duyệt |
| D17 Người dùng | `D17-Users.dc.html` | `auth-and-roles` | Đã duyệt |
| D18 Nhật ký thao tác | `D18-ActivityLog.dc.html` | `activity-log` | Đã duyệt |
| D9 Danh mục vật tư | `D9-Items.dc.html` | `master-data` | Đã duyệt |
| D16 Đối tác & công trình | `D16-Partners.dc.html` | `master-data` | Đã duyệt |
| D10 Tồn kho tổng hợp | `D10-Stock.dc.html` | `inventory-ledger` | Đã duyệt |
| D11 Thẻ kho | `D11-StockCard.dc.html` | `inventory-ledger` | Đã duyệt |
| D2 Danh sách đơn thu mua | `D2-PurchaseOrders.dc.html` | `purchase-orders` | Đã duyệt |
| D3b Chi tiết đơn thu mua | `D3b-PurchaseOrderDetail.dc.html` | `purchase-orders`, `goods-receipt` | Đã duyệt |
| M1 Việc hôm nay | `M1-Today.dc.html` | `goods-receipt` | Đã duyệt |
| M2 Quét mã | `M2-Scan.dc.html` | `goods-receipt` | Đã duyệt |
| M3 Nhập thực tế từ đơn mua | `M3-GoodsReceipt.dc.html` | `goods-receipt` | Đã duyệt |
| M7 Lịch sử | `M7-History.dc.html` | `goods-receipt` | Đã duyệt |
| D4 Danh sách hợp đồng | `D4-Contracts.dc.html` | `contracts` | Đã duyệt |
| D5 Chi tiết hợp đồng | `D5-Contract.dc.html` | `contracts` | Đã duyệt |
| D5a Soạn hợp đồng / báo giá | `D5a-ContractForm.dc.html` | `contracts` | Đã duyệt |
| D5b Lập phụ lục | `D5b-ContractAmendment.dc.html` | `contracts` | Đã duyệt |
| D6 Tiến độ cấp hàng | `D6-SiteDeliveries.dc.html` | `deliveries` | Đã duyệt |
| M5 Nhặt hàng xuất kho | `M5-Picking.dc.html` | `deliveries` | Đã duyệt |
| D8 Phiếu đền bù | `D8-Compensation.dc.html` | `returns-and-compensation` | Đã duyệt |
| D6b Chuyển công trình | `D6b-SiteTransfer.dc.html` | `site-operations` | Chờ duyệt |
| D6c Phiếu mua lại | `D6c-BuyBack.dc.html` | `site-operations` | Chờ duyệt |
| D6d Đổi hàng | `D6d-Exchange.dc.html` | `site-operations` | Chờ duyệt |
| M9 Xác nhận chuyển công trình | `M9-SiteTransfer.dc.html` | `site-operations` | Chờ duyệt |
| D12 Sửa chữa đơn giản | `D12-Repair.dc.html` | `simple-repair` | Đã duyệt |
| D7 Tính tiền thuê | `D7-RentalBilling.dc.html` | `rental-billing` | Đã duyệt |
| D14 Công nợ phải thu | `D14-Receivables.dc.html` | `receivables` | Đã duyệt (vẽ lại 05/11/2026) |
| D14b Thanh lý hợp đồng | `D14b-ContractClose.dc.html` | `receivables` | Đã duyệt |
| D13 Kết quả kiểm kê | `D13-Stocktake.dc.html` | `stocktake` | Đã duyệt |
| M6a Bắt đầu kiểm kê | `M6a-StocktakeStart.dc.html` | `stocktake` | Đã duyệt |
| M6 Đếm hàng | `M6-Stocktake.dc.html` | `stocktake` | Đã duyệt |

Cách dùng khi propose: chỉ ra file trong `docs/design/screens/` của các màn thuộc change (bảng trên). Có thể handoff thêm từ canvas: **Export → Hand off to Claude Code**. Thiết kế là tham chiếu bố cục; quy tắc trong `openspec/specs/` và tài liệu này vẫn thắng nếu khác nhau.

**Quy tắc đã chốt từ thiết kế:**
- **Viết tiền theo spec `domain-values`:** `1.250.000 ₫` (dấu chấm hàng nghìn, cách một khoảng, ký hiệu `₫`). Không dùng kiểu `1.250.000đ` trong README của Bright Blue Base — dự án này ghi đè điểm đó.
- Mỗi màn chỉ **một khối màu `primary` đặc** cho con số quan trọng nhất (D1: công nợ quá hạn, D3: tổng cộng).
- Thẻ vật tư trên mobile chưa chia đủ có **viền `warning`** để thủ kho nhìn thấy ngay.

---

## 4. PROMPT HƯỚNG DẪN AI KHỞI TẠO (DÀNH CHO CURSOR/v0/CLAUDE CODE)

**Prompt 1 (Khởi tạo Base & Layout):**

> "Act as an expert Frontend Developer. Initialize a React Next.js project using Tailwind CSS and Shadcn UI. First, create the two main layouts:
>
> 1. DesktopLayout: Sidebar (collapsible, menu items filtered by user role), Top header with profile/search/notifications, and a main content area with a soft gray background.
> 2. MobileLayout: Bottom navigation bar with 4 icons (Home, Scan, History, Profile), a top App bar, and an offline banner that appears when the network is lost.
>
> Please generate the skeleton for these layouts with placeholder content."

**Prompt 2 (Tạo Components cốt lõi):**

> "Now, build the reusable UI components based on the design system:
>
> 1. A ConditionBadge component that takes 'condition' as a prop, using design tokens from docs/design-system/tokens.json: New (highlight), Good (success), Need Repair (warning), Scrap (muted).
> 2. A DocumentStatusBadge component: Draft (muted), Pending Approval (warning), In Progress (primary), Done (success), Overdue (destructive).
> 3. A MobileStepperInput component with large '+' and '-' buttons for easy tapping on mobile.
> 4. A DesktopDataTable component with sticky headers and a dummy pagination footer.
> 5. A ConditionSplit component: one total quantity split into 'Good', 'Need Repair', 'Scrap' (and optionally 'Lost'), showing a warning when the parts do not add up to the total."

**Prompt 3 (Xây dựng màn hình cụ thể – Form Thủ Kho):**

> "Using the MobileLayout and components created, build the 'Return Receipt Form' (Phiếu Nhập Thu Hồi) screen for warehouse staff.
> The screen should include:
>
> - Project dropdown, showing the quantity of each item currently at that project.
> - A list of items being returned. Each item should have a MobileStepperInput.
> - Under each item, use the ConditionSplit component with the 'Lost' option enabled.
> - An 'Add Photo' button that opens the file picker/camera.
> - Save as draft locally when offline.
>
> Make the header section swappable so the same form can be reused for 'Receive from Purchase Order' (select a PO instead of a Project, no 'Lost' option; new-goods POs skip the split)."
