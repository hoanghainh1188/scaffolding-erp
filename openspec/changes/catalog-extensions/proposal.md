# Proposal: catalog-extensions (09)

Mở rộng danh mục cho khớp dữ liệu thật của công ty: mã vật tư thật (`H1,7`, `NỐI 34`, `KB+KU34`), mã cũ để tìm, thêm đơn vị (mét, bó, sọt, cây, cuộn, hộp, thùng), cho thuê mã tính theo kg/mét, phân loại Thiết bị / Vật tư, tỉnh/thành và khu vực của công trình, nhân viên kinh doanh phụ trách nhà thầu.

Giai đoạn: **[MVP]**. Màn hình: **D9** (Danh mục vật tư), **D16** (Đối tác & công trình), **M2** (Quét mã, chỉ phần gõ mã). Refs #45.

## Why

Khảo sát 28/10 (`docs/discovery/2026-10-28-khao-sat.md`) và file kế toán thật cho thấy danh mục hiện tại không chứa được dữ liệu của công ty:

- 142 mã vật tư thật dùng dấu phẩy, dấu sao, dấu cộng, khoảng trắng, chữ có dấu (`H1,7`, `X5*10*3`, `NỐI 34`). Luật mã hiện tại (`A-Z`, `0-9`, `-`) chặn hết. Chủ đã chốt giữ mã thật (0.2 #37).
- Hàng chỉ có đơn vị `cái` / `kg`. Thực tế còn Mét, Bó, Sọt, Cuộn, Hộp, Thùng (0.2 #37). Có hàng cho thuê theo kg / mét, nhưng CHECK `item_rental_unit_check` chỉ cho mã tính theo cái có giá thuê.
- Xưởng dùng nguyên vật liệu (thép ống, tôn, sơn, que hàn) khác hàng kinh doanh. Công ty đã chia "Thiết bị" và "Vật tư" (0.2 #41). Phân hệ sản xuất (#46) cần biết mã nào là nguyên liệu.
- Chủ muốn biết công trình **ở khu vực nào** (phía Nam...). Công trình mới chỉ có địa chỉ gõ tự do.
- Mỗi khách có **nhân viên kinh doanh phụ trách** (Khang, Thảo, Vy...; 0.2 #41). Hệ thống chưa lưu.

Phải làm trước `contracts` (#9): hợp đồng chọn mã hàng, đơn vị, công trình và cần dữ liệu thật.

## What Changes

- **Luật mã vật tư mới** (vật tư và bộ): cho phép chữ in hoa **có dấu tiếng Việt**, số, và các dấu nối `,` `*` `+` `-` khoảng trắng; 2–30 ký tự. Hai mã chỉ khác nhau ở dấu, khoảng trắng hoặc hoa thường (VD `NỐI 34` và `NOI34`) bị coi là trùng. Mã đã tạo vẫn không đổi được. Mã bãi/xưởng giữ luật cũ.
- **Mã cũ (tên gọi khác)** cho vật tư: mỗi vật tư có tối đa 5 mã cũ, sửa được. Tìm ở D9, gõ mã ở M2, tra tồn theo mã đều nhận mã cũ. Mã cũ không trùng mã chính hay mã cũ của vật tư khác.
- **Đơn vị mới**: `Mét`, `Bó`, `Sọt`, `Cây`, `Cuộn`, `Hộp`, `Thùng` bên cạnh `Cái`, `Kg`. Mét và Kg là đơn vị **đo** (số lẻ tới 3 chữ số); còn lại là đơn vị **đếm** (số nguyên). Mọi đơn vị trừ Kg có **trọng lượng chuẩn** (kg trên một đơn vị). Đơn vị vẫn không đổi được sau khi tạo.
- **Cho thuê mọi đơn vị**: bỏ CHECK `item_rental_unit_check`; mã tính theo kg / mét có giá thuê theo ngày tính trên 1 kg / 1 mét. D9 hiện "1.200 ₫/m" thay vì chỉ "1.200 ₫".
- **Phân loại nhóm hàng**: mỗi nhóm hàng thuộc **Thiết bị** (hàng kinh doanh: giàn giáo, phụ kiện cho thuê/bán) hoặc **Vật tư** (nguyên vật liệu, vật tư xưởng: thép ống, tôn, sơn, que hàn). D9 lọc theo phân loại rồi theo nhóm. Nhóm có sẵn chuyển thành Thiết bị.
- **Mã ghép và có đầu / không đầu** (`KB+KU34`, `H1,7` / `H1,7KĐ`): là mã vật tư riêng, không phải bộ, không liên kết tự động.
- **Công trình có tỉnh/thành** (34 tỉnh/thành sau sắp xếp 2025) và **khu vực** Bắc / Trung / Nam suy ra từ tỉnh. Tab Công trình ở D16 có cột tỉnh, khu vực và lọc theo khu vực (trên URL).
- **Nhà thầu có nhân viên phụ trách** (tùy chọn): chọn từ tài khoản Kinh doanh hoặc Giám đốc đang hoạt động. D16 hiện và lọc theo nhân viên phụ trách. **Không giới hạn quyền xem** theo người phụ trách (tách quyền thuê/bán làm ở #9).
- **Không ảnh hưởng Sổ kho và giá vốn**: không đổi dòng sổ nào, không đổi cách tính giá BQ. Đơn vị mới chỉ dùng cho mã tạo sau; mã cũ giữ `cái` / `kg`. Mã tính theo mét đi qua cùng đường số lẻ như kg.

## Capabilities

### New Capabilities

(không có)

### Modified Capabilities

- `item-catalog`: luật mã mới, mã cũ, đơn vị mới và trọng lượng chuẩn theo đơn vị, quy đổi kg theo đơn vị, giá thuê cho mọi đơn vị, phân loại nhóm hàng, bộ gồm vật tư đơn vị đếm, D9 có cột/lọc mới, mã ghép và có đầu/không đầu là mã riêng.
- `item-scan`: gõ mã ở M2 và tra tồn nhận mã có ký tự mới và mã cũ.
- `partner-directory`: nhân viên phụ trách nhà thầu, lọc theo nhân viên ở D16.
- `sites-and-locations`: tỉnh/thành và khu vực của công trình, lọc công trình theo khu vực ở D16.

## Ngoài phạm vi

- **Tách quyền xem hàng thuê / hàng bán** và giới hạn nhân viên chỉ thấy khách của mình: #9 `contracts`.
- **11 khu vực lưu trữ KV 1–11** trong bãi/xưởng (0.2 #41): change `stocktake` / `truck-management`.
- **Đổi hàng** (xuất đầu nối rời ghép vào khung không đầu, 0.2 #38) và quan hệ giữa mã có đầu / không đầu: `returns-and-compensation` (#11).
- **Lệnh sản xuất** dùng nguyên vật liệu: `production-orders` (#46).
- **Chuyển dữ liệu từ Excel** (mã vật tư, công trình, khách): #48. Change này chỉ làm cho danh mục chứa được dữ liệu đó.
- Đổi đơn vị của mã đã tạo, đổi mã đã tạo.
- Cách tính tiền thuê theo kg/mét trên hợp đồng (giá × số lượng × ngày): `rental-billing` (#13). Change này chỉ cho lưu giá mặc định.
- Báo cáo theo khu vực (công trình rủi ro theo vùng): `dashboard-basic` (#15).

## Impact

- **DB** (một migration): `item` đổi CHECK mã, đơn vị, trọng lượng, bỏ `item_rental_unit_check`, thêm `code_key`; bảng mới `item_alias`; `kit` đổi CHECK mã và thêm `code_key`; `item_group.category`; `site.province`; `customer.sales_user_id` (FK `user`); `purchase_order_line_unit_check` nhận đơn vị mới.
- **Domain**: `src/domain/item-code.ts` (luật mã mới, khóa so trùng), `src/domain/quantity.ts` (đơn vị đếm / đo), `src/domain/kit.ts`, mới `src/domain/province.ts` (34 tỉnh + khu vực).
- **Service / API**: `src/lib/catalog/items.ts`, `kits.ts`, `item-groups.ts`, `partners.ts`, `places.ts`; `src/app/api/catalog/*`, `src/app/api/stock/lookup`; `src/domain/qr-payload.ts`. Đường dẫn có mã (`/inventory/items/[code]`) phải mã hóa URL đúng cho `+`, `,`, khoảng trắng.
- **Code đang rẽ nhánh `"PIECE"` / `"KG"`** (đơn mua, phiếu nhập, sửa chữa, kiểm kê, thẻ kho...): đổi sang hỏi "đơn vị đếm hay đo" và "có trọng lượng chuẩn không". Hành vi với mã `cái` / `kg` hiện có không đổi.
- **Giao diện**: D9, D16 (sửa theo cột mới; cần cập nhật file thiết kế `D9-Items.dc.html`, `D16-Partners.dc.html`), M2 (chỉ đổi kiểm tra mã khi gõ). Ảnh mốc D9, D16 đổi.
- **Seed dev**: thêm vài mã thật (`H1,7`, `H1,7KĐ`, `KB+KU34`, `NỐI 34`, thép ống tính theo mét, que hàn tính theo hộp), tỉnh cho công trình mẫu, nhân viên phụ trách cho nhà thầu mẫu.
- **Nhật ký thao tác**: sửa mã cũ, phân loại nhóm, tỉnh, nhân viên phụ trách đều ghi `logActivity`.
