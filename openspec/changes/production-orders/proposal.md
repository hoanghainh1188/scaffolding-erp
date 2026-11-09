# Proposal: Sản xuất thành phẩm từ nguyên liệu (`production-orders`)

## Why

Xưởng không chỉ sửa hàng cũ mà còn **làm hàng mới** (khung, chéo, mâm…) từ ống thép, que hàn, sơn (ghi âm 28/10, #44 Q11). Hiện phần mềm không có chỗ ghi việc này. Thành phẩm muốn có tồn thì phải lập phiếu điều chỉnh. Giá vốn lại gõ tay, không biết xưởng dùng vượt định mức bao nhiêu.

Chủ đã chốt cách làm (0.2 #139–#146, 09/11/2026), thiết kế D19, D20, M10 đã duyệt. Luồng lệnh sửa (`repair-work-orders`) đã chạy, nên làm được ngay.

## What Changes

**[MVP]**, màn **D19** Định mức sản xuất, **D20** Lệnh sản xuất, **M10** Sản xuất tại xưởng.

- **Định mức (D19):**
  - Mỗi thành phẩm (mã nhóm Thiết bị, đơn vị đếm) có một định mức: danh sách nguyên liệu (mã nhóm Vật tư) với số / 1 cái, và đơn giá công / cái.
  - Chỉ Giám đốc, Kế toán sửa. Mọi lần sửa ghi nhật ký.
  - Giá thành dự tính theo giá BQ hôm nay, chỉ để tham khảo.
- **Lệnh sản xuất (D20):**
  - Mã `LSX-YYYY-NNN`. Một lệnh có nhiều dòng thành phẩm, một xưởng, một bãi nhận thành phẩm.
  - Luồng giống lệnh sửa:
    - Nháp → Giao xưởng (chụp định mức và đơn giá công) → Xưởng nhận → Báo làm xong → Thủ kho đếm.
    - Nếu vượt định mức > 5 %: thêm bước **Giám đốc duyệt**. Sau đó Kế toán ghi sổ.
    - Có thu hồi, trả lại xưởng sửa số, hủy.
- **Điện thoại (M10):**
  - Xưởng ghi số làm xong, nguyên liệu thực dùng (điền sẵn theo định mức) và đầu thừa (kg).
  - Thủ kho dùng cùng màn để đếm.
  - Không thấy giá. Số nằm trong nháp trên máy, chỉ lên server khi bấm "Báo làm xong" hoặc "Đếm xong".
- **Ghi sổ (một transaction):**
  - Nguyên liệu xuất ở xưởng theo giá BQ, Mới trước rồi Tốt.
  - Thành phẩm nhập **Mới** ở bãi trên lệnh.
  - Đầu thừa nhập **Phế liệu** của mã chung "Sắt vụn" ở cùng bãi, theo giá sắt vụn.
  - Giá trị dòng = nguyên liệu + công − đầu thừa.
  - Hai loại dòng sổ mới: `PRODUCTION_OUT`, `PRODUCTION_IN`. `PRODUCTION_IN` làm đổi giá BQ.
- **Cài đặt:** trang Giá sắt vụn thêm ô **Mã sắt vụn** (một mã kg, nhóm Vật tư) để nhận đầu thừa (0.2 #155).
- **Menu:** thêm mục **Sản xuất**, sidebar thành 10 mục (0.2 #153). Việc hôm nay trên điện thoại thêm khối Sản xuất.
- **D15:** công khoán sản xuất là chi phí ngoài sổ, nên đẳng thức đối chiếu cộng bù công. Nguyên liệu không bị trừ hai lần, đầu thừa không thành lãi. Dưới bảng ghi thêm "Công sản xuất đã chi trong kỳ".

### Ngoài phạm vi

- Mẫu in "Phiếu giao việc xưởng" A5 (0.2 #154). Xưởng dùng M10.
- Ghi nguyên liệu hỏng khi cả mẻ hỏng thành lỗ sản xuất (0.2 #155). Dòng làm xong 0 cái không ghi sổ được. Nguyên liệu hỏng thì lập phiếu điều chỉnh `ĐC`.
- Định mức có tỷ lệ hao hụt dự kiến riêng. Ngưỡng vượt chỉ là 5 % chung (0.2 #140).
- Nhiều phiên bản định mức theo ngày. Lệnh chụp định mức lúc giao là đủ (0.2 #145).
- Chi phí khác ngoài công (điện, khí hàn tính chung). Chỉ có nguyên liệu và công khoán.
- Lập lệnh sản xuất tự động khi thiếu hàng cho thuê.

### Ảnh hưởng tới số liệu đã có

- Không đổi dòng sổ cũ. Không chuyển dữ liệu.
- `npm run inventory:check` không lệch: dòng `PRODUCTION_IN` ghi đúng tổng giá trị như các dòng nhập đổi giá khác.
- D15 các tháng cũ không đổi, vì chưa có lệnh sản xuất nào. Từ khi có lệnh, hàng cho thuê bình quân tăng theo thành phẩm Mới nhập kho, đúng nghĩa.

## Capabilities

### New Capabilities

- `production-boms`: định mức sản xuất (D19), quyền sửa, giá thành dự tính, mã sắt vụn nhận đầu thừa.
- `production-orders`: lệnh sản xuất (D20). Gồm trạng thái, chụp định mức, vượt định mức và Giám đốc duyệt, ghi sổ, giá trị thành phẩm, khóa và 409.
- `production-mobile`: màn M10 cho Xưởng và Thủ kho, API `/api/m/production` không có tiền, nháp và `draftId`.

### Modified Capabilities

- `inventory-ledger`: thêm loại biến động `PRODUCTION_OUT` / `PRODUCTION_IN`; `PRODUCTION_IN` làm đổi giá vốn.
- `gross-profit`: đẳng thức đối chiếu cộng bù công sản xuất; sản xuất không là giá vốn.
- `app-shell`: sidebar 10 mục, thêm Sản xuất; lọc theo vai trò.
- `mobile-home`: khối Sản xuất trên Việc hôm nay.
- `activity-log`: thao tác trên định mức và lệnh sản xuất được ghi.

## Impact

- **DB** (migration mới):
  - Bảng `production_bom`, `production_bom_material`, `production_setting`, `production_order`, `production_order_line`, `production_order_material`, `production_order_submission` (chỉ ghi thêm).
  - CHECK loại biến động của `inventory_ledger`.
  - CHECK loại chứng từ và thao tác của `activity_log`.
- **Code mới:** `src/domain/production-order.ts`, `src/domain/production-bom.ts`, `src/lib/production/`, trang `/production`, `/production/boms`, `/m/production`.
- **Dùng lại từ lệnh sửa:**
  - `splitMaterialIssue`, `issueAmount`, `laborAmount`.
  - `lockForPosting`, `postMovements`, `currentScrapPrice`, `nextDocumentCode`.
  - Nháp IndexedDB và outbox.
  - Khung trang M8.
- **Sửa:**
  - `src/domain/movement.ts` (loại biến động, `changesAverage`).
  - `src/domain/gross-profit.ts`, `src/lib/reports/costs.ts`.
  - `src/domain/permissions.ts` (5 quyền mới), `src/lib/navigation.ts`, trang M1, trang Giá sắt vụn.
  - `APPEND_ONLY_TABLES`.
- **Seed và E2E:**
  - Seed dev và demo có định mức `GG-K17`, `GG-CH`, mã nguyên liệu, mã sắt vụn và một lệnh mẫu như D20.
  - E2E dùng mã riêng, kiểm theo chênh lệch.
  - Ảnh mốc D19, D20, M10.
- **Không thêm thư viện.**
