# Design: master-data

## Context

- Đã có: đăng nhập và bảng quyền (`openspec/specs/auth`, `src/domain/permissions.ts`), `requirePermission` cho trang, `withAuth` cho API, test quét `src/app/route-guards.test.ts`; tiền `Money` (số nguyên), số lượng `Quantity` (số nguyên phần nghìn + đơn vị `PIECE`/`KG`), `LOCATION_TYPES` (`YARD`, `WORKSHOP`, `SITE`), `DataTable`, `Stepper`, `QuantityInput`, Dialog/Sheet/AlertDialog của shadcn.
- Mục menu "Danh mục" (`/catalog`, quyền `catalog.view` cho Giám đốc, Kế toán, Kinh doanh) đang là trang giữ chỗ. Sidebar coi `/catalog/...` là mục đang chọn.
- Chưa có bảng nghiệp vụ nào. Sổ kho (`inventory-ledger`) là change kế tiếp và sẽ tham chiếu `item`, `location`.
- Quyết định đã chốt liên quan: 0.2 #2 (theo số lượng, QR theo mã hàng), #3 (trọng lượng chuẩn, phế liệu theo kg), #4/#4b (giá ngày, tháng = ngày × 30, bộ chỉ để báo giá), #5 (1 hợp đồng = 1 công trình), #18 (hạn thanh toán mặc định lấy từ nhà thầu), #20 (đền bù: hỏng sửa được / mất).
- Thiết kế: `docs/design/screens/D9-Items.dc.html`, `D16-Partners.dc.html`. Thiết kế D5 (hợp đồng) ghi "Giá thuê bằng giá mặc định trong danh mục" và có bảng đền bù "Mất / Hỏng, sửa được" — danh mục là nguồn gợi ý cho hợp đồng.

## Goals / Non-Goals

**Goals:**
- Bảng danh mục đủ cho Sổ kho, đơn mua, hợp đồng dùng ngay, có khóa ngoại chặn xóa bản ghi đã dùng.
- Mọi quy tắc (mã, quy đổi, giá bộ, ngừng dùng) là hàm thuần có unit test hoặc service có integration test.
- Quyền chặn ở server cho từng route; test 403 đủ vai trò.

**Non-Goals:** như mục "Ngoài phạm vi" của proposal (in QR, cột công nợ / hợp đồng ở D16, giá bán, nhập Excel, Mobile).

## Decisions

### D1. Mã hàng gõ tay, mã đối tác tự sinh (câu hỏi 1)

| Loại | Cách có mã | Dạng | Sửa được? |
|---|---|---|---|
| Vật tư, Bộ | **Người dùng gõ** | `^[A-Z0-9]+(-[A-Z0-9]+)*$`, 2–20 ký tự, tự đổi in hoa | **Không** |
| Bãi, xưởng | Người dùng gõ (Giám đốc) | như trên | Không |
| Nhà thầu | Tự sinh | `NT-0001` | Không |
| Nhà cung cấp | Tự sinh | `NCC-0001` | Không |
| Công trình (+ vị trí SITE) | Tự sinh | `CT-0001` | Không |

Lý do:
- Mã hàng **có nghĩa** với người ở bãi (`GG-K17` = giàn giáo khung 1,7m), in trên nhãn QR dán lên hàng; công ty đã quen gọi theo mã. Gõ tay giữ thói quen đó. Không cho sửa vì nhãn đã dán ngoài bãi sẽ sai; muốn đổi thì tạo mã mới và ngừng dùng mã cũ.
- Đối tác và công trình không ai gọi theo mã; tự sinh tránh trùng và đỡ một ô nhập. Dùng **sequence của Postgres** (`customer_code_seq`, `supplier_code_seq`, `site_code_seq`): an toàn khi hai người tạo cùng lúc, không dùng lại số đã cấp. Hiển thị 4 chữ số, quá 9999 thì tự dài thêm (`NT-10000`).
- Vật tư và bộ **chung một không gian mã** (báo giá gõ mã nào cũng ra đúng một thứ). Hai bảng riêng, mỗi bảng có `UNIQUE(code)`; service kiểm tra bảng còn lại trong cùng transaction, giữ khóa `pg_advisory_xact_lock(hashtext('catalog-code'))` để hai yêu cầu cùng lúc không lọt.
- Đã cân nhắc: tự sinh mã hàng theo nhóm (`GG-001`) — mất nghĩa, người ở bãi không nhớ; cho sửa mã khi chưa dùng — phải định nghĩa "đã dùng" gồm cả nhãn đã in, không kiểm được.

### D2. Bộ (kit) (câu hỏi 2)

