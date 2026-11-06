# Proposal: dashboard-basic

## Why

Trang Tổng quan (`/dashboard`) vẫn là trang giữ chỗ. Sau `receivables`, mọi số Giám đốc cần mỗi sáng đã có trên hệ thống (tiền thuê, hàng bán, công nợ, hàng ở công trình, chứng từ chờ duyệt) nhưng nằm rải ở D4–D14. Change này dựng **D1 Tổng quan**: một màn đọc, gom việc chờ duyệt, công nợ quá hạn, doanh số, hàng ở ngoài, công trình rủi ro, tra nhanh một công trình, tồn kho theo tình trạng, top 5 nhà thầu (issue #15, roadmap dòng 15).

- Giai đoạn: **[MVP]**, issue #15, phụ thuộc `receivables` (đã archive, PR #146) và PR tài liệu #147 (vẽ lại D1, chốt 0.2 #90–#93).
- Màn hình: **D1** Tổng quan, bản vẽ `docs/design/screens/Main.dc.html` (vẽ lại 06/11/2026).
- Quyết định đã chốt dùng: `docs/requirements.md` 0.2 #6, #24, #46, #66–#68, #79, #90, #91, #92, #93.
- Các điểm cần chốt của issue có phương án trong `design.md`: điểm 1 → D1, điểm 2 → D2, điểm 3 → D3, điểm 4 → D4, điểm 5 → D5, điểm 6 → D6. Câu hỏi cho anh nằm trong mô tả PR.

## What Changes

- **Chỉ đọc.** Không bảng mới, không chứng từ mới, không ghi sổ kho, không ghi nhật ký. Chỉ thêm chỉ mục DB để đọc nhanh (design D2).
- **Câu chào** "Chào <tên>, hôm nay có N việc chờ bạn duyệt" + ngày và "số liệu lúc HH:MM" (giờ Việt Nam). N khớp đúng số dòng của khối **Chờ bạn duyệt**.
- **Chờ bạn duyệt**: hợp đồng / phụ lục, phiếu đền bù, phiếu mua lại, phiên kiểm kê, phiếu điều chỉnh kho (số lượng, đầu kỳ, giá trị) đang Chờ duyệt, theo quyền duyệt của người xem; bấm dòng mở đúng màn duyệt.
- **Công nợ quá hạn** (khối màu chính): tổng tiền, số nhà thầu, lâu nhất bao nhiêu ngày. Lấy từ `customerBalances` của `receivables`, không tính cách khác; số khớp ô "Quá hạn" của D14.
- **Doanh số theo tháng / theo ngày** (0.2 #90): thuê tính từ sổ kho bằng cùng hàm của `rental-billing` (kỳ mở tạm tính, kỳ đã chốt đọc bảng chụp), bán + cước theo ngày giao, **chưa VAT**. Đền bù, mua lại hiện riêng, không cộng vào doanh số. Tháng đã chốt khớp tổng chưa VAT của các kỳ đã chốt.
- **Hàng ở ngoài**: số cái và tấn (số cái × `standard_weight_kg`) đang ở công trình, số công trình, chia theo khu vực (suy ra từ tỉnh, `src/domain/province.ts`); khớp cột "Tại công trình" của D10 và số ở công trình của D6.
- **Công trình rủi ro** (0.2 #92): nợ quá hạn, hàng mất trong 30 ngày, quá ngày kết thúc hợp đồng mà còn hàng. Ngưỡng 30 ngày đặt một chỗ trong `src/domain`.
- **Tra nhanh một công trình**: gõ mã / tên công trình hoặc nhà thầu → nhà thầu, hợp đồng, ngày ký, trạng thái, hàng đang giữ (cái, tấn), tiền thuê tháng này tạm tính, đang nợ, cọc. Kinh doanh thấy số hàng, không thấy tiền (0.2 #91), và chỉ thấy hợp đồng trong `canContract`.
- **Tồn kho theo tình trạng**: bãi + xưởng theo 4 tình trạng và cột "Ở công trình", khớp D10.
- **Top 5 nhà thầu năm nay**, đổi theo doanh thu / theo kg (0.2 #93; nghĩa "kg" chờ anh chốt, đề xuất ở design D3).
- **Quyền**: dùng lại quyền đã có, không thêm quyền mới (design D1). Khối có tiền chỉ trả về cho người có `receivables.view` (Giám đốc, Kế toán); kiểm ở server, server không tính và không gửi số tiền cho vai trò khác.
- **API tra nhanh** `GET /api/dashboard/site-lookup?q=` bọc `withAuth`, trả đã lọc theo quyền.

## Capabilities

### New Capabilities

- `dashboard`: màn D1 Tổng quan: câu chào, các khối số, ai thấy khối nào, tra nhanh công trình, công trình rủi ro, top 5 nhà thầu, thời điểm số liệu.
- `sales-revenue`: cách tính doanh số theo phát sinh theo ngày và theo tháng (thuê từ sổ kho, bán theo ngày giao, đền bù / mua lại tách riêng, chưa VAT), dùng lại cho báo cáo Bản 2.

### Modified Capabilities

(không có: `app-shell` đã có luật `/` → `/dashboard` và Thủ kho, Xưởng mở Desktop thì chuyển `/m`; `auth` không thêm quyền.)

## Ngoài phạm vi

- Lợi nhuận, giá vốn hàng bán, biểu đồ lãi lỗ (Bản 2, `management-reports`).
- Bảng xếp hạng nhà thầu đầy đủ, lọc theo khoảng ngày tùy chọn, xuất Excel doanh số (Bản 2, D15).
- Tự làm mới theo thời gian, đẩy số mới qua WebSocket (design D4).
- Cache số liệu giữa các lần mở (design D2: tính lại mỗi lần mở; xem lại khi đo chậm).
- Tổng quan trên Mobile (M1 "Việc hôm nay" đã có cho Thủ kho, Xưởng).
- Công nợ phải trả nhà cung cấp.

## Ảnh hưởng tới số liệu đã có

- Không ghi sổ kho, không đổi giá vốn, không đổi tiền thuê, công nợ đã có. Doanh số là **cách đọc mới** của số đã có: tháng đã chốt đọc bảng chụp `billing_period`, tháng mở tính lại như D7.
- Migration chỉ thêm chỉ mục (không đổi dữ liệu, không khóa bảng lâu với cỡ dữ liệu hiện tại).

## Impact

- Code mới: `src/domain/dashboard.ts` (hàm thuần: rủi ro, chia doanh số theo ngày, gom khu vực, xếp hạng), `src/lib/dashboard/` (đọc dữ liệu), `src/components/dashboard/`, thay trang giữ chỗ `src/app/(desktop)/dashboard/page.tsx`, route `src/app/api/dashboard/site-lookup/route.ts`.
- Dùng lại: `loadBillingSource` / `statementOf` (`src/lib/billing/compute.ts`), bảng chụp `billing_period*`, `deliveredAmounts` (`src/lib/deliveries/amounts.ts`), `customerBalances` / `readLedgers` (`src/lib/receivables/balances.ts`), `siteMovements` / `onSiteByItem` (`src/lib/deliveries/records.ts`), `getStockOverview` (`src/lib/inventory/stock.ts`), `regionOf` (`src/domain/province.ts`), `canContract`.
- DB: một migration thêm chỉ mục (design D2), không bảng mới.
- Seed: không thêm dữ liệu mẫu; D1 đọc dữ liệu mẫu đã có của các change trước.
- E2E + ảnh mốc D1 (design D6).
