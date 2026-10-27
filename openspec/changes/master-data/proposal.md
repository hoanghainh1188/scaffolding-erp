# Proposal: master-data

## Why

Mọi chứng từ sau này (sổ kho, đơn mua, phiếu nhập, hợp đồng, phiếu xuất, thu hồi) đều tham chiếu tới **mã hàng, đối tác, công trình và kho**. Hiện chưa có bảng nào cho các thứ này. Phải có danh mục trước khi làm Sổ kho (`inventory-ledger`).

Giai đoạn: **[MVP]** — change số 3 trong `docs/roadmap.md`, issue #5. Màn hình: **D9 Danh mục vật tư** (`D9-Items.dc.html`), **D16 Đối tác & công trình** (`D16-Partners.dc.html`).

## What Changes

- **Vật tư (mã hàng)**: mã do người dùng gõ (VD `GG-K17`), không đổi sau khi tạo; tên; nhóm hàng; đơn vị **cái** hoặc **kg**; **trọng lượng chuẩn** (kg/cái, bắt buộc với hàng tính theo cái); **giá thuê mặc định theo ngày** (giá tháng = ngày × 30, chỉ hiển thị); **giá đền bù mặc định** khi mất và khi hỏng sửa được (để hợp đồng lấy làm gợi ý). Hàng tính theo kg (phế liệu) không cho thuê.
- **Nhóm hàng**: danh sách nhóm (Giàn giáo, Phụ kiện, Ống thép, Phế liệu...) để lọc và sắp xếp.
- **Bộ (kit)**: gồm nhiều linh kiện với số lượng; không lồng bộ trong bộ. Trọng lượng và giá thuê 1 bộ **tính ra** từ linh kiện, không lưu (quyết định 0.2 #4b). Chỉ dùng để báo giá.
- **Quy đổi kg ↔ cái** theo trọng lượng chuẩn (hàm dùng chung cho đơn mua, phiếu nhập sau này).
- **Nhà thầu (khách hàng)**: mã tự sinh `NT-0001`, công ty hoặc cá nhân, mã số thuế, người liên hệ, điện thoại, địa chỉ, **hạn thanh toán mặc định** (số ngày, quyết định 0.2 #18).
- **Nhà cung cấp**: mã tự sinh `NCC-0001`, công ty hoặc **cá nhân** (người bán sắt vụn, cai thầu thanh lý): tên, điện thoại, CCCD, tài khoản ngân hàng (tùy chọn).
- **Công trình**: mã tự sinh `CT-0001`, tên, địa chỉ, **1 nhà thầu**. Tạo công trình thì tự tạo vị trí kho loại `SITE` đi kèm.
- **Kho, bãi, xưởng** (`location`): loại `YARD`, `WORKSHOP`, `SITE`. Migration tạo sẵn **1 bãi + 1 xưởng** (quy mô hiện tại, mục 0.1).
- **Ngừng dùng thay vì xóa**: bản ghi đã được tham chiếu thì không xóa được, chỉ ngừng dùng; ngừng dùng thì không chọn được ở chứng từ mới, vẫn hiện ở chứng từ cũ. Bản ghi chưa dùng thì xóa được.
- **Quyền mới** trong bảng quyền: sửa vật tư/bộ/nhóm (Giám đốc, Kinh doanh), sửa đối tác/công trình (Giám đốc, Kinh doanh, Kế toán), sửa kho/bãi/xưởng (Giám đốc). Mọi vai trò được **đọc** danh mục qua API (điện thoại của thủ kho sẽ cần ở `goods-receipt`).
- Mục menu **Danh mục** hết là trang giữ chỗ: `/catalog/items` (D9) và `/catalog/partners` (D16).

## Capabilities

### New Capabilities

- `item-catalog`: Vật tư, nhóm hàng, bộ (kit), giá mặc định, quy đổi kg ↔ cái — màn D9.
- `partner-directory`: Nhà thầu và nhà cung cấp — màn D16 (hai tab đầu).
- `sites-and-locations`: Công trình và kho/bãi/xưởng, vị trí `SITE` tự tạo theo công trình — màn D16 (hai tab sau).

### Modified Capabilities

- `auth`: requirement "Bảng quyền theo vai trò" thêm các quyền đọc/sửa danh mục.

## Impact

- **DB**: migration mới tạo `item_group`, `item`, `kit`, `kit_component`, `customer`, `supplier`, `site`, `location` (+ 1 bãi, 1 xưởng). Chưa có Sổ kho nên **không ảnh hưởng số liệu tồn kho hay giá vốn nào**; khóa ngoại `ON DELETE RESTRICT` chuẩn bị sẵn để Sổ kho sau này chặn xóa mã hàng đã có giao dịch.
- **Code**: `src/domain/` (mã hàng, quy đổi kg ↔ cái, giá bộ), `src/lib/catalog/` (service + transaction), route `src/app/api/catalog/*`, trang `src/app/(desktop)/catalog/*`, thêm quyền ở `src/domain/permissions.ts`.
- **Test**: unit (quy đổi, mã, giá bộ), integration (tạo/sửa/ngừng dùng/xóa, quyền 403 từng vai trò), component (D9, D16), E2E (luồng chính), ảnh mốc mới cho D9, D16.
- Không thêm thư viện.

## Ngoài phạm vi

- **In nhãn QR theo mã hàng**: làm ở `goods-receipt` (cùng màn quét M2). Change này chỉ chốt nội dung QR = mã hàng.
- Cột "đang nợ / nợ quá hạn" của nhà thầu ở D16: làm ở `receivables`.
- Cột "Hợp đồng / Đang thuê / Tình hình" của công trình ở D16: làm ở `contracts` và `deliveries`.
- Giá bán đứt mặc định: đặt trong hợp đồng (`contracts`), không ở danh mục.
- Nhập danh mục từ Excel; ảnh vật tư; nhiều đơn vị tính cho một mã (chỉ cái **hoặc** kg).
- Màn danh mục trên Mobile.
