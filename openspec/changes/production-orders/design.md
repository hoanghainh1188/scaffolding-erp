# Design: Sản xuất thành phẩm từ nguyên liệu (`production-orders`)

## Context

- **Lệnh sửa (`repair-work-orders`)** đã chạy đủ luồng:
  - Bảng `repair_order` (`kind` SIMPLE | WORK_ORDER), `repair_order_line`, `repair_order_material`, `repair_order_submission` (chỉ ghi thêm).
  - Hàm thuần `src/domain/repair-work-order.ts`: `transition`, `laborAmount`, `splitMaterialIssue` (Mới trước rồi Tốt), `issueAmount`, `workOrderPostingLines`.
  - Server `src/lib/repairs/`: `lockWorkOrder`, `assertFresh` (409), `floorStep` (tìm `draftId` trước khi khóa), `postWorkOrder`.
  - Điện thoại M8: `/m/repairs`, `/api/m/repairs/**`, nháp loại `REPAIR` trong `src/lib/drafts/`, `phone-queries.ts` chọn cột tường minh.
  - Trigger `repair_order_posted_frozen` khóa lệnh Đã ghi sổ / Đã hủy, nên phải ghi số cuối **trước** khi đổi trạng thái.
- **Sổ kho:**
  - Loại biến động có CHECK ở DB (`inventory_ledger_movement_check`) và danh sách TS `MOVEMENTS` (`src/domain/movement.ts`).
  - `changesAverage` = OPENING, PURCHASE_IN, REPAIR_IN, REVALUE.
  - Dòng đổi giá giữ **đúng tổng giá trị** ở cột `amount`; `unit_cost` chỉ để hiện; giá BQ sau làm tròn 1 ₫ (`averageAfterInflow`).
  - `document_type` là chữ tự do, không có CHECK.
  - `inventory:check` so `inventory_cost` với dòng sổ cuối.
- **D15:**
  - `classifyLedger` trả `null` cho mọi loại không phải bán, mất, thu hồi, điều chỉnh. Vì vậy `PRODUCTION_*` tự động không vào khoản giá vốn nào.
  - `ledgerCostCheck` cộng bù chi phí ngoài sổ của sửa chữa: `Σ(repairCost − materialCost)`.
  - Hàng cho thuê (`src/lib/reports/fleet.ts`) chỉ lấy mã nhóm `EQUIPMENT`; hao hụt chỉ đọc `LOSS_OUT` và `RETURN_IN` Chờ sửa / Phế liệu.
- **Danh mục:**
  - Nhóm `item_group.category` là `EQUIPMENT` / `MATERIAL`.
  - Đơn vị đếm và đơn vị đo ở `src/domain/quantity.ts`; trọng lượng chuẩn quy kg qua `lineWeightKgMilli`.
- **Giá sắt vụn:** bảng `scrap_price` (chỉ ghi thêm), `currentScrapPrice(tx)`, trang `/settings/scrap-price`, quyền `scrap-price.manage` (Giám đốc).
- **Đã chốt:** 0.2 #139–#146 (09/11/2026). Câu hỏi chốt thêm khi propose: #152–#155.

## Goals / Non-Goals

**Goals:**

- Giá thành phẩm tính đúng từng đồng từ sổ kho và đơn giá đã chụp, không gõ tay.
- D15 không lệch: đẳng thức đối chiếu bằng 0, không trừ nguyên liệu hai lần, đầu thừa không thành lãi.
- Điện thoại không bao giờ nhận số tiền.
- Dùng lại tối đa hàm và khung của lệnh sửa.

**Non-Goals:**