- Bảng `kit` (mã, tên, trạng thái) + `kit_component` (kit_id, item_id, quantity integer ≥ 1, `UNIQUE(kit_id, item_id)`).
- **Không lồng bộ trong bộ**: linh kiện chỉ là `item`. Lý do: bộ chỉ để báo giá (0.2 #4b); lồng bộ làm phức tạp việc rã bộ ở `deliveries` mà không ai cần.
- Linh kiện phải là vật tư **tính theo cái, đang dùng**; tổng số lượng ≥ 2 (1 cái thì không phải bộ).
- **Trọng lượng và giá thuê 1 bộ tính khi đọc**, không lưu: tổng (số lượng × trọng lượng chuẩn), tổng (số lượng × giá ngày). Lý do: luôn khớp giá linh kiện hiện tại; tồn kho và tiền thuê vẫn theo linh kiện. Hàm thuần `kitTotals(components)` trong `src/domain/kit.ts`, trả `rentalPerDay: null` nếu có linh kiện không cho thuê.
- Sửa bộ = thay toàn bộ danh sách linh kiện trong một transaction.

### D3. Giá thuê nhập theo ngày (câu hỏi 3)

- Lưu `daily_rental_price bigint NULL` (NULL = không cho thuê). Form chỉ có ô **giá ngày**; giá tháng hiện ngay bên cạnh = ngày × 30 (như dòng ghi chú trên D9).
- Lý do: tiền là số nguyên VND. Nếu nhập giá tháng rồi chia 30, giá tháng không chia hết (35.000 ÷ 30 = 1.166,67) sẽ lệch. Nhập ngày thì giá tháng luôn đúng bằng ngày × 30 theo 0.2 #4. Hợp đồng sau này có thể cho nhập theo tháng và tự kiểm chia hết.
- Vật tư tính theo kg không có giá thuê (CHECK trong DB).

### D4. Giá đền bù mặc định ở danh mục (câu hỏi 4)

- Có. Hai cột `lost_price`, `damage_price` (`bigint NULL`, ≥ 0), mỗi đơn vị của vật tư. Hợp đồng (`contracts`) điền sẵn bảng đền bù từ đây; giá trong hợp đồng mới là giá áp dụng (0.2 #20: phế liệu tính giá mất).
- Lý do: thiết kế D5 đã dựa vào việc này; Kinh doanh không phải gõ lại giá cho từng hợp đồng.

### D5. Nhà cung cấp cá nhân (câu hỏi 5)

- Bảng `supplier`: `kind` (`COMPANY`/`PERSON`), `name` (bắt buộc), `phone`, `address`, `tax_code` (công ty), `id_number` (CCCD, 12 chữ số, cá nhân), `bank_account`, `bank_name`, `note`.
- Người bán sắt vụn chỉ cần **tên** là tạo được (thường mua tại chỗ, không có giấy tờ). CCCD, tài khoản để tùy chọn: dùng khi trả tiền chuyển khoản hoặc cần đối chiếu sau này (`payables` Bản 2).
- Đã cân nhắc: bắt buộc CCCD cho cá nhân — làm chậm việc mua tại bãi, nhiều người không mang theo.
- **CCCD là dữ liệu cá nhân** (bổ sung sau review PR #28): danh sách và màn chi tiết D16 chỉ hiện **4 số cuối** dạng `•••• •••• 0123` (hàm `maskIdNumber`). `GET /api/catalog/suppliers` (quyền `catalog.read`, cả 5 vai trò) chỉ trả `idNumberMasked`, **không bao giờ** trả số đầy đủ. Số đầy đủ chỉ có ở `GET /api/catalog/suppliers/[id]/edit` (quyền `partners.manage`), dùng để điền form sửa. Không ghi CCCD vào log.

### D6. Công trình và vị trí SITE (câu hỏi 6)

- Bảng `site`: `code` (tự sinh), `name`, `address`, `customer_id` (NOT NULL, RESTRICT, **không đổi được**), `location_id` (NOT NULL, UNIQUE, RESTRICT), `status`.
- **Tạo công trình tự tạo vị trí `SITE`** trong cùng transaction (mã = mã công trình, tên = tên công trình). Đổi tên công trình đổi tên vị trí; ngừng dùng / dùng lại / xóa đi cùng nhau.
- Lý do: Sổ kho ghi "hàng đang ở đâu" theo `location`; mỗi công trình cần đúng một vị trí. Tạo tự động bỏ một bước dễ quên và giữ quan hệ 1–1.
- Không đổi nhà thầu: theo 0.2 #5, công trình của chủ khác là công trình khác.

### D7. Ngừng dùng thay vì xóa (câu hỏi 7)

- Mọi bảng danh mục có `status` (`ACTIVE`/`ARCHIVED`, CHECK) và `archived_at`.
- **Xóa** chỉ thành công khi không bản ghi nào tham chiếu: mọi khóa ngoại tới danh mục là `ON DELETE RESTRICT`; service bắt lỗi `23503` → 409 "… đã được dùng nên chỉ ngừng dùng được". Sổ kho, hợp đồng sau này chỉ cần khai báo khóa ngoại RESTRICT là được bảo vệ.
- **Ngừng dùng** có điều kiện để không làm hỏng dữ liệu đang dùng:
  - Vật tư đang ở trong bộ đang dùng → từ chối (bộ sẽ báo giá sai).
  - Nhà thầu còn công trình đang dùng → từ chối.
  - Bãi đang dùng cuối cùng → từ chối.
- **Dùng lại**: công trình chỉ dùng lại được khi nhà thầu đang dùng.
- Chọn ở chứng từ mới chỉ lấy `ACTIVE`; đọc chứng từ cũ vẫn ra tên của bản ghi đã ngừng dùng.
- Sau này khi Sổ kho có số dư: ngừng dùng vật tư còn tồn sẽ được `inventory-ledger` chặn thêm (ghi chú cho change đó, không làm ở đây).

### D8. Nhãn QR (câu hỏi 8)

- **Làm ở `goods-receipt`**, cùng màn quét M2 và phiếu nhập (thủ kho in nhãn khi nhập hàng mới về). Change này chỉ chốt: **nội dung QR = mã hàng** (chuỗi `GG-K17`, không kèm URL), nên mã chỉ gồm ký tự an toàn cho QR và nhãn (D1).
- Lý do: in nhãn cần máy in, khổ nhãn, luồng ở bãi — thuộc việc của thủ kho; tách ra giữ change này gọn.

### D9. Quyền (câu hỏi 9)

Thêm vào `src/domain/permissions.ts`:

| Quyền | Vai trò | Dùng cho |
|---|---|---|
| `catalog.view` (đã có) | Giám đốc, Kế toán, Kinh doanh | Trang `/catalog/*` |
| `catalog.read` | cả 5 vai trò | `GET /api/catalog/*` (thủ kho cần ở `goods-receipt`) |
| `items.manage` | Giám đốc, Kinh doanh | Ghi vật tư, bộ, nhóm |
| `partners.manage` | Giám đốc, Kinh doanh, Kế toán | Ghi nhà thầu, nhà cung cấp, công trình |
| `locations.manage` | Giám đốc | Ghi bãi, xưởng |

Lý do: Kinh doanh lập đơn mua, báo giá, hợp đồng nên giữ danh mục hàng; Kế toán cần sửa MST, địa chỉ, hạn thanh toán của nhà thầu (công nợ, xuất Excel) nhưng không đổi giá hàng; bãi/xưởng hiếm khi đổi và ảnh hưởng toàn bộ kho nên để Giám đốc. Trang kiểm `catalog.view`; nút thêm/sửa chỉ hiện khi `can(role, …manage)`, nhưng chặn thật ở `withAuth({ permission })` của từng route ghi.

### D10. Bảng dữ liệu (migration `drizzle/0002_master_data.sql`)

| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `item_group` | `id uuid`, `name`, `name_key` (không dấu, thường), `sort_order int`, `status`, timestamps, `created_by` | `UNIQUE(name_key)` |
| `item` | `id`, `code`, `name`, `group_id`, `unit` (`PIECE`/`KG`), `standard_weight_kg numeric(10,3)`, `daily_rental_price bigint`, `lost_price bigint`, `damage_price bigint`, `search_text`, `status`, `archived_at`, timestamps, `created_by`, `updated_by` | `UNIQUE(code)`; FK group RESTRICT; CHECK `(unit='PIECE' AND standard_weight_kg > 0) OR (unit='KG' AND standard_weight_kg IS NULL)`; CHECK `unit='PIECE' OR daily_rental_price IS NULL`; CHECK giá ≥ 0; CHECK mã khớp regex |
| `kit` | `id`, `code`, `name`, `search_text`, `status`, … | `UNIQUE(code)`, CHECK mã |
| `kit_component` | `kit_id`, `item_id`, `quantity int` | PK `(kit_id, item_id)`; FK kit CASCADE; FK item RESTRICT; CHECK `quantity >= 1` |
| `customer` | `id`, `code`, `kind`, `name`, `tax_code`, `contact_name`, `phone`, `address`, `payment_terms_days int DEFAULT 30`, `note`, `search_text`, `status`, … | `UNIQUE(code)`; CHECK `payment_terms_days BETWEEN 0 AND 365`; CHECK `kind` |
| `supplier` | `id`, `code`, `kind`, `name`, `phone`, `address`, `tax_code`, `id_number`, `bank_account`, `bank_name`, `note`, `search_text`, `status`, … | `UNIQUE(code)` |
| `location` | `id`, `code`, `name`, `type` (`YARD`/`WORKSHOP`/`SITE`), `status`, … | `UNIQUE(code)`; CHECK `type` |
| `site` | `id`, `code`, `name`, `address`, `customer_id`, `location_id`, `search_text`, `status`, … | `UNIQUE(code)`, `UNIQUE(location_id)`; FK RESTRICT |

- Khóa chính `uuid` (`gen_random_uuid()`), mã nghiệp vụ là cột riêng. `created_by`/`updated_by` FK tới `user` (RESTRICT; tài khoản không bao giờ bị xóa).
- `search_text`: tên + mã (+ điện thoại, MST với đối tác) đã bỏ dấu, chữ thường, do service tính khi ghi (hàm `toSearchText` trong `src/domain/search-text.ts`, đổi `đ` → `d`). Tìm bằng `ILIKE` trên cột này, không cần extension `unaccent`. ~vài trăm dòng nên không cần index đặc biệt.
- Sequence `customer_code_seq`, `supplier_code_seq`, `site_code_seq`.
- Migration chèn `BAI-01` "Bãi chính" (`YARD`) và `XUONG-01` "Xưởng" (`WORKSHOP`), `created_by` NULL (dữ liệu hệ thống) — `created_by` cho phép NULL.
- **Không có dữ liệu cũ**: chưa có bảng nghiệp vụ, không ảnh hưởng số liệu.

### D11. Logic thuần (`src/domain/`)

- `item-code.ts`: `normalizeCatalogCode`, `isValidCatalogCode`.
- `weight-conversion.ts`: `piecesToKg(pieces: Quantity /*PIECE*/, weightKg: Quantity /*KG*/): Quantity /*KG*/` = `pieces.milli/1000 × weight.milli` (số nguyên phần nghìn kg, chính xác); `kgToPieces(kg, weightKg): Quantity /*PIECE*/` = làm tròn `kg.milli / weight.milli` tới số nguyên gần nhất, 0,5 lên (tính bằng số nguyên: `(2·kg + w) div (2·w)`). Lỗi rõ khi trọng lượng ≤ 0 hoặc sai đơn vị.
  - **Phế liệu theo cái** (chốt 27/10/2026, 0.2 #3): hàng tình trạng `SCRAP` của mã tính theo cái vẫn đếm theo cái trong chính mã đó; màn hình hiện thêm số kg = `piecesToKg(số cái, trọng lượng chuẩn)`. Mã tính theo kg (như `PL-SAT`) chỉ dùng cho sắt vụn mua về. **Bán phế liệu theo kg** (quy đổi khi xuất bán, giá vốn theo kg) sẽ chốt ở `inventory-ledger`.
- `kit.ts`: `validateKitComponents`, `kitTotals`.
- `partner-fields.ts`: `normalizePhone`, `formatPhone`, `isValidTaxCode`, `isValidIdNumber`, `maskIdNumber`.
- `search-text.ts`: `toSearchText`.
- `catalog-code-sequence.ts`: `formatSequenceCode(prefix, n)` → `NT-0001`.

### D12. Service và API

Logic ghi ở `src/lib/catalog/*.ts` (nhận `db`, `actor`), mỗi lệnh một transaction; route handler chỉ đọc input (zod, thông báo tiếng Việt) → gọi service → `respond()`. Envelope và mã lỗi như `auth-and-roles`: 400 sai dữ liệu, 401, 403, 404, 409 xung đột (trùng mã, đã dùng, điều kiện ngừng dùng).

| Route | Quyền | Ghi chú |
|---|---|---|
| `GET /api/catalog/items?q&group&status` | `catalog.read` | `{ items, counts: { activeItems, activeKits, byGroup } }` |
| `POST /api/catalog/items` · `PATCH/DELETE /api/catalog/items/[id]` | `items.manage` | PATCH sửa tên, nhóm, trọng lượng, giá, `status`; gửi `code` hay `unit` khác → 400 |
| `GET/POST /api/catalog/kits` · `PATCH/DELETE …/[id]` | đọc `catalog.read`, ghi `items.manage` | PATCH thay toàn bộ `components` |
| `GET/POST /api/catalog/item-groups` · `PATCH/DELETE …/[id]` | như trên | |
| `GET/POST /api/catalog/customers` · `PATCH/DELETE …/[id]` | đọc `catalog.read`, ghi `partners.manage` | GET kèm số công trình đang dùng |
| `GET/POST /api/catalog/suppliers` · `PATCH/DELETE …/[id]` | như trên | GET chỉ có CCCD đã che (D5) |
| `GET /api/catalog/suppliers/[id]/edit` | `partners.manage` | Dữ liệu form sửa, kèm CCCD đầy đủ (D5) |
| `GET/POST /api/catalog/sites` · `PATCH/DELETE …/[id]` | như trên | POST tạo cả vị trí `SITE` |
| `GET/POST /api/catalog/locations` · `PATCH/DELETE …/[id]` | đọc `catalog.read`, ghi `locations.manage` | Không tạo/sửa loại `SITE` ở đây |

Ngừng dùng / dùng lại = `PATCH { status: "ARCHIVED" | "ACTIVE" }`, để một route giữ mọi quy tắc trạng thái. Mọi route bọc `withAuth`; test quét hiện có tự kiểm.

### D13. Giao diện

- `/catalog` chuyển sang `/catalog/items`. Đầu D9 và D16 có hai liên kết "Vật tư" / "Đối tác & công trình" để qua lại.
- **D9** (`/catalog/items`, `/catalog/kits`, `/catalog/groups`): tab "Vật tư · 48 / Bộ · 6 / Nhóm hàng · 5" như thiết kế; bảng `DataTable`; ô tìm và chọn nhóm cập nhật URL (`?q=`, `?group=`, `?status=archived`); chọn dòng (`?item=<code>`) hiện khung "Thuộc bộ" bên phải (màn hẹp xuống dưới bảng, như D17). "Thêm vật tư" / "Sửa" mở `Sheet` bên phải với form; trọng lượng dùng `QuantityInput` đơn vị kg; giá dùng ô tiền, giá tháng hiện ngay bên dưới. Trình sửa bộ: Dialog, mỗi dòng chọn vật tư (danh sách lọc) + `Stepper` số lượng, hiện tổng trọng lượng và giá thuê ngay khi sửa.
- **D16** (`/catalog/partners?tab=customers|suppliers|sites|locations&id=…`): danh sách bên trái, chi tiết bên phải như thiết kế; "Sửa thông tin" mở Sheet; chi tiết nhà thầu có danh sách công trình và nút "Thêm công trình". Cột công nợ, hợp đồng: không hiện ở change này (Ngoài phạm vi).
- Vai trò chỉ xem (Kế toán ở D9; Kế toán/Kinh doanh ở tab bãi xưởng) không thấy nút ghi.
- Xóa / ngừng dùng có hộp xác nhận; lỗi 409 hiện bằng chữ của server.
- Trang dùng `requirePermission("catalog.view")`; nằm trong layout `(desktop)` đã có `instant = false`.

## Risks / Trade-offs

- **Mã không đổi được** → gõ sai thì phải tạo mã mới và xóa/ngừng dùng mã sai. Giảm rủi ro: form hiện "Mã không đổi được sau khi lưu" và xem trước mã in hoa.
- **Vật tư và bộ chung không gian mã nhưng hai bảng** → dựa vào kiểm tra ở service + advisory lock, không phải ràng buộc DB. Có integration test tạo đồng thời.
- **Tìm kiếm bằng ILIKE trên `search_text`** → đủ cho vài trăm dòng; nếu danh mục lên hàng chục nghìn thì thêm index trigram sau.
- **Giá bộ tính khi đọc** → đổi giá linh kiện làm đổi giá bộ ngay; báo giá cũ đã lưu ở hợp đồng không bị ảnh hưởng vì hợp đồng lưu giá riêng.
- **Ảnh mốc**: thêm D9, D16 vào `tests/e2e/visual.spec.ts` → chạy workflow cập nhật ảnh mốc.

## Migration Plan

1. `npm run db:migrate` thêm 8 bảng, 3 sequence, 2 vị trí mặc định. Chỉ thêm, không sửa bảng cũ.
2. `npm run db:seed:dev` thêm danh mục mẫu cho dev (8 vật tư, 1 bộ, 4 nhóm, 2 nhà thầu, 2 nhà cung cấp, 2 công trình) như số liệu trong thiết kế.
3. Quay lui: `DROP` các bảng mới (chưa bảng nào khác tham chiếu).

## Open Questions

Không còn câu hỏi chặn. Các đề xuất trên (đặc biệt D1 mã không đổi, D9 quyền của Kế toán) cần người dùng xác nhận khi duyệt.
