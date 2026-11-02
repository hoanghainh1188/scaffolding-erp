# Design: catalog-extensions (09)

## Context

Lý do: xem `proposal.md` mục Why. Yêu cầu: các spec delta trong `specs/`.

Hiện trạng code cần biết:

- **Luật mã** nằm ở `src/domain/item-code.ts` (`^[A-Z0-9]+(?:-[A-Z0-9]+)*$`, 2–20 ký tự) và được lặp lại trong CHECK `item_code_check`, `kit_code_check` (`src/db/schema/catalog.ts`). Cùng một hàm `parseCatalogCode` dùng cho vật tư, bộ **và** bãi/xưởng (`src/lib/catalog/places.ts`). `src/domain/qr-payload.ts` và `src/app/api/stock/lookup/route.ts` dùng `isValidCatalogCode` để loại nội dung lạ trước khi tra DB.
- **Đơn vị** chỉ có `PIECE` / `KG`: CHECK `item_unit_check`, `item_weight_check` (cái phải có trọng lượng, kg không có), `item_rental_unit_check` (chỉ cái có giá thuê), `purchase_order_line_unit_check`. `src/domain/quantity.ts` (`QUANTITY_UNITS`, `toQuantity` bắt số nguyên cho `PIECE`). Khoảng 40 file rẽ nhánh `"PIECE"` / `"KG"` (đơn mua, phiếu nhập, sửa chữa, kiểm kê, thẻ kho, điều chỉnh, landed cost). Ý nghĩa thật của các nhánh đó là một trong hai câu: *số lượng có phải số nguyên không* và *mã có trọng lượng chuẩn để quy ra kg không*.
- **Nhóm hàng** `item_group` (tên, `name_key`, thứ tự). Chưa có phân loại.
- **Tìm kiếm** dùng cột `search_text` (tên + mã, bỏ dấu, chữ thường; `src/domain/search-text.ts`) và `ilike`.
- **Công trình** `site` có `address` tự do. **Nhà thầu** `customer` chưa có người phụ trách. `user.role` một vai trò mỗi tài khoản.
- Quyền: `catalog.read` (mọi vai trò), `items.manage` (Giám đốc, Kinh doanh), `partners.manage` (Giám đốc, Kinh doanh, Kế toán), `locations.manage` (Giám đốc).

## Goals / Non-Goals

**Goals:**

- Danh mục chứa được nguyên văn 142 mã thật và đơn vị thật trong file kế toán, để #48 nhập dữ liệu không phải đổi mã.
- Không đổi hành vi với mã `cái` / `kg` đang có; không đụng Sổ kho, giá BQ.
- Một chỗ duy nhất trả lời "đơn vị này đếm hay đo, có trọng lượng không" để các phân hệ sau (hợp đồng, xuất, thu hồi) không thêm nhánh `"PIECE"` mới.

**Non-Goals:**