- Không đổi lệnh sửa, không đổi công thức 0.2 #23.
- Không lưu số cộng dồn: công, nguyên liệu, giá trị chỉ chụp lúc ghi sổ.
- Không mẫu in A5 (0.2 #154), không lỗ sản xuất (0.2 #155).

## Decisions

### D1. Bảng riêng, dùng lại hàm của lệnh sửa (điểm cần chốt 1)

**Chọn:** bảng riêng `production_order`, `production_order_line`, `production_order_material`, `production_order_submission`. Dùng lại hàm và khung, không dùng chung bảng.

**Lý do:**

- Dòng lệnh sửa xoay quanh **hàng lấy vào** (`quantity_taken` Chờ sửa → Tốt / Phế liệu, CHECK `good + scrap = taken`). Dòng lệnh sản xuất không có hàng lấy vào: ra một mã Mới từ nhiều nguyên liệu. Dùng chung phải nới hoặc bỏ gần hết CHECK của `repair_order_line`.
- Lệnh sửa có bước chuyển hàng bãi → xưởng lúc nhận (`receive_posting_id`, `cancel_posting_id`). Lệnh sản xuất không có, vì nguyên liệu đã ở xưởng.
- D15 đọc `repair_order_line.repair_cost`, `loss_amount` của lệnh `POSTED`. Trộn lệnh sản xuất vào thì `repairSums` và mọi chỗ đọc `repair_order` phải lọc thêm `kind`, dễ sót.
- Mã khác dãy: `LSX` (thiết kế D20 `LSX-2026-004`), không chung `PSC`.

**Dùng lại:**

| Phần | Cách dùng |
|---|---|
| `splitMaterialIssue`, `issueAmount`, `laborAmount` | Gọi thẳng từ `src/domain/repair-work-order.ts`. `laborAmount` và `splitMaterialIssue` chuyển sang `src/domain/work-order-common.ts` để hai bên cùng import, không đổi hành vi |
| `lockForPosting`, `postMovements`, `nextDocumentCode`, `currentScrapPrice` | Gọi như lệnh sửa |
| Cách khóa + `assertFresh` + tìm `draftId` trước khi khóa | Viết lại theo cùng mẫu trong `src/lib/production/` (hàm nhỏ, khác bảng) |
| Nháp điện thoại, outbox | Thêm loại nháp `PRODUCTION` vào `DRAFT_KINDS` và một `productionSender` |
| Khung M8 (thẻ, stepper, ô số lẻ) | Dùng lại component trong `src/components/repairs/phone/` khi không gắn với dòng sửa; phần riêng viết ở `src/components/production/phone/` |

**Quyền:** quyền riêng `production.*`, không dùng `repairs.*` (xem D6).

**Đã cân nhắc:**

- **Chung bảng `repair_order` + `kind = PRODUCTION`:** một danh sách, một dãy mã. Nhưng phải nới CHECK, thêm cột chỉ một loại dùng, và D15 phải lọc `kind`. Rủi ro làm hỏng lệnh sửa đang chạy. Bỏ.
- **Bảng chung trừu tượng (`work_order`) cho cả hai:** đổi lớn bảng đang có dữ liệu. Bỏ.

### D2. Loại dòng sổ mới `PRODUCTION_OUT` / `PRODUCTION_IN` (điểm cần chốt 2)

**Chọn:**

- Thêm `PRODUCTION_OUT` vào `MOVEMENTS_OUT` và `PRODUCTION_IN` vào `MOVEMENTS_IN` (`src/db/schema/inventory.ts`, `src/domain/movement.ts`).
- Migration thay `inventory_ledger_movement_check`.
- `changesAverage` thêm `PRODUCTION_IN`, nên `assertMovementLine` bắt dòng `PRODUCTION_IN` phải có `amount`.
- `document_type = 'PRODUCTION'`, `document_id` = lệnh, một `posting_id` cho cả lần ghi sổ, lưu ở `production_order.posting_id`.
- Đầu thừa là `PRODUCTION_IN` Phế liệu của Mã sắt vụn: cũng là dòng đổi giá (giá trị = kg × giá sắt vụn).

**Lý do:**

- Dữ liệu đúng nghĩa: lọc, đếm, đối chiếu theo loại biến động (D15, `inventory:check`, báo cáo sau này) không phải nhớ lọc thêm `document_type`. Thẻ kho (D11) chỉ hiện mã chứng từ và `description`, nên chữ trên thẻ kho do `description` quyết định (xem dưới).
- `classifyLedger` trả `null` cho loại lạ, nên D15 đúng ngay. Test chống lệch giữa CHECK DB và `MOVEMENTS` đã có, bắt chỗ quên.
- Thành phẩm Mới phải đổi giá BQ. Đó đúng là vai trò của loại nhập đổi giá.

**Mô tả dòng sổ** (`description`, hiện trên thẻ kho D11), sinh trong `productionPostingLines`:

- nguyên liệu: `LSX-2026-004: nguyên liệu làm GG-K17`;
- thành phẩm: `LSX-2026-004: nhập sản xuất GG-K17`;
- đầu thừa: `LSX-2026-004: đầu thừa làm GG-K17`.

Câu báo `amountNotAllowed` (`src/domain/movement.ts`) đang liệt kê các loại đổi giá: thêm loại sản xuất.

**Đã cân nhắc:**

- **Dùng lại `REPAIR_OUT` / `REPAIR_IN` với `document_type = 'PRODUCTION'`:** không phải sửa CHECK. Nhưng mọi chỗ đọc `REPAIR_*` phải nhớ lọc `document_type`, và dữ liệu lẫn nghĩa sửa với làm mới. Bỏ.
- **`ADJUST_*`:** D15 xếp vào chênh lệch kiểm kê. Sai. Bỏ.

**Nơi ghi:**

- `PRODUCTION_OUT` nguyên liệu: ở **xưởng của lệnh**.
- `PRODUCTION_IN` thành phẩm và đầu thừa: ở **bãi nhận** (0.2 #146). Thủ kho đếm ở bãi.

### D3. D15 không lệch (điểm cần chốt 3)

**Tổng dòng sổ một lần ghi sổ** = − nguyên liệu + (nguyên liệu + công − đầu thừa) + đầu thừa = **+ công**.

Ví dụ D20:

| Dòng sổ | Giá trị |
|---|---|
| `PRODUCTION_OUT` nguyên liệu (`XUONG-01`) | −41.119.500 |
| `PRODUCTION_IN` 100 `GG-K17` Mới (`BAI-01`) | +32.660.500 |
| `PRODUCTION_IN` 200 `GG-CH` Mới (`BAI-01`) | +13.206.500 |
| `PRODUCTION_IN` 47 kg `PL-SATVUN` Phế liệu (`BAI-01`) | +352.500 |
| **Cộng** | **+5.100.000** = công |

**Sửa code:**

- `src/domain/gross-profit.ts`:
  - Thêm `ProductionSum { month, laborCost }`.
  - `ledgerCostCheck(…, productions)` cộng thêm `Σ laborCost`.
  - `monthlyProfit` trả thêm `productionSpent` để ghi dưới bảng.
- `src/lib/reports/costs.ts`: `productionSums()` nối `inventory_ledger.posting_id = production_order.posting_id` (lệnh Đã ghi sổ). Lọc `document_type = 'PRODUCTION'`, tháng = `min(business_date)` của posting đó, cộng `production_order_line.labor_amount`. Cùng mẫu với `repairSums` (lọc `REPAIR` và nối theo `posting_id` của lần ghi sổ).
- `classifyLedger` **không đổi**: `PRODUCTION_*` trả `null`. Thêm test khẳng định điều này, để ai thêm nhánh sau này không vô tình xếp vào giá vốn.

**Kiểm:**

- Đẳng thức: −5.100.000 + 5.100.000 = 0.
- Nếu cộng cả nguyên liệu vào chi phí ngoài sổ thì lệch 41.119.500. Test phải bắt (giống lỗi đã bắt ở lệnh sửa).
- Đầu thừa: +352.500 ở Phế liệu và −352.500 trong giá thành phẩm, cộng 0. Không thành lãi.

**Có cần dòng "Sản xuất" trong bảng giá vốn không:** không. Lệnh sản xuất không tạo khoản lỗ nào (0.2 #155 bỏ lỗ sản xuất). Phần dùng vượt nằm trong giá thành phẩm, vào lợi nhuận khi thành phẩm rời kho. Dưới bảng ghi thêm "Công sản xuất đã chi trong kỳ", như "Chi phí sửa đã chi".

**Hàng cho thuê:**

- Thành phẩm (nhóm Thiết bị) vào hàng cho thuê bình quân từ ngày ghi sổ. Đúng nghĩa: thêm hàng cho thuê.
- Nguyên liệu và Mã sắt vụn là nhóm Vật tư, đã bị loại (0.2 #125). Spec bắt Mã sắt vụn phải là nhóm Vật tư cũng vì lý do này.
- `PRODUCTION_*` không vào hao hụt (hao hụt chỉ đọc `LOSS_OUT`, `RETURN_IN`).

### D4. Làm tròn giá vốn / cái (điểm cần chốt 4)

- Dòng sổ `PRODUCTION_IN` ghi **đúng tổng giá trị dòng** ở `amount` (13.206.500 ₫), như mọi dòng nhập đổi giá. `unit_cost` = 66.033 ₫ chỉ để hiện.
- Giá BQ sau = (giá trị tồn + 13.206.500) ÷ (tồn + 200), làm tròn 1 ₫ bằng `averageAfterInflow` có sẵn.
- `inventory:check` so `inventory_cost` với `avg_cost_after` của dòng sổ cuối. Cả hai do cùng một hàm tính, nên không lệch.
- Không cần chia phần dư: tổng giá trị sổ khớp từng đồng vì cột `amount` giữ số gốc.
- D20 hiện giá vốn / cái = `unitCostOf(giá trị, số)` (làm tròn nửa lên): 66.032,5 → 66.033 ₫, đúng bản vẽ.
- **Đã cân nhắc:** tách thành 199 cái giá 66.033 và 1 cái giá khác để tổng khớp. Không cần, vì sổ không lưu theo đơn giá. Bỏ.

### D5. Vượt định mức (điểm cần chốt 5)

**Chọn:**

- So theo **số Thủ kho đếm** (cả làm xong và thực dùng). Số xưởng báo chỉ để nhắc trên M10.
- `src/domain/production-order.ts`:
  - `OVERUSE_LIMIT_PERCENT = 5`, chỉ đặt ở đây.
  - `normMilli(perUnitMilli, finished, unit)`: định mức × số làm xong. Nguyên liệu **đơn vị đếm** (cái, cây…) **làm tròn lên số nguyên** (0,5 cây × 3 = 1,5 → 2 cây), vì sổ kho không xuất lẻ đơn vị đếm (`assertMovementLine`). Đơn vị đo (kg, m, lít) giữ 3 số lẻ, làm tròn nửa lên. M10 điền sẵn đúng số này, và vượt định mức so với chính số này, nên xưởng dùng đúng số điền sẵn thì không bao giờ bị tính là vượt.
  - `overuse(actualMilli, normMilli)` → `{ percentTenths, over }`, với `over` = `actual × 100 > norm × 105`, tính số nguyên, không dùng số thực.
  - Định mức 0 mà thực dùng > 0 thì `over = true`, % hiện "—" (ngoài định mức).
- Đếm xong: có `over` thì sang `AWAITING_APPROVAL`, không thì `COUNTED`.
- Ghi sổ tính lại `over` từ số đã lưu. Nếu có vượt mà lệnh chưa có `approved_at` thì từ chối (phòng dữ liệu lệch).
- **Giá trị dùng vượt** chỉ để xem, không lưu: phần vượt × giá BQ, làm tròn 1 ₫ từng nguyên liệu. Trước ghi sổ dùng giá BQ hiện tại; sau ghi sổ dùng giá bình quân thực xuất = `amount` ÷ số thực dùng của (dòng, nguyên liệu), làm tròn nửa lên.
- **"Tạm tính" trên D20** (trước ghi sổ): chia Mới trước rồi Tốt theo tồn và giá BQ hiện tại ở xưởng, đúng cách ghi sổ sẽ chia, nên số tạm tính khớp số ghi sổ nếu tồn không đổi.

- Báo / đếm: số nguyên liệu đơn vị đếm phải là số nguyên, đơn vị đo tối đa 3 số lẻ (cùng luật số lượng của danh mục).

**Lý do:**

- Thủ kho là người nghiệm thu (0.2 #128, #141). Duyệt dựa trên số chưa đếm thì Thủ kho đếm khác sẽ phải duyệt lại.
- Nguyên liệu ngoài định mức tính là vượt 100 % trở lên: xưởng dùng thứ văn phòng không lường trước, Giám đốc nên biết.

**Đã cân nhắc:**

- So số xưởng báo và chặn ngay lúc báo: xưởng không sửa được thực tế, chỉ làm chậm. Bỏ.
- Ngưỡng theo giá trị (VD vượt > 500.000 ₫): chủ đã chốt theo % (0.2 #140). Bỏ.

### D6. Quyền và menu (điểm cần chốt 6)

| Quyền | Vai trò | Dùng cho |
|---|---|---|
| `production.view` | Giám đốc, Kế toán, Kinh doanh | `/production`, D20, D19 (chỉ xem) |
| `production.manage` | Giám đốc, Kế toán | Định mức; lập, sửa, xóa nháp, giao, thu hồi, trả lại, hủy, ghi sổ |
| `production.approve` | Giám đốc | Duyệt vượt định mức |
| `production.work` | Giám đốc, Xưởng | `/m/production`, nhận lệnh, báo làm xong |
| `production.count` | Giám đốc, Thủ kho | `/m/production`, đếm |

- Quyền riêng thay vì dùng lại `repairs.*`. Hôm nay cùng vai trò, nhưng chủ có thể muốn tách người sửa và người làm hàng mới. Thêm 5 dòng vào `permissions.ts`, không đổi gì khác.
- Mã sắt vụn: `scrap-price.manage` (Giám đốc), cùng trang Giá sắt vụn.
- **Menu (0.2 #153):**
  - Mục mới "Sản xuất" (icon `factory`), sau "Sửa chữa", quyền `production.view`, href `/production`.
  - Trang `/production` có hai tab: "Lệnh sản xuất" và "Định mức" (`/production/boms`).
  - Sidebar 10 mục; spec `app-shell` đổi tên requirement.
- **Điện thoại:** M1 thêm khối "Sản xuất". Thanh tab 4 mục không đổi.

### D7. Mẫu in A5 (điểm cần chốt 7)

Chưa làm (0.2 #154). Xưởng dùng M10. Khi cần thì một change nhỏ thêm `/production/[code]/print` theo mẫu phiếu xuất, không đổi bảng.

### D8. Ảnh mốc và E2E (điểm cần chốt 8)

**Seed (`db:seed:dev`, `db:seed:demo`), `src/lib/production/sample.ts`:**

- Nhóm "Nguyên liệu sản xuất" (`MATERIAL`): `VT-ONG42` (kg), `VT-ONG27` (kg), `VT-CHOT` (cái, 0,15 kg), tồn đầu kỳ ở `XUONG-01` đủ cho lệnh mẫu, giá như D19/D20.
- Dùng lại `VT-QH`, `VT-SON` của lệnh sửa, nhưng tồn hiện có (18 kg, 12 lít) không đủ: lệnh mẫu cần 12,5 kg và 14 lít, lệnh sửa mẫu còn dùng 6 kg và 3,5 lít. `seedProduction` thêm tồn đầu kỳ `VT-QH` 20 kg × 45.000 ₫ và `VT-SON` 20 lít × 90.000 ₫ (cùng giá cũ, nên giá BQ trên D19 / D20 / D12 không đổi).
- Mã sắt vụn `PL-SATVUN` (kg, nhóm Vật tư), đặt làm Mã sắt vụn nếu chưa có.
- Định mức `GG-K17` (5 nguyên liệu, công 35.000 ₫) và `GG-CH` (`VT-ONG27` 2,9 kg, `VT-SON` 0,03 lít, công 8.000 ₫) như D19.
- Một lệnh mẫu `LSX` **Chờ Giám đốc duyệt** như D20 (tổ anh Lực), đi qua đúng các hàm thật với `draftId` cố định. Chạy lại không thêm.
- Seed ghi sổ một phần không cần: D20 mẫu là trạng thái chờ duyệt.

**E2E (`tests/e2e/production.spec.ts`, chạy nối tiếp):**

- Global setup (một lần, giữ lại DB dev):
  - mã thành phẩm `E2E-SX-01` (nhóm Thiết bị, cái);
  - nguyên liệu `E2E-VT-02` (kg) giữ ≥ 50 kg ở `XUONG-01`;
  - định mức `E2E-SX-01` = 2 kg `E2E-VT-02`, công 1.000 ₫;
  - đặt Mã sắt vụn nếu chưa có;
  - hủy lệnh `LSX` chưa ghi sổ do `e2e.*` lập lần trước, trừ lệnh mẫu "tổ anh Lực".
- Không dùng `E2E-KHO-01/02` (đã có file khác đo song song).
- **Luồng:** Kế toán lập lệnh 2 `E2E-SX-01` → giao → Xưởng nhận và báo 2 cái, 4 kg, 0 kg đầu thừa (M10) → Thủ kho đếm → Kế toán ghi sổ.
  - Kiểm theo **chênh lệch**: `E2E-SX-01` Mới ở `BAI-01` +2, `E2E-VT-02` ở `XUONG-01` −4 kg.
- Thêm các test:
  - vượt định mức: báo 4,5 kg → Chờ Giám đốc duyệt → Giám đốc duyệt → ghi sổ;
  - trả lại xưởng;
  - 403 (Xưởng gọi ghi sổ, Kế toán gọi `/api/m/production`);
  - M10 không có khóa tiền.

**Ảnh mốc (chỉ CI):**

- D19 `GG-K17` của seed: ô giá BQ, thành tiền, tổng gắn `data-mask`. E2E không đụng `VT-*` (chỉ dùng `E2E-VT-01/02`), nhưng giá BQ đổi theo mọi phiếu nhập vật tư sau này, nên vẫn mask.
- D20 lệnh mẫu: ô tiền gắn `data-mask`.
- M10 lệnh mẫu không có tiền: không cần mask.
- Sidebar đổi 10 mục: mọi ảnh mốc desktop đổi. Gắn nhãn `update-snapshots`.
- Mã `E2E-SX-01`, `E2E-VT-02` mới có thể làm đổi ảnh mốc D9, D10, D1 (đếm mã, tồn). Khi apply kiểm các ảnh đó: đặt hai mã vào nhóm E2E sẵn có, hoặc lọc như các mã `E2E-*` khác đang lọc.

### D9. Dữ liệu

**`production_bom`:**

- `id`, `item_id` UNIQUE → `item` RESTRICT (thành phẩm).
- `labor_rate bigint not null ≥ 0`, `note`.
- `created_by/at`, `updated_by/at`.

**Danh sách D19:** chỉ hiện mã **đã có định mức**, xếp theo mã. Nút "+ Thêm định mức" chọn trong các mã Thiết bị đơn vị đếm chưa có định mức. Bản vẽ có dòng `CC-3M · chưa có định mức`: đó là trạng thái vừa chọn mã, chưa lưu, không phải một dòng thường trực. Cách này giữ danh sách gọn khi danh mục có hàng trăm mã (cả mã `E2E-*`).

**`production_bom_material`:**

- `id`, `bom_id` → `production_bom` ON DELETE CASCADE, `item_id` → `item` RESTRICT.
- `quantity_per_unit numeric(14,3) > 0`, `position`.
- UNIQUE(`bom_id`, `item_id`).
- Lưu định mức gửi kèm `updatedAt` của định mức, lệch thì 409 (hai người cùng sửa).
- Nhóm Vật tư, thành phẩm nhóm Thiết bị đơn vị đếm: service kiểm dưới `FOR SHARE` của vật tư (CHECK không đọc được bảng khác).

**`production_setting`** (một dòng, `id = 1` CHECK):

- `scrap_item_id` → `item` RESTRICT, null = chưa chọn.
- `updated_by/at`.
- Tách bảng nhỏ thay vì thêm cột vào `company_profile`: `company_profile` là thông tin in phiếu, quyền khác (`company.manage`).

**`production_order`:**

- `id`, `code` UNIQUE, `status` CHECK in (`DRAFT`, `ASSIGNED`, `IN_PROGRESS`, `AWAITING_CHECK`, `AWAITING_APPROVAL`, `COUNTED`, `POSTED`, `CANCELLED`).
- `workshop_id` → `location` (xưởng), `to_location_id` → `location` (bãi), service kiểm loại.
- `team`, `note`.
- Người / lúc: `assigned`, `received`, `reported`, `counted`, `approved` + `approve_note`, `returned` + `return_note`, `cancelled` + `cancel_reason`, `posted`.
- `scrap_item_id`, `scrap_price_used`, `posting_id`.
- `created_by/at`, `updated_at`.
- CHECK: `CANCELLED` ⇔ đủ lý do / người / lúc; `POSTED` ⇔ đủ người / lúc / `posting_id`.

**`production_order_line`:**

- `id`, `order_id` CASCADE, `position`, `item_id` RESTRICT.
- `quantity_planned numeric(14,3)`, CHECK `> 0 and quantity_planned = trunc(quantity_planned)`.
- `labor_rate bigint null` (chụp lúc giao).
- `reported_finished`, `reported_offcut_kg`, `quantity_finished`, `offcut_kg` (numeric, null khi chưa có).
- `labor_amount`, `material_amount`, `offcut_amount`, `finished_amount` (bigint, lúc ghi sổ).
- UNIQUE(`order_id`, `item_id`).

**`production_order_material`:**

- `id`, `line_id` CASCADE, `item_id` RESTRICT.
- `norm_per_unit numeric(14,3) null`: chụp lúc giao; null = xưởng thêm ngoài định mức.
- `reported_quantity`, `quantity` (Thủ kho đếm).
- `amount bigint null`: lúc ghi sổ, = − tổng dòng sổ của (dòng, nguyên liệu).
- UNIQUE(`line_id`, `item_id`).

**`production_order_submission`** (chỉ ghi thêm, thêm vào `APPEND_ONLY_TABLES`, trigger `production_order_submission_append_only`):

- `order_id`, `step` CHECK in (`RECEIVE`, `REPORT`, `COUNT`), `draft_id uuid` UNIQUE, `created_by/at`.

**Trigger:** `production_order_frozen` chặn UPDATE / DELETE lệnh, INSERT / UPDATE / DELETE dòng và nguyên liệu khi lệnh `POSTED` hoặc `CANCELLED`. Số cuối ghi trước khi đổi trạng thái, như lệnh sửa.

**Nhật ký:**

- Thêm loại chứng từ `PRODUCTION_ORDER`, `PRODUCTION_BOM` vào `DOCUMENT_TYPES` và CHECK `activity_log_document_type_check`.
- Mọi thao tác cần dùng đã có (`ASSIGN`, `RECALL`, `RECEIVE`, `REPORT`, `COUNT`, `RETURN`, `APPROVE`), không đổi `activity_log_action_check`.
- `actionLabel` (`src/domain/activity.ts`) thêm nhánh cho `PRODUCTION_ORDER`: `REPORT` → "Báo làm xong", `RETURN` → "Trả lại xưởng", `APPROVE` → "Duyệt vượt định mức". Không thì D18 hiện "Báo sửa xong", "Trả lại", "Duyệt".
- Tên hàm ghi dùng tiền tố `WRITE_NAME` đã bắt (`createBom`, `updateBom`, `deleteBom`, `setScrapItem`…, không dùng `save…`). Regex phủ thêm `^(assign|recall|receive|report|count|approve)ProductionOrder$`.

### D10. Thứ tự khóa và ghi sổ

- **Mọi bước:**
  1. Tìm `draftId` (bước điện thoại).
  2. `SELECT … FOR UPDATE` lệnh.
  3. `assertFresh(updatedAt)`, rồi `transition()`.
  4. Ghi, `logActivity`, đặt `updated_at = now()`.
- **Giao xưởng:** khóa lệnh, rồi `FOR SHARE` định mức của các mã (`production_bom` theo id tăng dần), chép định mức. Sửa định mức khóa `FOR UPDATE` định mức. Hai bên không chờ nhau vòng tròn vì giao không khóa gì sau định mức.
- **Ghi sổ:**
  1. Khóa lệnh.
  2. Đọc `production_setting` (`FOR SHARE`) lấy Mã sắt vụn, và `currentScrapPrice` (bảng chỉ ghi thêm, không khóa), khi lệnh có đầu thừa. Đổi Mã sắt vụn chỉ khóa `production_setting` `FOR UPDATE`, không khóa gì khác, nên không có vòng chờ khóa.
  3. `lockForPosting`:
     - `itemIds` = thành phẩm ∪ nguyên liệu ∪ Mã sắt vụn;
     - `locationIds` = [xưởng, bãi nhận];
     - `pairs` = (thành phẩm, NEW) ∪ (nguyên liệu, NEW | GOOD) ∪ (Mã sắt vụn, SCRAP).
  4. Đọc tồn nguyên liệu ở xưởng dưới khóa. Kiểm tổng cần cho cả lệnh bằng câu báo riêng của sản xuất ("VT-ONG27 ở XUONG-01 còn 900 kg, lệnh cần 977 kg"), rồi mới chia Mới trước rồi Tốt theo thứ tự dòng. `splitMaterialIssue` nhận câu báo làm tham số, để không lộ câu của lệnh sửa.
  5. Tính bằng hàm thuần `productionPostingLines` (`src/domain/production-order.ts`).
  6. `postMovements`.
  7. Cập nhật dòng, nguyên liệu, rồi trạng thái `POSTED`.

  Cùng thứ tự với `postMovements` và lệnh sửa, nên không deadlock với phiếu nhập, phiếu xuất.

### D11. API

**Desktop** (`withAuth`, gửi `updatedAt`):

- `GET /api/production/boms`; `GET`, `PUT`, `DELETE /api/production/boms/[itemCode]`.
- `GET`, `PUT /api/production/settings` (Mã sắt vụn).
- `GET /api/production/orders`, `POST /api/production/orders`.
- `GET`, `PATCH`, `DELETE /api/production/orders/[code]`.
- `POST /api/production/orders/[code]/assign | recall | return | approve | cancel | post`. `return`, `approve`, `cancel` có `note` / `reason`.

**Điện thoại** (không tiền):

- `GET /api/m/production`, `GET /api/m/production/[code]`, `GET /api/m/production/materials`.
- `POST /api/m/production/[code]/receive` `{ draftId, updatedAt }`.
- `POST /api/m/production/[code]/report` và `/count`, thân yêu cầu:

  ```
  { draftId, updatedAt,
    lines: [{ itemId, finished, offcutKg, materials: [{ itemId, quantity }] }] }
  ```

**Trang:**

- `/production` (danh sách), `/production/new`, `/production/[code]` (D20), `/production/boms` (D19).
- `/m/production`, `/m/production/[code]` (M10).

## Risks / Trade-offs

- **Sidebar 10 mục đổi mọi ảnh mốc desktop.** Cách xử lý: gắn `update-snapshots` một lần; trên màn 1280 sidebar vẫn đủ chỗ (đã đo cao 9 mục, còn trống).
- **Định mức `numeric(14,3)` không đủ lẻ cho vật nhỏ** (VD 0,0125 kg). Cách xử lý: bản vẽ chỉ cần 2 số lẻ; khi gặp thì đổi đơn vị (g) hoặc nới cột ở change sau.
- **Thiếu nguyên liệu lúc ghi sổ** (kiểm kê hoặc lệnh sửa khác vừa trừ). Cách xử lý: thông báo chỉ rõ mã, tồn, cần. Lệnh giữ Chờ ghi sổ, nhập thêm rồi ghi lại.
- **Xưởng làm vượt kế hoạch** (102 / 100). Cho phép, D20 hiện cả hai số. Công và nguyên liệu theo số đếm.
- **Mã sắt vụn đổi giữa chừng.** Lệnh chụp `scrap_item_id` lúc ghi sổ, nên số đã ghi không đổi.
- **Giá thành dự tính ở D19 khác giá thật.** Ghi rõ "chỉ để tham khảo" (bản vẽ đã có).

## Migration Plan

1. Migration SQL:
   - tạo 7 bảng, trigger khóa và trigger chỉ ghi thêm;
   - thay `inventory_ledger_movement_check`, `activity_log_document_type_check` (và `action_check` nếu thêm thao tác).
2. `src/db/grants.ts`: thêm `production_order_submission` vào `APPEND_ONLY_TABLES`. `db:migrate` tự cấp quyền.
3. **Dữ liệu cũ:** không có dòng sổ mới. D15 cũ không đổi. `inventory:check` không lệch.
4. **Deploy demo:** workflow chạy migration; `db:seed:demo` gọi `seedProduction`.
5. **Rollback:** chưa có lệnh ghi sổ thì xóa bảng được. Có rồi thì chỉ lùi code. CHECK loại biến động mới giữ lại, vì dòng sổ không xóa được.

## Open Questions

Không còn. Bốn câu hỏi lúc propose đã chốt (0.2 #152–#155).
