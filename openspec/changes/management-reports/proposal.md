# Proposal: management-reports

## Why

Giám đốc và Kế toán chưa xem được công ty **lãi bao nhiêu** và **hàng cho thuê hao hụt, nằm không bao nhiêu**. Tổng quan D1 mới có doanh số (0.2 #90), chưa có giá vốn. Trang `/reports` hiện vẫn là trang giữ chỗ "Đang xây dựng".

Chủ doanh nghiệp đã chốt cách tính ngày 06/11/2026 (0.2 #107–#110, Q12):
- lợi nhuận gộp trừ hao hụt thực tế, không trừ khấu hao;
- hao hụt tính trên 100 tấn hàng cho thuê;
- tỷ lệ khai thác bình quân theo ngày.

Thiết kế D15 đã duyệt (`docs/design/screens/D15-Reports.dc.html`). **[Bản 2]**, issue #19.

## What Changes

- **Màn D15 Báo cáo quản trị** ở `/reports`, thay trang giữ chỗ. Chỉ đọc, tính lại mỗi lần mở, không lưu số cộng dồn.
  - Chọn kỳ tháng / quý / năm. Mặc định là tháng này.
  - 4 ô số: doanh thu, lợi nhuận gộp (kèm tỷ suất), hao hụt, tỷ lệ khai thác.
  - Bảng lợi nhuận gộp 3 cột: kỳ này, kỳ trước, lũy kế năm.
  - Biểu đồ doanh thu và lợi nhuận gộp theo tháng của năm. Vẽ tay như D1, không thêm thư viện.
  - Bảng hao hụt theo mã hàng.
  - Bảng tỷ lệ khai thác theo mã hàng.
  - Xếp hạng **đầy đủ** nhà thầu của năm, theo doanh thu hoặc theo kg.
  - Nút "Xuất Excel" (`buildXlsxBook`).
- **Doanh thu** (chưa VAT) gồm 4 phần:
  - thuê và bán: dùng đúng nguồn của D1 (`revenueBook`), nên tổng mỗi tháng khớp D1;
  - đền bù đã duyệt và mua lại đã duyệt: tính theo ngày duyệt.
- **Giá vốn và hao hụt** đọc từ sổ kho:
  - giá vốn hàng bán;
  - giá vốn hàng khách mua lại;
  - hàng mất ở công trình;
  - giảm giá trị khi hàng trả về đổi tình trạng;
  - sửa chữa;
  - chênh lệch kiểm kê và điều chỉnh.
  - Cách tính bảo đảm **mỗi đồng chỉ trừ một lần**. Riêng chi phí sửa chữa cần chủ doanh nghiệp xác nhận cách hiện (câu hỏi Q1 trong PR).
- **Hao hụt**: tấn mất, thành phế, phải sửa khi thu hồi, chia cho 100 tấn hàng cho thuê bình quân theo ngày.
- **Tỷ lệ khai thác**: hàng ở công trình chia cho tổng hàng Mới, Tốt, bình quân theo ngày. Tổng tính theo tấn; chi tiết theo mã tính theo cái.
- **Quyền**: dùng lại quyền `reports.view` (đang có, chỉ Giám đốc) và **thêm Kế toán** (0.2 #110). Kế toán thấy mục menu "Báo cáo".
- **Một chỉ mục mới trên sổ kho** theo ngày nghiệp vụ, để đọc nhanh một kỳ. Không đổi dữ liệu. Thêm script đo `npm run bench:reports` trên DB `*_bench`.

## Capabilities

### New Capabilities

- `gross-profit`: Doanh thu và giá vốn, hao hụt theo kỳ (tháng / quý / năm, kỳ trước, lũy kế năm). Gồm từng khoản giá vốn lấy từ sổ kho, luật mỗi đồng chỉ trừ một lần, ngày ghi nhận từng khoản, tỷ suất lợi nhuận gộp.
- `fleet-metrics`: Chỉ số hàng cho thuê theo kỳ: hàng cho thuê bình quân theo ngày, hao hụt trên 100 tấn (theo mã) và tỷ lệ khai thác (tổng theo tấn, theo mã theo cái).
- `management-reports`: Màn D15 và file Excel. Gồm chọn kỳ, 4 ô số, bảng lợi nhuận gộp, biểu đồ theo tháng, bảng hao hụt, bảng khai thác, xếp hạng nhà thầu đầy đủ, quyền xem.

### Modified Capabilities

- `auth`: bảng quyền cho Kế toán xem Báo cáo (`reports.view` cho `DIRECTOR`, `ACCOUNTANT`).
- `app-shell`: Kế toán thấy mục menu Báo cáo. Mục Báo cáo không còn là trang giữ chỗ.

## Ngoài phạm vi

- **Khấu hao** hàng cho thuê (0.2 #107: không trừ khấu hao).
- **Chi phí ngoài sổ kho**: lương, xăng xe, thuê bãi, lãi vay. Báo cáo này là lợi nhuận **gộp**, không phải lợi nhuận ròng.
- **Chi phí chuyến của phiếu nhập** và phiếu điều chỉnh giá trị `ĐCG`: đây là giá mua của hàng còn trong kho, không trừ vào lợi nhuận kỳ đó. Giá trị đã sửa sẽ vào lợi nhuận khi hàng được bán, bị mất hoặc hỏng.
- Lưu báo cáo, chốt số báo cáo, so sánh nhiều năm, biểu đồ theo nhà thầu.
- Báo cáo trên Mobile.
- Sửa cách tính doanh số của D1 (D15 dùng lại nguyên cách đó).

## Ảnh hưởng tới số liệu đã có

- **Không ghi** dòng sổ kho, chứng từ, nhật ký. Không đổi giá vốn bình quân. Không đổi số liệu nào trên D1, D7, D10, D14.
- Chỉ thêm một chỉ mục (migration không đổi dữ liệu).

## Impact

- Code mới:
  - hàm thuần `src/domain/gross-profit.ts`, `src/domain/fleet-metrics.ts`, `src/domain/report-period.ts`;
  - phần đọc dữ liệu `src/lib/reports/`;
  - trang `src/app/(desktop)/reports/page.tsx`;
  - API xuất Excel `/api/reports/export`;
  - component `src/components/reports/`.
- Dùng lại:
  - `revenueBook` (`src/lib/dashboard/revenue.ts`): thêm loại (đền bù / mua lại) vào khoản tính riêng, D1 vẫn cộng như cũ;
  - `kgByCustomer` và `topCustomers` (không giới hạn 5 dòng);
  - `buildXlsxBook`;
  - helper đo của `bench:dashboard`.
- Quyền: `src/domain/permissions.ts` (`reports.view` thêm `ACCOUNTANT`).
- DB: migration thêm chỉ mục `inventory_ledger (business_date)`.
- Test:
  - unit: hàm thuần;
  - integration: khớp sổ kho, khớp D1, quyền 403;
  - E2E: D15 Giám đốc và Kế toán, Kinh doanh bị chặn, tải Excel;
  - ảnh mốc D15 ở một kỳ cố định không có dữ liệu.