- Đổi đơn vị hoặc mã của vật tư đã tạo.
- Đặt quyền xem theo người phụ trách hay theo hàng thuê/bán (#9).
- Quản lý 11 khu vực lưu trữ KV 1–11 (thuộc `stocktake` / `truck-management`).
- Tự động gợi ý tỉnh từ địa chỉ gõ tự do.

## Decisions

### D1. Mã cũ: nới luật mã **và** thêm mã cũ để tìm (điểm 1 của issue, Q9)

**Quyết định:**

1. **Nới luật mã** cho vật tư và bộ theo 0.2 #37. Mã gồm các "khối" chữ in hoa (Unicode, có dấu tiếng Việt như `Ố`, `Đ`) hoặc số, nối bằng **đúng một** ký tự trong `,` `*` `+` `-` hoặc khoảng trắng. 2–30 ký tự. Chuẩn hóa khi nhận: `trim`, gộp nhiều khoảng trắng thành một, `normalize("NFC")`, `toUpperCase("vi")`.
   - Regex (JS, cờ `u`): `^[\p{Lu}\p{N}]+(?:[,*+\- ][\p{Lu}\p{N}]+)*$`. Chữ thường đã đổi hoa trước khi kiểm.
   - **Khóa so trùng** `code_key` = mã bỏ dấu (`Đ`→`D`), bỏ khoảng trắng, chữ thường: `NỐI 34` → `noi34`. Ràng buộc duy nhất đặt trên `code_key`, không trên mã, để `NOI34` không lọt khi đã có `NỐI 34`.
   - Hàm mới `parseItemCode` / `itemCodeKey` trong `src/domain/item-code.ts`. `parseCatalogCode` cũ giữ nguyên, đổi tên thành `parsePlaceCode`, chỉ dùng cho bãi/xưởng.
   - 30 ký tự thay vì 20: mã thật dài nhất trong file là ~10 ký tự, nhưng mã ghép kiểu `KB+KU34` có thể dài hơn khi ghép ba thành phần; 30 vẫn vừa nhãn QR.
2. **Mã cũ (alias)**: bảng mới `item_alias`, tối đa 5 mã cũ / vật tư, **sửa được**. Lý do vẫn cần dù đã nới luật:
   - Vật tư đã tạo trên DB demo/dev bằng mã kiểu mới (`GG-K17`) không đổi mã được; mã cũ nối chúng với mã kế toán đang gọi.
   - File kế toán có hai sheet gọi cùng hàng khác nhau (11 mã có ở bảng khối lượng nhưng không có trong danh mục). #48 cần một chỗ map tên cũ → vật tư.
   - Spec bắt buộc "tìm được hàng bằng mã cũ".

**Không gian mã chung:** mã vật tư, mã bộ và mã cũ chung một không gian `code_key`. Kiểm bằng:
- `item.code_key` UNIQUE, `kit.code_key` UNIQUE, `item_alias.code_key` UNIQUE;
- service kiểm chéo ba bảng trong transaction (khóa `FOR UPDATE` dòng vật tư đang sửa) trước khi ghi; lỗi trùng duy nhất từ DB (23505) do chạy đồng thời được trả thành thông báo như spec.

**Tra theo mã** (`GET /api/stock/lookup?code=`, M2, ô thêm dòng trên phiếu): chuẩn hóa → tìm `item.code` khớp đúng → nếu không có, tìm theo `code_key` ở `item` rồi ở `item_alias`. Mã chính luôn thắng mã cũ.

**Phương án đã cân nhắc:**

| Phương án | Bỏ vì |
|---|---|
| Chỉ thêm mã cũ, giữ luật mã cũ (`H1-7` làm mã chính) | Chủ đã chốt giữ mã thật (0.2 #37); nhãn, phiếu in, lời nói hằng ngày dùng `H1,7`. |
| Chỉ nới luật mã, không có mã cũ | Vật tư đã tạo không đổi được mã; không có chỗ cho tên gọi thứ hai khi chuyển dữ liệu. |
| Mã cũ là cột `text[]` trên `item` | Không đặt được UNIQUE giữa các vật tư; tìm theo phần tử mảng kém. |
| So trùng trên mã nguyên văn (không `code_key`) | `NỐI 34` / `NOI 34` / `NOI34` thành ba mã khác nhau, quét và gõ nhầm sang hàng khác. |
| Cho cả bãi/xưởng dùng luật mới | Không có nhu cầu từ dữ liệu thật; mã vị trí nằm trong URL và chứng từ, giữ đơn giản. |

**DB:** CHECK `item_code_check` / `kit_code_check` đổi thành: `char_length(code) between 2 and 30 and code = upper(code) and code = btrim(code) and code !~ '[,*+ -]{2}' and code !~ '^[,*+ -]|[,*+ -]$'`. CHECK chỉ là lớp chặn thứ hai; luật đầy đủ (chỉ chữ/số Unicode) nằm ở domain vì lớp ký tự `[:upper:]` của Postgres phụ thuộc collation của DB (local, CI, Neon có thể khác). `code_key` là **cột sinh tự động** (`generated always as (lower(translate(code, '<chữ in hoa có dấu và khoảng trắng>', '<chữ không dấu>'))) stored`): DB tự tính cho dòng cũ và mọi dòng mới, không chỗ ghi nào quên được. Mã đã in hoa nên `translate` chỉ cần chữ in hoa và `lower` chỉ gặp chữ ASCII, không phụ thuộc collation. `itemCodeKey` ở domain dùng cùng quy tắc để so trước khi ghi. (Đổi khi apply: bản propose định điền bằng `UPDATE` trong migration.)

> Ghi chú: `code_key` **giữ** các dấu `,` `*` `+` `-`, chỉ bỏ dấu tiếng Việt và khoảng trắng. `H1,7` và `H17` là hai mã khác nhau.

**Đường dẫn và URL:** mã chứa `+`, `,`, khoảng trắng, chữ có dấu. Mọi chỗ dựng URL có mã (`/inventory/items/[code]`, `?code=` của QR, `?q=` của D9) dùng `encodeURIComponent`; trang `[code]` đọc `decodeURIComponent(params.code)`. `itemCodeFromQr` đọc `searchParams.get("code")` (đã giải mã `%2B` đúng); nhãn in mới in mã trần, không in dạng URL. Có test riêng cho `KB+KU34` và `NỐI 34`.

### D2. Đơn vị mới và cho thuê theo kg / mét (điểm 2, Q3)

**Quyết định:** cột `item.unit` nhận 9 giá trị, chia hai loại:

| Mã | Nhãn | Loại | Trọng lượng chuẩn |
|---|---|---|---|
| `PIECE` | cái | đếm | bắt buộc |
| `BAR` | cây | đếm | bắt buộc |
| `BUNDLE` | bó | đếm | bắt buộc |
| `BASKET` | sọt | đếm | bắt buộc |
| `ROLL` | cuộn | đếm | bắt buộc |
| `BOX` | hộp | đếm | bắt buộc |
| `CARTON` | thùng | đếm | bắt buộc |
| `METER` | m | đo | bắt buộc (kg/m) |
| `KG` | kg | đo | không có |

- `src/domain/quantity.ts`: `QUANTITY_UNITS` mở rộng; thêm `isCountUnit(unit)` (số nguyên) và `hasStandardWeight(unit)` (= `unit !== "KG"`). `toQuantity` bắt số nguyên theo `isCountUnit`, thông báo theo nhãn ("Số lượng bó phải là số nguyên"). Quy đổi kg ↔ đơn vị: đơn vị đếm làm tròn số nguyên như cũ, mét làm tròn 0,001.
- **Mọi chỗ đang so `=== "PIECE"` / `=== "KG"`** đổi sang một trong hai hàm trên (task 3.x liệt kê theo phân hệ). Với `PIECE` và `KG` kết quả giống hệt cũ, nên test hiện có là lưới an toàn.
- **Đơn mua**: dòng đơn có đơn vị = đơn vị của mã, hoặc `KG` khi mã có trọng lượng chuẩn (mua theo kg, nhập theo đơn vị mã) — tổng quát hóa quy tắc "cái hoặc kg" hiện tại. CHECK `purchase_order_line_unit_check` nhận đủ 9 giá trị.
- **Cho thuê**: bỏ CHECK `item_rental_unit_check`. Giá thuê ngày tính trên **1 đơn vị của mã**. Hiển thị giá kèm đơn vị khi khác `cái` (`150 ₫/m`). Cách tính tiền thuê trên hợp đồng (số lượng lẻ × giá × ngày, làm tròn) thuộc `rental-billing`; ở đây chỉ chốt rằng giá mặc định lưu theo đơn vị của mã.
- **Bộ**: chỉ nhận vật tư đơn vị đếm (số lượng linh kiện là số nguyên).
- **"Cây"** có trong issue #45 và roadmap nhưng không có trong danh sách của 0.2 #37. Giữ lại vì thép ống thô mua/bán theo cây 6 m; người duyệt bỏ được mà không đổi thiết kế (chỉ là một giá trị trong danh sách).

**Phương án đã cân nhắc:**

| Phương án | Bỏ vì |
|---|---|
| Bảng đơn vị người dùng tự thêm | Mỗi đơn vị mới phải trả lời "đếm hay đo, có kg không"; để người dùng tự khai dễ sai và kéo theo màn quản lý. Danh sách cố định đổi bằng migration là đủ. |
| Đơn vị là nhãn tự do, thêm cột `is_integer` | Hai mã cùng chữ "bó" có thể khác quy tắc; báo cáo không gom được. |
| Đơn vị phụ (quy đổi bó ↔ cái) | 0.2 #2 quản lý theo số lượng một đơn vị; quy đổi chỉ qua kg (0.2 #3). Thêm quy đổi bó ↔ cái làm giá BQ rối. |
| Mét không bắt buộc trọng lượng | Mất số "tấn hàng ngoài công trình" chủ cần (~1.800 tấn); thép ống có kg/m chuẩn. |
| Giữ chặn giá thuê cho kg | Trái Q3: công ty đang cho thuê hàng tính theo kg, mét. |

### D3. Phân loại Thiết bị / Vật tư (điểm 3)

**Quyết định:** cột `item_group.category text not null default 'EQUIPMENT'`, CHECK `in ('EQUIPMENT', 'MATERIAL')`. Nhãn: **Thiết bị** (hàng kinh doanh: giàn giáo, phụ kiện cho thuê/bán) và **Vật tư** (nguyên vật liệu, vật tư xưởng: thép ống, tôn dập, phụ kiện rời, sơn, que hàn). Dùng đúng hai từ công ty đang dùng (0.2 #41) thay cho "Thành phẩm / Nguyên vật liệu".

- Vật tư lấy phân loại từ nhóm (join, không lưu lặp). D9 lọc `?category=EQUIPMENT|MATERIAL`; ô chọn nhóm chỉ hiện nhóm thuộc phân loại đang chọn.
- Đổi phân loại nhóm: quyền `items.manage`, ghi nhật ký. Không chặn khi nhóm còn tồn: phân loại chưa ảnh hưởng tiền hay sổ kho.
- Change này **không** đổi hành vi theo phân loại (Vật tư vẫn đặt được giá thuê). `production-orders` (#46) và `contracts` (#9) sẽ dùng phân loại để lọc mã chọn được.

**Phương án đã cân nhắc:**

| Phương án | Bỏ vì |
|---|---|
| Cột phân loại trên từng vật tư | Một nhóm có thể lẫn hai phân loại, phải sửa từng mã; nhóm "Que hàn" vốn đã là Vật tư. |
| Nhóm cha – nhóm con nhiều tầng | Quá sức cho 142 mã; cần thêm màn cây thư mục. |
| Phân loại thứ ba "Máy móc / dụng cụ" | 0.2 #41 chỉ chia hai; máy móc xưởng nếu cần theo dõi thì đặt nhóm "Dụng cụ" thuộc Vật tư. |

### D4. Tỉnh/thành và khu vực của công trình (điểm 4)

**Quyết định:**

- Cột `site.province text null`. Giá trị là mã tỉnh trong danh sách cố định `src/domain/province.ts` (34 tỉnh/thành sau sắp xếp có hiệu lực 01/07/2025), mỗi tỉnh có tên hiển thị và **khu vực**. Không CHECK ở DB (danh sách tỉnh có thể đổi theo hành chính; kiểm ở domain), nhưng service từ chối mã ngoài danh sách.
- **Khu vực suy ra từ tỉnh**, không lưu. Lọc khu vực ở DB = `province in (<các mã thuộc khu vực>)`; "Chưa rõ" = `province is null`.
- Bắt buộc chọn tỉnh khi tạo và khi sửa; công trình cũ để trống tới lần sửa đầu. Không suy tỉnh từ địa chỉ.
- Bảng khu vực (đề xuất, chờ duyệt):
  - **Miền Bắc (15):** Hà Nội, Hải Phòng, Quảng Ninh, Bắc Ninh, Hưng Yên, Ninh Bình, Phú Thọ, Thái Nguyên, Tuyên Quang, Lào Cai, Lạng Sơn, Cao Bằng, Điện Biên, Lai Châu, Sơn La.
  - **Miền Trung (11):** Thanh Hóa, Nghệ An, Hà Tĩnh, Quảng Trị, Huế, Đà Nẵng, Quảng Ngãi, Gia Lai, Đắk Lắk, Khánh Hòa, Lâm Đồng (gộp Tây Nguyên vào Miền Trung vì issue chỉ cần 3 miền).
  - **Miền Nam (8):** TP. Hồ Chí Minh, Đồng Nai, Tây Ninh, Cần Thơ, Vĩnh Long, Đồng Tháp, An Giang, Cà Mau.
- Mã tỉnh ngắn, in hoa không dấu (`HN`, `HCM`, `DNG` cho Đà Nẵng, `DNI` cho Đồng Nai...) để nằm gọn trên URL `?province=HCM`.
- API `GET /api/catalog/sites` nhận `region` và `province`; trả thêm `province`, `provinceName`, `region`.

**Phương án đã cân nhắc:**

| Phương án | Bỏ vì |
|---|---|
| Lưu cột `region` riêng | Lặp dữ liệu, có thể lệch với tỉnh; khu vực luôn suy được. |
| Bảng `province` trong DB | 34 dòng gần như không đổi; bảng thêm migration seed và FK mà không thêm giá trị. Danh sách ở `src/domain` là "một chỗ" theo 0.2 #33 mục 5. |
| Danh sách 63 tỉnh cũ | Đã hết hiệu lực từ 07/2025; khách nhập theo địa chỉ mới. |
| Khu vực người dùng tự chọn, không theo tỉnh | Hai người chọn khác nhau cho cùng tỉnh; báo cáo theo vùng sai. |
| Thêm Tây Nguyên thành miền thứ tư | Issue và chủ chỉ hỏi Bắc/Trung/Nam. Đổi bảng sau chỉ sửa `province.ts`. |

### D5. Nhân viên phụ trách nhà thầu (điểm 5)

**Quyết định:**

- Cột `customer.sales_user_id text null references "user"(id) on delete restrict`, index.
- Chỉ chọn được tài khoản **đang hoạt động** có vai trò `SALES` hoặc `DIRECTOR` (kiểm ở service, khóa dòng user `FOR SHARE` trong transaction như quy ước tham chiếu). Tài khoản bị khóa sau khi gán vẫn giữ (không tự xóa liên kết), D16 hiện "(đã khóa)".
- Quyền đặt/đổi: `partners.manage` (như mọi trường của nhà thầu). Ghi nhật ký với tên người, không ghi id.
- **Không giới hạn quyền xem**: mọi vai trò có `catalog.read` thấy mọi nhà thầu. D16 có bộ lọc `?sales=<userId>|none`. API `GET /api/catalog/customers` nhận `sales`.
- Danh sách người chọn được lấy qua endpoint nhẹ `GET /api/catalog/sales-staff` (id, tên, trạng thái), quyền `catalog.read`, không trả tên đăng nhập hay vai trò khác.

**Ảnh hưởng tới quyền xem (tách thuê/bán ở #9):** người phụ trách là dữ liệu chuẩn bị cho #9 (lọc "khách của tôi", báo cáo doanh số theo nhân viên). Nếu #9 quyết định giới hạn xem theo người phụ trách, điều kiện lọc đã có sẵn cột và index; change này không chặn gì.

**Phương án đã cân nhắc:**

| Phương án | Bỏ vì |
|---|---|
| Giới hạn Kinh doanh chỉ thấy khách mình phụ trách ngay bây giờ | Chủ yêu cầu tách theo **thuê / bán**, không theo người (#9); công ty nhỏ, nhân viên làm thay nhau; giới hạn sớm phải sửa lại khi #9 chốt. |
| Nhiều người phụ trách một khách | Excel chỉ có một cột "Khách của Lương"; một người là đủ, sau mở rộng được. |
| Người phụ trách gõ tên tự do | Không lọc, không báo cáo được; tên gõ lệch nhau. |
| Gán theo công trình thay vì nhà thầu | File kế toán gán theo khách. Có thể thêm ở công trình sau nếu cần. |

### D6. Mã ghép và hàng có đầu / không đầu (điểm 6, Q10)

**Quyết định** (theo 0.2 #37): mỗi mã là **một vật tư riêng**, có tồn, giá BQ, giá thuê, giá đền bù riêng.

- `KB+KU34` là vật tư thường, **không** phải bộ: bộ chỉ để báo giá và tồn tính theo linh kiện (0.2 #4b), còn mã ghép được đếm, nhập, xuất như một món hàng.
- `H1,7` và `H1,7KĐ` là hai mã; người dùng tự đặt trọng lượng chuẩn (0.2 #37 ghi "cùng trọng lượng chuẩn", nhưng hệ thống không ép bằng nhau vì có thể chỉnh sau khi cân lại).
- Không có cột liên kết "biến thể". Tìm `h1,7` ở D9 ra cả hai nhờ tìm theo chuỗi con của `search_text`. Nghiệp vụ "đổi hàng" (lắp đầu nối rời vào khung không đầu, 0.2 #38) làm ở `returns-and-compensation`; khi đó nếu cần liên kết sẽ thêm bảng riêng.

**Phương án đã cân nhắc:**

| Phương án | Bỏ vì |
|---|---|
| Một mã + thuộc tính "có đầu / không đầu" | Hai loại có giá thuê, tồn, giá vốn khác nhau; thuộc tính phải đưa vào khóa giá BQ (mã + tình trạng), phá 0.2 #1. |
| Mã ghép là bộ | Bộ không có tồn riêng; mã ghép được đếm và trả như một món. |
| Liên kết có đầu ↔ không đầu ngay bây giờ | Chưa có nghiệp vụ nào dùng; đợi `returns-and-compensation`. |

### D7. Bảng dữ liệu và API (tổng hợp)

**Migration** `drizzle/0013_catalog_extensions.sql` (một file, sinh bằng `npm run db:generate` rồi sửa tay phần điền dữ liệu):

| Bảng | Thay đổi |
|---|---|
| `item` | thêm `code_key` (cột sinh tự động từ `code`, unique); đổi `item_code_check`; `item_unit_check` nhận 9 đơn vị; `item_weight_check` = `(unit = 'KG' and standard_weight_kg is null) or (unit <> 'KG' and standard_weight_kg > 0)`; **bỏ** `item_rental_unit_check` |
| `item_alias` (mới) | `id uuid pk`, `item_id uuid not null references item on delete cascade`, `code text not null`, `code_key` (cột sinh, unique), `created_at`, `created_by`; index `item_id`; CHECK mã như `item` |
| `kit` | thêm `code_key` (cột sinh, unique); đổi `kit_code_check` |
| `item_group` | thêm `category text not null default 'EQUIPMENT'` + CHECK |
| `site` | thêm `province text null`; index `province` |
| `customer` | thêm `sales_user_id text null` FK `user(id)` restrict; index |
| `purchase_order_line` | `purchase_order_line_unit_check` nhận 9 đơn vị |

Không có bảng chỉ ghi thêm mới, không đổi `APPEND_ONLY_TABLES`; `src/db/grants.ts` cấp CRUD cho `item_alias` như bảng thường (test chống lệch quyền sẽ bắt nếu quên). Không thêm `CREATE SEQUENCE`.

`item_alias.on delete cascade`: vật tư chỉ xóa được khi chưa dùng ở đâu; khi đó mã cũ đi theo là đúng. Mã cũ không được tham chiếu từ chứng từ nào (chứng từ luôn ghi `item_id`).

**`search_text`** của vật tư = tên + mã + `code_key` + các mã cũ và `code_key` của chúng. Cập nhật khi tạo, sửa tên, sửa mã cũ. Vì mã cũ đổi được, `search_text` được dựng lại trong cùng transaction với `item_alias`.

**API** (đều bọc `withAuth`, test `route-guards` đã có):

| Route | Thay đổi |
|---|---|
| `POST /api/catalog/items` | `code` theo luật mới; `unit` 9 giá trị; `aliases?: string[]` (≤ 5); giá thuê nhận mọi đơn vị |
| `PATCH /api/catalog/items/{id}` | thêm `aliases` (danh sách đầy đủ sau khi sửa); `code`, `unit` vẫn bị từ chối |
| `GET /api/catalog/items` | lọc thêm `category`; `q` khớp cả mã cũ; mỗi phần tử trả `aliases`, `category`, `unitLabel` |
| `POST/PATCH /api/catalog/item-groups` | thêm `category` |
| `POST/PATCH /api/catalog/kits` | luật mã mới; chặn linh kiện không phải đơn vị đếm |
| `POST/PATCH /api/catalog/sites` | thêm `province` (bắt buộc) |
| `GET /api/catalog/sites` | lọc `region`, `province`; trả `province`, `provinceName`, `region` |
| `POST/PATCH /api/catalog/customers` | thêm `salesUserId` (`null` để bỏ) |
| `GET /api/catalog/customers` | lọc `sales=<id>|none`; trả `salesUser { id, name, active }` |
| `GET /api/catalog/sales-staff` (mới) | danh sách tài khoản chọn được làm người phụ trách |
| `GET /api/stock/lookup?code=` | nhận mã gần đúng và mã cũ (D1) |

**Nhật ký:** sửa mã cũ (`aliases` là một trường trong `diffFields`, ghi danh sách thêm / bỏ), đổi phân loại nhóm, đổi tỉnh, đổi người phụ trách. Test tĩnh `coverage.test.ts` sẽ bắt hàm ghi quên `logActivity`.

### D8. Giao diện D9, D16, M2

- **D9:** bộ lọc phân loại dạng nút phân đoạn (Tất cả / Thiết bị / Vật tư) trước ô chọn nhóm; tên vật tư có dòng phụ "Mã cũ: …" khi có; cột ĐVT hiện nhãn mới; giá kèm đơn vị khi khác cái. Form vật tư: chọn đơn vị từ 9 giá trị (nhóm "Đếm" / "Đo"), nhãn trọng lượng đổi theo đơn vị ("kg / m"), ô mã cũ dạng thẻ (tối đa 5). Form nhóm: chọn phân loại.
- **D16:** tab Công trình thêm cột Tỉnh/thành, Khu vực và bộ lọc khu vực + tỉnh; form công trình có ô chọn tỉnh (tìm được, không dấu). Tab Nhà thầu: dòng danh sách hiện người phụ trách, chi tiết có trường "Nhân viên phụ trách", bộ lọc người phụ trách.
- **M2:** chỉ đổi kiểm tra mã khi gõ và hiện nhãn đơn vị mới; không đổi bố cục.
- File thiết kế `docs/design/screens/D9-Items.dc.html` và `D16-Partners.dc.html` cần vẽ lại phần đổi (issue #45 mục Thiết kế). Task UI làm theo mô tả trên nếu file chưa kịp cập nhật, và đánh dấu ảnh mốc cần chụp lại.

## Risks / Trade-offs

- [Sót một nhánh `"PIECE"` trong ~40 file → mã `bó`, `m` bị xử lý như kg hoặc bị chặn] → Task 3.1 dò bằng `grep` có danh sách file; thêm test tĩnh chặn chuỗi `=== "PIECE"` / `=== "KG"` ngoài `src/domain/quantity.ts` (ngoại lệ có chú thích); integration test đi trọn đơn mua → phiếu nhập → sửa chữa với một mã `METER` và một mã `BUNDLE`.
- [Mã có `+`, khoảng trắng bị hỏng trên URL (`+` thành khoảng trắng)] → luôn `encodeURIComponent`; test E2E mở thẻ kho của `KB+KU34` và tìm `NỐI 34` ở D9.
- [Collation DB khác nhau làm CHECK mã hành xử khác nhau] → CHECK chỉ dùng phép so ký tự ASCII và `upper()`; luật Unicode ở domain; integration test chèn `NỐI 34` và `nối 34` (bị chặn bởi `code = upper(code)`).
- [`upper()` của Postgres với chữ có dấu phụ thuộc locale] → integration test chạy trên DB local, CI và (thủ công) Neon; nếu `upper('ố')` không ra `Ố` thì bỏ điều kiện `upper` khỏi CHECK, giữ kiểm ở domain.
- [Bảng khu vực theo tỉnh gây tranh cãi (Lâm Đồng, Thanh Hóa)] → chỉ nằm ở `province.ts`, đổi không cần migration; nêu trong PR để chủ duyệt.
- [Người phụ trách bị hiểu là giới hạn quyền] → spec ghi rõ không giới hạn; chữ trên D16 là "Nhân viên phụ trách", không có chữ "chỉ thấy".
- [Mã cũ trùng mã mới tạo sau] → không gian `code_key` chung, UNIQUE ở cả ba bảng cộng kiểm chéo trong transaction.

## Migration Plan

1. Migration chạy bằng owner (`npm run db:migrate`), sau đó `src/db/grants.ts` cấp quyền `item_alias` cho `erp_app`.
2. Điền dữ liệu trong cùng migration: `item.code_key`, `kit.code_key` do DB tự sinh từ mã hiện có; `item_group.category = 'EQUIPMENT'` (mặc định cột). `site.province`, `customer.sales_user_id` để trống.
3. Không đổi dòng sổ kho, giá BQ, đơn mua, phiếu nhập đã có; `npm run inventory:check` vẫn xanh trước và sau.
4. Rollback: migration ngược bỏ cột/bảng mới và dựng lại CHECK cũ — chỉ làm được khi chưa có vật tư dùng luật mã hoặc đơn vị mới (nếu có thì phải xóa/ngừng dùng chúng trước). Ghi chú điều này ở đầu file migration.
5. Seed dev (`npm run db:seed:dev`): thêm `H1,7`, `H1,7KĐ`, `KB+KU34`, `NỐI 34`, `ONG-49` (mét), `TY-REN` (bó), `QH-2,5` (hộp, nhóm "Que hàn" – Vật tư); mã cũ `K1,7` cho `GG-K17`; tỉnh cho công trình mẫu; người phụ trách `kinhdoanh` cho vài nhà thầu mẫu. Ảnh mốc D9, D16 đổi theo.

## Open Questions

- Bảng khu vực (D4) và việc giữ đơn vị "Cây" (D2) là đề xuất; chủ sửa khi review chỉ đổi danh sách hằng số, không đổi spec hay task. Nếu chủ chốt, ghi vào `docs/requirements.md` 0.2 trong cùng PR.
