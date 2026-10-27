# Proposal: inventory-ledger

## Why

Các change sau (nhập hàng, xuất cho công trình, thu hồi, sửa chữa, tính tiền thuê) đều cần **một chỗ ghi biến động hàng** và **một cách tính giá vốn** dùng chung. Hiện danh mục đã có (`master-data`) nhưng chưa có tồn kho. Đây là change lõi: sai ở đây thì mọi số tồn, giá vốn, tiền thuê về sau đều sai.

Giai đoạn: **[MVP]** — change số 4 trong `docs/roadmap.md`, issue #6. Màn hình: **D10 Tồn kho tổng hợp** (`D10-Stock.dc.html`), **D11 Thẻ kho** (`D11-StockCard.dc.html`). Quyết định đã chốt dùng: `docs/requirements.md` mục 0.2 số 1, 2, 3, 10, 11.

## What Changes

- **Sổ kho (`inventory_ledger`) chỉ ghi thêm**: mỗi dòng là một biến động của (mã hàng, tình trạng, vị trí) với số lượng có dấu, đơn giá ghi sổ, giá vốn bình quân sau dòng, loại biến động, chứng từ gốc, ngày nghiệp vụ. DB **chặn UPDATE, DELETE, TRUNCATE** bằng trigger. Ghi sai thì làm phiếu điều chỉnh.
- **Giá vốn bình quân gia quyền theo (mã hàng + tình trạng)**, chung cho mọi vị trí (bãi, xưởng, công trình). Chỉ **nhập mua, nhập sau sửa, tồn đầu kỳ** làm đổi giá BQ; giá mới **làm tròn đến 1 ₫** (0,5 làm tròn lên). Xuất, thu hồi, chuyển vị trí, chuyển tình trạng do điều chỉnh ghi theo **giá BQ hiện tại**, không làm đổi giá BQ.
- **Hàm ghi sổ dùng chung** (`postMovements`) cho các change sau: kiểm tồn không âm, khóa theo (mã hàng + tình trạng) để hai phiếu ghi cùng lúc không làm sai giá BQ, ghi mọi dòng của một chứng từ trong **một transaction**.
- **Tồn theo vị trí**: bãi, xưởng, từng công trình. Hàng ở công trình là tồn tại vị trí `SITE` của công trình đó (đã có từ `master-data`).
- **D10 Tồn kho tổng hợp** (`/inventory`, thay trang giữ chỗ "Kho"): bảng theo mã hàng, tại bãi tách 4 tình trạng, tại xưởng, tại công trình (bấm xem từng công trình), tổng, giá trị theo giá BQ; 3 thẻ số (giá trị hàng tồn, chờ sửa, phế liệu tại bãi). Bấm số mở thẻ kho.
- **D11 Thẻ kho** (`/inventory/items/[code]`): lọc tình trạng, vị trí, kỳ; tồn đầu kỳ, nhập, xuất, tồn cuối; từng dòng sổ với đơn giá ghi sổ và giá BQ sau.
- **Phiếu điều chỉnh** (`ĐC-2026-001`): sửa sai số lượng, sai tình trạng, sai vị trí. **Lý do bắt buộc.** Kế toán hoặc Giám đốc lập, **chỉ Giám đốc duyệt**; chỉ khi duyệt mới ghi sổ. Sửa sai tình trạng ra đúng 2 dòng (bớt ở tình trạng cũ, thêm ở tình trạng mới).
- **Phiếu tồn đầu kỳ** (`TĐK-2026-001`): nhập số lượng + giá vốn khi bắt đầu dùng phần mềm, theo cùng luồng lập/duyệt. Chỉ dùng được cho (mã hàng + tình trạng) chưa có biến động nào khác.
- **Phế liệu**: mã tính theo cái vẫn đếm theo cái ở tình trạng `SCRAP`, màn hình hiện kèm kg bằng `piecesToKg`; mã tính theo kg (`PL-SAT`) đếm theo kg. Dòng sổ có cột kg cân thực tế (tùy chọn) để change bán hàng ghi khi bán phế liệu theo kg.
- **Chặn ngừng dùng khi còn tồn**: vật tư còn tồn ở bất kỳ đâu, công trình/bãi/xưởng còn hàng thì không ngừng dùng được. Xóa đã bị chặn bởi khóa ngoại `ON DELETE RESTRICT` từ sổ kho.
- **Quyền mới** trong `src/domain/permissions.ts`: `inventory.adjust` (lập phiếu điều chỉnh, tồn đầu kỳ: Giám đốc, Kế toán), `inventory.approve` (duyệt: Giám đốc). Xem kho dùng quyền `inventory.view` đã có (Giám đốc, Kế toán, Kinh doanh).
- **Đối chiếu**: lệnh `npm run inventory:check` so bảng giá vốn hiện tại với sổ kho, báo lệch.

