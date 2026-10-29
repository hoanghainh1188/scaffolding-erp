# Proposal: activity-log

## Why

Giám đốc muốn *"kiểm tra được tụi nó"* (ghi âm 28/10): ai, lúc nào, làm gì với chứng từ nào. Hiện mỗi loại chứng từ chỉ có `created_by` và vài lịch sử riêng (`purchase_order_event`), rải ở nhiều bảng, không có chỗ xem chung, không biết làm trên điện thoại hay máy tính, không biết trước đó là số gì. Change này thêm một **nhật ký thao tác** chung: chỉ ghi thêm, ghi trong cùng transaction với thao tác, Giám đốc xem ở **D18**, lọc và xuất Excel.

- Giai đoạn: **[MVP]**, change số 17 trong `docs/roadmap.md`, issue #47.
- Màn hình: **D18** Nhật ký thao tác (`docs/design/screens/D18-ActivityLog.dc.html`, đã duyệt ở PR #57), trong menu **Cài đặt** ở `/settings/activity`.
- Phụ thuộc: `auth-and-roles` (xong). Nối vào mọi service ghi đã có.
- Quyết định đã chốt dùng: 0.2 #30 (xác nhận bất thường khi nhập), #23 (xác nhận chi phí sửa cao), #33 (giữ đường lui SaaS). **Quyết định mới 0.2 #34** (ghi trong PR này): giờ làm việc 06:00–21:00 giờ VN, nhật ký giữ mãi ở MVP, không ai xóa, Xuất Excel làm trong MVP.

## What Changes

- **Bảng `activity_log` chỉ ghi thêm**: trigger chặn `UPDATE`, `DELETE`, `TRUNCATE` (như `inventory_ledger`). Mỗi dòng: thời điểm, người làm, **vai trò lúc làm**, **thiết bị** (Điện thoại / Máy tính + trình duyệt, đọc từ User-Agent), **thao tác**, loại + mã chứng từ, **tóm tắt tiếng Việt**, **các trường đổi** (trước → sau), **cờ**.
- **Thao tác**: `CREATE`, `UPDATE`, `SUBMIT`, `APPROVE`, `POST`, `RETURN`, `CANCEL`, `DELETE_DRAFT`, `SIGN_IN` như issue, thêm `CLOSE` (đóng đơn thu mua sớm) và `DELETE` (xóa bản ghi danh mục chưa dùng) vì hai việc này đã có và không khớp nhãn nào (design D3).
- **Một hàm ghi chung** `logActivity(tx, …)` gọi **trong cùng transaction** của thao tác: thao tác rollback thì không có dòng nhật ký. Nối vào mọi service ghi: đơn thu mua, phiếu nhập, phiếu sửa chữa, kiểm kê, phiếu điều chỉnh / tồn đầu kỳ, danh mục (vật tư, nhóm hàng, bộ, nhà cung cấp, nhà thầu, công trình, kho/bãi/xưởng), người dùng, giá sắt vụn, đăng nhập, đổi mật khẩu. **Không thay** lịch sử riêng (`purchase_order_event`…).
- **Test tĩnh bắt chỗ quên** (kiểu `route-guards.test.ts`): mỗi hàm ghi xuất ra từ `src/lib/**` phải gọi tới `logActivity`.
- **Sửa chỉ ghi trường thật sự đổi**: so trước / sau trong transaction; sửa mà không đổi gì thì **không ghi dòng nào**.
- **Dữ liệu nhạy cảm**: CCCD, số tài khoản chỉ lưu dạng đã che (`•••• 5678`); **mật khẩu (kể cả mật khẩu tạm) không bao giờ vào nhật ký**.
- **Cờ** (nhiều cờ một dòng được):
  - `OFF_HOURS` "Ngoài giờ": trước 06:00 hoặc từ 21:00 giờ VN. Mốc giờ là hằng số trong `src/domain`, truyền làm tham số.
  - `SENSITIVE` "Dữ liệu nhạy cảm": sửa CCCD / số tài khoản, đổi vai trò, khóa / mở khóa tài khoản, đặt lại mật khẩu.
  - `ANOMALY` "Có xác nhận bất thường": phiếu nhập có xác nhận nhận dư / chi phí vượt (0.2 #30), phiếu sửa có xác nhận chi phí cao (0.2 #23), duyệt kiểm kê có dòng bị cờ.
- **D18** (Giám đốc): bốn ô tóm tắt (Thao tác, Duyệt / ghi sổ, Sửa / xóa / trả lại, Cần xem kỹ), lọc người làm / loại chứng từ / khoảng ngày (mặc định 7 ngày gần nhất) / mã chứng từ / nhóm thao tác / "Chỉ cần xem kỹ", bảng nhóm theo ngày (mới nhất trên cùng), bấm dòng xem trước → sau, **"Xem thêm"** theo con trỏ (50 dòng mỗi lần).
- **Xuất Excel** (`.xlsx`) theo đúng bộ lọc, **tối đa 10.000 dòng**; quá thì báo thu hẹp bộ lọc. **Không thêm thư viện**: tự viết bộ ghi `.xlsx` nhỏ dùng lại được cho Công nợ sau này (design D9).
- **Quyền mới** `activity.view` chỉ cho Giám đốc. **Không ai xóa hay sửa** được nhật ký, kể cả Giám đốc (không có API nào). Giữ mãi ở MVP.
- **Không backfill** dữ liệu cũ (app chưa chạy thật; design D12).
- **Ghi `docs/requirements.md` 0.2 #34** (giờ làm việc, thời gian lưu, Excel) trong PR này. Khi apply: thêm một dòng về `logActivity` vào `CLAUDE.md` mục Quy ước code.

## Ảnh hưởng tới sổ kho và giá vốn

- Không đụng sổ kho, giá vốn, tồn kho. Nhật ký chỉ **đọc** số liệu để viết tóm tắt (VD "Ghi sổ 5 dòng điều chỉnh · −2.788.056 ₫").
- Mỗi lệnh ghi có thêm một câu `INSERT` trong cùng transaction. Lỗi khi ghi nhật ký làm rollback cả thao tác (đúng ý: không có thao tác nào lọt khỏi nhật ký).

## Ngoài phạm vi

- Ghi **đăng nhập sai**, đăng xuất, xem trang (chỉ ghi thao tác làm đổi dữ liệu và đăng nhập thành công). Đăng nhập sai đã có bảng tạm khóa.
- Nhật ký cho **lệnh chạy tay** ở máy chủ (`auth:create-director`, seed, `inventory:check`): không có người dùng trên web.
- Ghi lại địa chỉ IP, toàn bộ chuỗi User-Agent.
- Xóa / lưu trữ nhật ký cũ theo thời hạn; chuyển nhật ký ra hệ thống ngoài.
- Cảnh báo tức thời (thông báo cho Giám đốc khi có thao tác ngoài giờ).
- Hoàn tác (undo) từ nhật ký; xem lại toàn bộ chứng từ ở thời điểm cũ.
- Nhật ký cho vai trò khác ngoài Giám đốc (VD Kế toán xem nhật ký của mình).
- Thay các lịch sử riêng đã có (`purchase_order_event`, lịch sử trên D3b…).

## Capabilities

### New Capabilities

- `activity-log`: nhật ký thao tác chỉ ghi thêm: nội dung một dòng, thao tác nào được ghi, trước → sau, che dữ liệu nhạy cảm, cờ, xem và lọc trên D18, phân trang, xuất Excel, quyền.

### Modified Capabilities

- `auth`: bảng quyền thêm `activity.view` (chỉ Giám đốc).

## Impact

- **DB**: migration kế tiếp (dự kiến `drizzle/0008_activity_log.sql`): bảng `activity_log`, trigger chỉ ghi thêm, các index.
- **Code mới**: `src/domain/activity.ts` (thao tác, nhóm, cờ, giờ làm việc, so trường đổi, trình duyệt từ User-Agent: hàm thuần), `src/lib/activity/` (`logActivity`, truy vấn D18, xuất Excel), `src/lib/export/xlsx.ts`, API `src/app/api/activity/**`, trang `/settings/activity`, test tĩnh `src/lib/activity/coverage.test.ts`.
- **Sửa**: mọi service ghi trong `src/lib/{purchasing,receiving,repairs,stocktakes,inventory,catalog,users,auth}` (gọi `logActivity`; các hàm xóa nhận thêm `actor`); `withAuth` đưa ra `actor` có vai trò + thiết bị; `src/domain/permissions.ts`; trang `/settings` (thêm lối vào); seed dev và E2E global setup (nhật ký mẫu D18).
- **Dùng lại**: `detectDevice`, `formatDateTime`, `toBusinessDate`, `maskIdNumber`, `maskBankAccount`, `formatMoney`, `DateInput`.
- Không thêm thư viện.
