# Lộ trình các change (OpenSpec)

Làm theo thứ tự. Mỗi dòng là một change: `/opsx:propose <tên-change>`. Câu lệnh propose và checklist nằm trong issue của change. Issue tổng: [#21](https://github.com/hoanghainh1188/scaffolding-erp/issues/21).

Trước mỗi change có màn hình: vẽ và chốt thiết kế bằng Claude Design, chép file vào `docs/design/screens/`.

**Sắp xếp lại 28/10/2026** sau khảo sát với chủ doanh nghiệp (`docs/discovery/2026-10-28-khao-sat.md`). 🔒 = đang chờ trả lời câu hỏi ở [#44](https://github.com/hoanghainh1188/scaffolding-erp/issues/44) (nhãn `blocked`).

## MVP

| # | Tên change | Issue | Nội dung | Màn hình | Phụ thuộc | Trạng thái |
|---|---|---|---|---|---|---|
| 01 | `setup-project` | PR #1 | Khung Next.js, DB, test, layout, token, component nền | Layout D, M | – | ✅ |
| 02 | `auth-and-roles` | #4 | Đăng nhập, 5 vai trò, phân quyền server, người dùng | Login, D17 | 01 | ✅ |
| 03 | `master-data` | #5 | Vật tư, bộ, đối tác, công trình, kho | D9, D16 | 02 | ✅ |
| 04 | `inventory-ledger` | #6 | Sổ kho, giá vốn BQ, tồn kho, thẻ kho, điều chỉnh, tồn đầu | D10, D11 | 03 | ✅ |
| 05 | `purchase-orders` | #7 | Đơn thu mua, chia chi phí mua hàng | D2, D3, D3b | 04 | ✅ |
| 06 | `goods-receipt` | #8 | Nhập hàng trên điện thoại, lưu nháp, quét QR, giá sắt vụn | M1, M2, M3, M7 | 05 | ✅ |
| 07 | `simple-repair` | #12 | Chờ sửa → Tốt / Phế liệu, cộng chi phí sửa | D12 | 04 | ✅ |
| 08 | `stocktake` | #17 | Kiểm kê định kỳ **bãi và xưởng** (0.2 #31), duyệt chênh lệch (**lên MVP**) | M6a, M6, D13 | 04 | ✅ |
| 09 | `catalog-extensions` | #45 | Mã vật tư cũ, đơn vị mét/bó/sọt/cây, phân loại nguyên liệu, khu vực công trình, nhân viên phụ trách | D9, D16 (sửa) | 03 | ✅ |
| 10 | `contracts` | #9 | Hợp đồng bán/thuê, giá theo hợp đồng, **cọc + bảo lãnh**, VAT, phụ lục, báo giá = nháp in ra, tách quyền thuê/bán | D4, D5, D5a, D5b | 09 | ✅ (Q5–Q7 mặc định tạm, 0.2 #48–#50) |
| 11 | `deliveries` | #10 | Xuất kho theo đợt, rã bộ, cước vận chuyển | D6, M5 | 10 | ✅ |
| 12 | `returns-and-compensation` | #11 | Thu hồi (Tốt/Chờ sửa/Phế liệu/Mất, ảnh), phiếu đền bù | M4, D8 | 11 || ✅ |
| 12b | `site-operations` | #132 | Chuyển thẳng giữa công trình, mua lại, đổi hàng (0.2 #38, #66–#68; tách từ #11 ngày 03/11/2026) | D6b, D6c, D6d, M9 | 12 | ✅ |
| 13 | `rental-billing` | #13 | Tính tiền thuê theo kỳ (đã có công thức thực tế 0.2 #4, #39) | D7 | 12 | ✅ (Q1, Q2 mặc định tạm, 0.2 #73, #74) |
| 14 | `receivables` | #14 | Công nợ tách loại (thuê, bán, vận chuyển, đền bù, mua lại, VAT), phiếu thu, tiền trả trước, cọc, bảo lãnh, thanh lý hợp đồng | D14, D14b | 13 | ✅ |
| 15 | `dashboard-basic` | #15 | Việc chờ duyệt, **doanh số ngày/tháng**, công trình rủi ro, tra một công trình, hàng ở ngoài theo khu vực | D1 | 14 | |
| 16 | `production-orders` | #46 | **Sản xuất** thành phẩm từ nguyên liệu (mới) | cần vẽ | 04 | 🔒 Q11 |
| 17 | `activity-log` | #47 | Nhật ký thao tác cho Giám đốc (mới) | D18 | 02 | ✅ |
| 18 | `data-migration` | #48 | Chuyển dữ liệu từ Excel khi bắt đầu dùng (mới, **bắt buộc trước khi chạy thật**) | cần vẽ | 14 | |

## Bản 2

| # | Tên change | Issue | Nội dung |
|---|---|---|---|
| 19 | `repair-work-orders` | #16 | Lệnh sửa chữa đầy đủ: vật tư phụ, công thợ, nghiệm thu; xưởng dùng mobile |
| 20 | `payables` | #18 | Công nợ phải trả |
| 21 | `management-reports` | #19 | Lợi nhuận gộp, tỷ lệ khai thác, **khấu hao / hao hụt hàng cho thuê** (Q12), biểu đồ |
| 22 | `truck-management` | #49 | Quản lý 3 xe tải (Q14) |

## Change kỹ thuật và nhỏ (làm trước khi lên production)

| # | Tên change | Issue | Nội dung | Phụ thuộc |
|---|---|---|---|---|
| K1 | `security-headers` | #23 | CSP theo nonce ✅ | 02 |
| K2 | `e2e-production-build` | #24 | E2E trên `next build && next start` ✅ | 02 |
| K3 | `login-lockout-hardening` | #25 | Chống cố tình nhập sai để chặn người khác ✅ | 02 |
| K4 | `temp-password-expiry` | #26 | Mật khẩu tạm hết hạn sau 48 giờ ✅ | 02 |
| K5 | `qr-labels` | #40 | In nhãn QR dán lên hàng | 06 |
| K6 | `stock-value-adjustment` | #42 | Phiếu điều chỉnh giá trị kho ✅ | 04 |
| K7 | ô nhập ngày | #37 | Ô ngày chung luôn hiện `dd/mm/yyyy` (`DateInput`, sửa lỗi nhỏ PR #59) ✅ | – |
| K8 | `serverless-db-connection` | #75 | Pool kết nối DB cho Vercel + Neon ✅ | – |
| K9 | `demo-environment` | #76 | Môi trường thử nghiệm cho Vercel + Neon ✅ | – |
| K10 | `company-settings` | #77 | Cài đặt thông tin công ty cho phiếu in ✅ | – |
| K11 | `error-monitoring` | #79 | Theo dõi lỗi production, che dữ liệu cá nhân ✅ | – |
| K12 | `db-least-privilege` | #96 | Tách role DB: app không sửa/xóa được sổ kho và nhật ký ✅ | – |
| K13 | `director-mfa` | #97 | Xác thực 2 lớp (TOTP) cho Giám đốc | 02 |
| K14 | `session-management` | #98 | Xem và đăng xuất thiết bị từ xa (không chặn production) | K13 |
| K15 | `personal-data-protection` | #99 | Mã hóa CCCD/STK trong DB, lưu giữ và xóa | #78; trước 18 |
| K16 | `natural-ui-copy` | #118 | Viết lại chữ giao diện cho tự nhiên (Mua hàng, Cho thuê & Bán) ✅ | – |
| – | Bảo mật CI và thư viện | #100 | Dependabot, CodeQL, `npm audit`, HSTS (không phải change) | – |
| – | Hạ tầng demo | #80 | Vercel + Neon, reset hằng đêm ✅ | K8, K9 |
| – | Hạ tầng production | #81 | Vercel + Neon, backup, giám sát, runbook ✅ | K11 |

## Ghi chú

- Khi chủ trả lời câu hỏi ở #44: ghi quyết định vào `docs/requirements.md` 0.2, gỡ dòng tương ứng ở 0.2b, gỡ nhãn `blocked` của issue.
- Trong lúc chờ câu trả lời ở #44: các change 07, 08, 17 và K6, K7 đã hoàn tất ✅. Có thể làm tiếp các change kỹ thuật K1–K5 (không bị chặn) hoặc kiểm tra tay #33. Song song: xin file Excel tính tiền của 2–3 công trình.
- K12–K15 và #100 phát sinh từ rà soát bảo mật 01/11/2026. Trước production cần K12, K13, #100; K15 sau khi có câu trả lời #78.
- 18 `data-migration` làm cuối, nhưng nên xin sớm file mẫu dữ liệu để thiết kế mẫu nhập từ đầu.