## Capabilities

### New Capabilities

- `inventory-ledger`: Sổ kho chỉ ghi thêm, loại biến động, giá vốn bình quân và làm tròn, tồn theo vị trí, ghi đồng thời an toàn, đối chiếu.
- `stock-adjustments`: Phiếu điều chỉnh và phiếu tồn đầu kỳ: lập, gửi duyệt, Giám đốc duyệt/trả lại, ghi sổ khi duyệt.
- `stock-views`: Màn D10 Tồn kho tổng hợp và D11 Thẻ kho, cách hiện hàng cái/kg/phế liệu.

### Modified Capabilities

- `auth`: requirement "Bảng quyền theo vai trò" thêm `inventory.adjust`, `inventory.approve`.
- `item-catalog`: requirement "Ngừng dùng và xóa vật tư, bộ" chặn ngừng dùng vật tư còn tồn.
- `sites-and-locations`: requirement "Ngừng dùng và xóa công trình, vị trí" chặn ngừng dùng công trình, bãi, xưởng còn hàng.

## Impact

- **Số liệu đã có**: chưa có dòng sổ kho nào trước change này, nên **không có số tồn hay giá vốn cũ bị tính lại**. Số tồn thật đầu tiên vào hệ thống qua phiếu tồn đầu kỳ.
- **DB**: migration mới tạo `inventory_ledger` (+ trigger chặn sửa/xóa), `inventory_cost` (giá BQ hiện tại theo mã + tình trạng, dùng để khóa và đọc nhanh, có đối chiếu), `stock_adjustment`, `stock_adjustment_line`, sequence mã phiếu. Khóa ngoại `RESTRICT` tới `item`, `location`, `user`.
- **Code**: `src/domain/` (tính giá BQ, quy tắc loại biến động, kiểm phiếu điều chỉnh), `src/lib/inventory/` (ghi sổ, đọc tồn, thẻ kho, phiếu điều chỉnh, đối chiếu), route `src/app/api/inventory/*`, trang `src/app/(desktop)/inventory/*`; sửa `src/lib/catalog/items.ts`, `places.ts` (chặn ngừng dùng khi còn tồn); thêm quyền ở `src/domain/permissions.ts`; `npm run db:seed:dev` thêm số liệu mẫu khớp D10/D11.
- **Test**: unit (giá BQ nhiều ca, làm tròn, loại biến động), integration (không sửa/xóa được dòng sổ, ghi đồng thời, tồn và thẻ kho khớp sổ, điều chỉnh sai tình trạng ra 2 dòng, quyền 403 từng vai trò, chặn ngừng dùng), component (D10, D11, form điều chỉnh), E2E (luồng chính), ảnh mốc mới cho D10, D11.
- Không thêm thư viện.

## Ngoài phạm vi

- **Phiếu nhập, phiếu xuất, phiếu thu hồi, phiếu sửa chữa**: thuộc `goods-receipt`, `deliveries`, `returns-and-compensation`, `simple-repair`. Change này chỉ làm hàm ghi sổ cho các loại biến động đó (có test) để các change sau gọi.
- **Bán phế liệu theo kg** (giá bán theo kg, cân khi xuất): màn và phiếu thuộc `contracts`/`deliveries`; change này chốt cách ghi sổ (bớt theo cái, lưu kg cân).
- Nút "Lập phiếu sửa chữa" ở D10 và nút "Xuất Excel" ở D11: chưa hiện; làm ở `simple-repair` và khi làm xuất Excel cho kế toán.
- Kiểm kê trên mobile và phiếu điều chỉnh sinh từ kiểm kê: `stocktake` [Bản 2].
- Màn tồn kho trên Mobile cho thủ kho.
- Ngày thuê của hàng đã ở công trình trước khi dùng phần mềm: phiếu tồn đầu kỳ chỉ ghi số lượng tại công trình; ngày bắt đầu tính thuê thuộc `contracts`/`rental-billing`.
- Nhập tồn đầu kỳ từ file Excel.
