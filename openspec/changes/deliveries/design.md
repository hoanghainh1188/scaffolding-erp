# Design: deliveries

## Context

- Hợp đồng (`src/lib/contracts/`): mỗi bản (gốc, phụ lục) là bộ đầy đủ, bản đã duyệt bị trigger khóa; giá tại một ngày đọc qua `contractTermsAt(tx, contractId, date)`. Dòng thuê một dòng mỗi mã, **không có tình trạng**; dòng bán có `condition` (`NEW`/`GOOD`/`SCRAP`) và `pricing_unit` (`ITEM`/`KG`). Bản lưu `company_truck`, `freight_per_trip`. `contract_kit` chỉ lưu bộ + số bộ; thành phần bộ **không** chép vào hợp đồng (contracts D9).
- `transition()` ở `src/domain/contract.ts` đã có lệnh `START` (`APPROVED → ACTIVE`) và luật hủy dùng `hasDeliveries`; `src/lib/contracts/deliveries.ts` là hàm chờ trả `false`.
- Sổ kho: `postMovements` / `lockForPosting` (khóa vật tư → vị trí → (mã + tình trạng) theo thứ tự cố định). Ngày nghiệp vụ không lùi theo (mã + tình trạng) và không sau hôm nay. Dòng sổ có sẵn `weighed_kg` cho bán theo kg. Loại `DELIVERY_OUT`/`DELIVERY_IN`/`SALE_OUT` đã khai báo.
- Mỗi công trình có một vị trí `SITE` đi kèm (spec `sites-and-locations`). Hợp đồng bán được để trống công trình.
- Phiếu nhập (`src/lib/receiving/`) là mẫu cho nháp điện thoại: phiếu chỉ tồn tại khi ghi sổ, `client_draft_id` unique chống trùng, nháp ở IndexedDB (`src/lib/drafts/`).
- Thiết kế D6 và M5 vẽ trước 0.2 #40, #43 (xem proposal).

## Goals / Non-Goals

**Goals:**
- Một chứng từ phiếu xuất dùng chung cho thuê và bán, ghi sổ một lần, đọc lại được ngày giao và số giao theo (mã + tình trạng) cho `rental-billing`, `returns-and-compensation`, `receivables`.
- Mọi luật (chuyển trạng thái, rã bộ, còn phải giao, xuất vượt, số cái ước tính từ kg, tiền dòng bán, tóm tắt nhật ký) là **hàm thuần** ở `src/domain/delivery-note.ts`, có unit test.
- Điện thoại mất sóng không mất số đã nhặt và không ghi sổ hai lần.

**Non-Goals:**
- Không giữ hàng (reserve) khi lập đợt; tồn chỉ bị trừ lúc ghi sổ.
- Không sửa, không đảo phiếu đã xuất. Xuất nhầm thì thu hồi (`returns-and-compensation`) hoặc phiếu điều chỉnh.
- Không tính tiền thuê, không ghi công nợ.

## Decisions

### D1. Trạng thái phiếu và ai chuyển (điểm cần chốt 1)

`PLANNED` (Chờ nhặt) → `PICKING` (Đang nhặt) → `POSTED` (Đã xuất); thêm `CANCELLED` (Đã hủy).

| Chuyển | Ai | Điều kiện |
|---|---|---|
| tạo → `PLANNED` | `canContract(loại, "manage")` | hợp đồng `APPROVED`/`ACTIVE`; mã có trên bản áp dụng hôm nay |
| sửa (giữ `PLANNED`) | như trên | chỉ khi `PLANNED`; kèm `updatedAt` |
| `PLANNED` → `PICKING` (Bắt đầu nhặt) | `deliveries.pick` | lưu người nhặt, giờ bắt đầu |
| `PICKING` → `PLANNED` (Trả lại văn phòng) | `deliveries.pick` | bắt buộc lý do (VD "Bãi hết chéo, văn phòng đổi đợt") |
| `PICKING` → `PLANNED` (Rút về để sửa) | `canContract(loại, "manage")` | bắt buộc lý do; nháp đang nhặt trên máy sẽ bị từ chối khi gửi |
| `PICKING` → `POSTED` (Xác nhận xe rời bãi) | `deliveries.pick` | phiên bản phiếu khớp lúc bắt đầu nhặt; ghi sổ (D9) |
| `PLANNED`/`PICKING` → `CANCELLED` | `canContract(loại, "manage")` | bắt buộc lý do |

- Bảng chuyển trong `transition()` ở `src/domain/delivery-note.ts`, như `purchase-order.ts`; service gọi sau khi khóa `FOR UPDATE`.
- **Văn phòng lập, thủ kho xác nhận.** Giám đốc làm được tất cả (có cả hai quyền). Kinh doanh không xác nhận xuất thay thủ kho.
- `PICKING` là trạng thái ở server (khác phiếu nhập) vì D6 phải hiện "thủ kho đang nhặt" và văn phòng không được sửa số khi thủ kho đang nhặt. Nháp trên máy giữ `startedVersion` (= `updated_at` lúc bắt đầu). Lệnh ghi sổ so `startedVersion` với `updated_at` hiện tại: lệch (phiếu đã bị rút về, sửa, hủy, hoặc người khác bắt đầu lại) thì từ chối "Văn phòng đã đổi phiếu PX-2026-140 sau khi bạn bắt đầu nhặt. Bạn mở lại phiếu để nhặt theo số mới.", nháp giữ số đã nhặt.
- Không có "Xóa nháp" ở server: phiếu có số in ra cho thủ kho nên chỉ hủy, giữ dấu vết.

Đã cân nhắc: không có `PICKING`, phiếu chỉ có `PLANNED → POSTED` như phiếu nhập. Bỏ: văn phòng có thể sửa số trong lúc thủ kho đang nhặt theo số cũ mà không ai biết; D6 không hiện được "đang nhặt".

### D2. Ngày giao = ngày ghi sổ (điểm cần chốt 2)

- **Ngày giao** (ngày nghiệp vụ của dòng sổ, `business_date` của phiếu) = **ngày server ghi sổ** theo giờ Việt Nam, tức ngày xe rời bãi khi thủ kho bấm "Xác nhận xe rời bãi". Không có ô nhập ngày giao.
- Giờ bấm trên điện thoại lưu ở `departed_at` chỉ để xem. Nháp "Chờ gửi" gửi được vào ngày sau thì phiếu mang ngày gửi được; D6 và phiếu in hiện thêm "Xác nhận trên máy lúc 22:10 05/11/2026". D6 có khối **"Cần kiểm tra"** liệt kê các phiếu như vậy ("PX-2026-142 · ngày giao 06/11/2026, xác nhận trên máy 05/11/2026") để kế toán biết khi tính tiền thuê; khối ẩn khi không có phiếu nào.
- **Xe đi tối, tới công trình sáng hôm sau**: ngày giao vẫn là ngày xe rời bãi. Tiền thuê không tính ngày giao, tính từ hôm sau (0.2 #4), đúng là ngày khách nhận hàng. Không cần luật riêng.
- "Ngày dự kiến" (`planned_date`) văn phòng nhập trên D6 bằng `DateInput`, chỉ để sắp việc trên M1 và D6.

Đã cân nhắc:
- *Ngày nhập tay*: dễ ghi lùi, phá luật "ngày nghiệp vụ không lùi" của sổ kho và làm sai tiền thuê. Bỏ.
- *Lấy `departed_at` của điện thoại*: đồng hồ máy không tin được, và gửi muộn sẽ thành ghi lùi ngày. Bỏ; giữ làm thông tin.

### D3. Xuất thiếu, còn phải giao, xuất vượt (điểm cần chốt 3)

- **Còn phải giao** không lưu: tính mỗi lần đọc từ **bản hợp đồng áp dụng hôm nay** (0.2 #56):
  - **Thuê**: số trên hợp đồng − **số đang ở công trình** của hợp đồng, theo **mã** (gộp mọi tình trạng; Mới và Tốt cùng giá). "Đang ở công trình" = tổng số lượng các dòng sổ **tại vị trí công trình** của các chứng từ **thuộc hợp đồng này** (vào − ra). Change này chỉ có `DELIVERY_IN` của phiếu xuất; `returns-and-compensation` thêm dòng ra của phiếu thu hồi gắn hợp đồng, công thức không đổi. Lọc theo chứng từ của hợp đồng (không chỉ theo vị trí) để công trình có hai hợp đồng thuê không cộng lẫn. Trả 200 rồi lấy lại 200 không thành "xuất vượt".
  - **Bán**: số trên hợp đồng − **tổng đã giao** (phiếu `POSTED`), theo **dòng hợp đồng** (mã + tình trạng + cách tính). Dòng theo kg so bằng **kg cân**, dòng theo đơn vị của mã so bằng số lượng. Hàng bán không quay lại nên không có "đang ở".
  - Âm (đã giao vượt, hoặc phụ lục giảm số) thì hiện 0 kèm "đã giao vượt N".
- **Chưa lên phiếu** = còn phải giao − số cần của các phiếu `PLANNED`/`PICKING`. "Tạo đợt xuất" điền sẵn số này (hoặc số của đợt kế hoạch tiếp theo nếu người lập chọn đợt đó). Hàm thuần `remainingToDeliver({ type, contractLines, onSite, delivered, openLines })`; service đọc `onSite` (thuê) hoặc `delivered` (bán) từ sổ kho / phiếu.
- **Dung sai cân** (0.2 #57): dòng bán theo kg: mỗi chuyến so kg cân với **số cần của phiếu** (tới 110 %); khi lập và khi ghi sổ, **tổng đã giao + phiếu đang mở + chuyến này** so với **số trên hợp đồng** (tới 110 %), để chuyến cuối nặng hơn phần còn lại một chút vẫn đi được (review PR #130). Đúng 10 % vẫn qua, hơn thì chặn. Hằng số `WEIGHT_TOLERANCE` (tử 11, mẫu 10, so bằng bigint) chuyển ra **một chỗ** `src/domain/tolerance.ts`; `receipt-anomalies.ts` (nhận dư hàng kg, mét) import lại từ đó, không còn hằng riêng. Dòng theo đơn vị đếm không có dung sai.
- **Xuất thiếu**: trên M5 số nhặt của một dòng được nhỏ hơn số cần, kể cả 0; thủ kho xác nhận lại "Còn 100 cái chưa nhặt. Xác nhận luôn thì phần thiếu chuyển sang đợt sau." Phần thiếu tự nằm trong "Còn phải giao" vì chỉ số đã xuất bị trừ. **Không tự tạo phiếu mới**: đợt sau do văn phòng lập theo tiến độ công trình. Phiếu ghi nhận số cần và số nhặt nên D6 hiện "Đợt 3 · xuất thiếu 40 chéo".
- **Nhặt hơn số cần** của dòng: chặn trên M5 và ở server ("Bạn nhặt 130 cái, nhiều hơn số cần 120 cái. Văn phòng cần sửa phiếu nếu muốn xuất thêm."). Lý do: số cần do văn phòng (người có quyền hợp đồng) quyết. Dòng bán theo kg so **kg cân** với số cần (kg), trong dung sai 10 %; số cái của dòng đó không so với số cần.
- **Số cần vượt còn phải giao** khi lập/sửa đợt:
  - Thuê: **cảnh báo, không chặn**. Người lập tích "Tôi xác nhận xuất vượt số trên hợp đồng"; lưu `over_contract_confirmed`, nhật ký gắn cờ "Có xác nhận bất thường". Lý do: thực tế công trình hay cần thêm vài cây chéo trước khi kịp làm phụ lục, mã đã có giá thuê trên hợp đồng.
  - Bán: **chặn** ("Hợp đồng bán chỉ còn phải giao 150 cái H1,7 Mới. Bạn lập phụ lục nếu khách mua thêm."). Lý do: tiền bán = số × giá; bán quá số đã ký là thay đổi hợp đồng. Dòng theo kg chặn khi vượt quá dung sai 10 %.
  - Lúc ghi sổ kiểm lại theo cùng luật (đợt khác có thể đã xuất trước): bán vượt thì từ chối; thuê vượt mà phiếu chưa có xác nhận thì vẫn ghi (văn phòng đã duyệt số cần), tóm tắt nhật ký ghi "vượt hợp đồng N".

Đã cân nhắc: tự tạo phiếu đợt sau cho phần thiếu (0.2 #17 "tự chuyển sang đợt sau"). Bỏ: sinh phiếu Chờ nhặt mà chưa ai hẹn xe, làm M1 đầy việc giả; "còn phải giao" tính ra đã giữ đúng phần thiếu.

### D4. Rã bộ: theo danh mục lúc lập đợt (điểm cần chốt 4)

- Khi lập/sửa đợt, bộ × n tách thành linh kiện bằng **thành phần bộ hiện tại trong danh mục** (`kit_component`, khóa `FOR SHARE`), dùng lại `explodeKits` của `src/domain/contract-lines.ts`, gộp với dòng lẻ cùng mã. Kết quả lưu thành **dòng theo mã** của phiếu (`delivery_note_line`); bộ đã chọn lưu ở `delivery_note_kit` để hiện "60 bộ giàn giáo 1,7m = 120 khung, 120 chéo, 60 mâm". Bộ đổi trong danh mục sau đó không đổi phiếu đã lập.
- Mọi linh kiện phải có trên bản hợp đồng áp dụng: thiếu thì từ chối "Bộ BO-1,7 có mã MAM1,6 chưa có trên hợp đồng. Bạn chọn từng mã hoặc lập phụ lục thêm mã này."
- Chỉ hợp đồng thuê chọn được bộ (dòng bán có tình trạng riêng nên chọn từng dòng).

Đã cân nhắc: rã theo `contract_kit` của hợp đồng. Không làm được đúng: hợp đồng chỉ lưu bộ và số bộ, không chép thành phần (contracts D9); muốn vậy phải sửa migration hợp đồng. Bộ chỉ để báo giá cho nhanh (0.2 #4b), số tính tiền là số theo mã, nên rã theo danh mục rồi kiểm theo mã là đủ.

### D5. Hợp đồng bán (điểm cần chốt 5)

- **Dòng sổ**: `SALE_OUT` (số âm) ở bãi, tình trạng = tình trạng của dòng hợp đồng bán, đơn giá ghi sổ = giá BQ hiện tại. Không có dòng ở công trình (hàng đã thành của khách), kể cả hợp đồng bán có công trình.
- **Số lượng ghi sổ luôn theo đơn vị của mã** (cái, cây, mét, kg...). Dòng bán **theo kg** của mã tính theo cái: **số cần của dòng phiếu là kg** (như dòng hợp đồng); thủ kho nhập **số cái** (chỉ để trừ tồn) và **số kg cân** (so với số cần, tính tiền). Kg cân lưu ở `delivery_note_pick.weighed_kg` và `inventory_ledger.weighed_kg` (cột đã có); không đổi số lượng hay giá vốn. Mã đơn vị kg: số lượng chính là kg cân.
- **Phế liệu không đếm được số cái** (đống phế liệu cân cả xe): thủ kho nhập kg cân; M5 điền sẵn **số cái ước tính** = kg ÷ trọng lượng chuẩn, làm tròn tới số nguyên gần nhất (tối thiểu 1) và **không quá tồn của (mã + Phế liệu) ở bãi xuất**; bị cắt theo tồn thì M5 báo "Ước tính 45 cái nhưng bãi chỉ còn 42 cái Phế liệu, máy điền 42." Thủ kho sửa được. Lưu cờ `pieces_estimated`; D6, phiếu in hiện "≈ 42 cái (ước tính từ 570,5 kg)". Lệch thật với bãi sẽ lộ ra ở kiểm kê. Hàm thuần `estimatedPieces(kg, standardWeightKg)`. Lý do: sổ kho đếm phế liệu theo cái (0.2 #3), phải trừ một số cái; ước tính theo trọng lượng chuẩn là cách quy đổi đã dùng ở mọi chỗ khác.
- **Bán không có công trình** ("Nhận hàng tại bãi"): lập đợt ở cùng màn D6 (mở từ D5 của hợp đồng), tiêu đề "Giao hàng · <số hợp đồng>". D6 là màn **theo hợp đồng** (1 hợp đồng = 1 công trình, 0.2 #5), nên không cần màn riêng cho bán.
- Hợp đồng bán cũng chuyển `APPROVED → ACTIVE` ở phiếu đầu tiên.

### D6. Cước và tiền bán lưu ở đâu (điểm cần chốt 6)

- Phiếu (`delivery_note`): `company_truck` (bool), `freight_amount` (bigint ₫, ≥ 0, null khi không gọi xe), `vehicle_plate` (text). Khi lập đợt điền sẵn từ bản hợp đồng áp dụng hôm nay (`company_truck`, `freight_per_trip`); văn phòng sửa được khi `PLANNED`. Thủ kho chỉ sửa biển số (M5), không thấy cước.
- Dòng bán: lúc ghi sổ chép `unit_price` từ dòng hợp đồng của **bản áp dụng tại ngày giao** vào `delivery_note_line.unit_price`, và lưu `contract_revision_id` của bản đó trên phiếu. Bản đã duyệt bị khóa nên chép là để đọc nhanh và để D6, phiếu in không phải tra lại.
- **Không lưu tiền cộng dồn**: tiền dòng bán tính bằng hàm thuần `saleLineAmount({ pricingUnit, quantity, weighedKg, unitPrice })` (theo kg → kg cân × giá; theo đơn vị → số lượng × giá; làm tròn 1 ₫, 0,5 lên, bigint, dùng lại `lineAmount` của hợp đồng). `receivables` đọc phiếu `POSTED` (ngày giao, cước, các dòng) qua `src/lib/deliveries/amounts.ts` và tự tính; hạn thanh toán hàng bán = ngày giao + hạn của hợp đồng (0.2 #18) do `receivables` tính.

### D7. Một phiếu một bãi (điểm cần chốt 7)

- `delivery_note.source_location_id` là một vị trí loại `YARD` đang dùng. Công ty chỉ có một bãi thì điền sẵn và ẩn ô; nhiều bãi thì người lập chọn, mặc định bãi có đủ hàng Mới + Tốt nhiều nhất cho các mã của đợt.
- Cần lấy từ hai bãi thì lập hai phiếu (hai xe, hai lần xác nhận). Lý do: một phiếu là một chuyến xe, một người nhặt ở một chỗ; ghi sổ và in đơn giản.
- Không xuất từ xưởng (`WORKSHOP`): hàng sửa xong chuyển về bãi trước.

### D8. Mẫu in (điểm cần chốt 8)

- Trang `/sales/deliveries/[code]/print` (server component). Đầu trang đọc `company_profile` qua `src/lib/company` (tên, MST, địa chỉ, điện thoại, logo); thiếu trường thì bỏ dòng, thiếu logo thì in chữ. Không viết cứng (0.2 #33 quy ước 4). In bằng `printDocument({ title })`, CSS `@media print` dùng token, như in hợp đồng.
- `POSTED`: tiêu đề "Phiếu xuất kho PX-2026-140" (thuê) hoặc "Phiếu giao hàng PX-2026-151" (bán); số hợp đồng, đợt, nhà thầu, công trình + địa chỉ (hoặc "Nhận hàng tại bãi"), ngày giao, bãi xuất, biển số; bảng mã, tên, tình trạng, đơn vị, số lượng (kg cân, "ước tính" nếu có); bán thêm đơn giá, thành tiền, tổng; dòng cước khi công ty gọi xe; bốn chỗ ký: Người lập phiếu, Thủ kho, Lái xe, Người nhận hàng.
- `PLANNED`/`PICKING`: in **"Phiếu nhặt hàng PX-2026-140"**: số cần từng mã, cột trống để ghi số nhặt, **không giá, không cước** (đưa cho thủ kho). `CANCELLED` không in.
- Không sinh PDF ở server, không lưu bản in.

### D9. Ghi sổ: một transaction, thứ tự khóa

`postDelivery(actor, noteId, { clientDraftId, startedVersion, departedAt, vehiclePlate, picks })` trong `src/lib/deliveries/post.ts`:

1. Tìm phiếu có `client_draft_id` = mã nháp: có rồi thì trả kết quả cũ (không ghi gì, không nhật ký). Hai lần gửi cùng lúc: unique `client_draft_id` là lớp chặn thứ hai, lệnh thua đọc lại và trả kết quả cũ.
2. Khóa **hợp đồng** `FOR UPDATE` (cùng thứ tự với lệnh phụ lục và hủy hợp đồng: hợp đồng trước), rồi **phiếu** `FOR UPDATE`. Kiểm: phiếu `PICKING`, `updated_at` = `startedVersion`, hợp đồng `APPROVED`/`ACTIVE`, mỗi mã có trên `contractTermsAt(ngày giao)`, luật nhặt (D3, D5, thuê chỉ `NEW`/`GOOD`).
3. `postMovements` (bên trong `lockForPosting`: vật tư → vị trí → (mã + tình trạng)). Thuê: mỗi (mã + tình trạng) nhặt ra hai dòng `DELIVERY_OUT` bãi / `DELIVERY_IN` vị trí công trình. Bán: một dòng `SALE_OUT` kèm `weighed_kg`. `documentType = 'DELIVERY_NOTE'`, `documentCode = PX-…`, ngày = hôm nay giờ VN.
4. Cập nhật phiếu (`POSTED`, `business_date`, `posting_id`, `client_draft_id`, `departed_at`, `vehicle_plate`, `contract_revision_id`, `posted_by/at`), chèn `delivery_note_pick`, chép `unit_price` dòng bán.
5. Hợp đồng `APPROVED` thì `transition(START)` → `ACTIVE`.
6. `logActivity` **một dòng** Ghi sổ (tóm tắt D11).

Hai thủ kho bấm xác nhận cùng phiếu với hai mã nháp khác nhau: lệnh sau chờ khóa phiếu, thấy `POSTED` thì từ chối "Phiếu PX-2026-140 đã xuất lúc 10:42 do Văn Tùng xác nhận." Không ghi sổ lần hai.

### D10. Dữ liệu (migration `drizzle/0015_deliveries.sql`)

| Bảng | Cột chính | Ràng buộc |
|---|---|---|
| `delivery_note` | `id`, `code` unique, `contract_id`, `batch_no` int, `status`, `source_location_id`, `site_location_id` null, `planned_date` date null, `company_truck` bool, `freight_amount` bigint null, `vehicle_plate`, `note`, `over_contract_confirmed` bool, `picking_by`, `picking_started_at`, `returned_reason`, `cancelled_reason`, `client_draft_id` uuid null unique, `posting_id` null, `business_date` null, `departed_at` null, `contract_revision_id` null, `posted_by`, `posted_at`, `created_by`, `created_at`, `updated_at` | FK `ON DELETE RESTRICT` tới `contract`, `location`, `contract_revision`, `user`; unique `(contract_id, batch_no)`; check `status in ('PLANNED','PICKING','POSTED','CANCELLED')`; check `POSTED` ⇔ đủ `business_date`, `posting_id`, `client_draft_id`, `posted_by`; check `freight_amount >= 0`, `company_truck or freight_amount is null`; index `(contract_id)`, `(status, planned_date)` |
| `delivery_note_kit` | `note_id`, `kit_id`, `quantity` int ≥ 1 | PK `(note_id, kit_id)`; cascade theo phiếu, restrict tới `kit` |
| `delivery_note_line` | `id`, `note_id`, `item_id`, `condition` null, `pricing_unit` null, `requested_quantity numeric(14,3)` > 0 (**theo đơn vị của mã**, riêng dòng bán `pricing_unit = 'KG'` là **kg**), `unit_price` bigint null | thuê: `condition`, `pricing_unit` null, unique `(note_id, item_id)` một phần; bán: đủ hai cột, unique `(note_id, item_id, condition, pricing_unit)` một phần |
| `delivery_note_pick` | `line_id`, `condition`, `quantity numeric(14,3)` > 0, `weighed_kg numeric(14,3)` null, `pieces_estimated` bool | PK `(line_id, condition)`; check `condition in ('NEW','GOOD','SCRAP')`; check `pieces_estimated` thì có `weighed_kg` |

- Số phiếu `PX-YYYY-NNN` qua `nextDocumentCode(tx, 'PX', năm)` (bảng `document_counter`, không `SEQUENCE`). `batch_no` = max + 1 của hợp đồng, cấp sau khi khóa hợp đồng `FOR UPDATE`; phiếu hủy giữ số (không dùng lại).
- `site_location_id` = vị trí `SITE` của công trình hợp đồng (thuê); null với bán.
- Trigger `delivery_note_locked`: chặn UPDATE/DELETE phiếu có `OLD.status in ('POSTED','CANCELLED')` và INSERT/UPDATE/DELETE dòng con của phiếu đó; lệnh ghi sổ (UPDATE từ `PICKING`) đi qua.
- Không phải bảng chỉ ghi thêm nên không vào `APPEND_ONLY_TABLES`; `db:migrate` cấp CRUD.
- `DOCUMENT_TYPES` thêm `DELIVERY_NOTE` ("Phiếu xuất"); `ACTIVITY_ACTIONS` thêm `START` ("Bắt đầu nhặt", nhóm "Sửa"). Cùng migration tạo lại hai check của `activity_log`.
- `hasDeliveries` = có phiếu `POSTED` của hợp đồng. Thêm `openDeliveries(tx, contractId)` (phiếu `PLANNED`/`PICKING`) cho luật hủy hợp đồng.

### D11. Quyền, nhật ký, đồng thời

- Bảng quyền thêm `deliveries.pick`: `DIRECTOR`, `WAREHOUSE`. Lập, sửa, rút về, hủy: `canContract(user, loại hợp đồng, "manage")`. Xem D6 và chi tiết phiếu: `canContract(user, loại, "view")`. M5 và M1 đọc qua `deliveries.pick`. API M5 **không trả** đơn giá, cước, tiền 1 ngày (lọc ở truy vấn, không chỉ ẩn trên giao diện).
- Mỗi lệnh ghi một dòng nhật ký `DELIVERY_NOTE` trong transaction: Tạo ("Đợt 3 · 60 bộ giàn giáo 1,7m = 3 mã · cước 1.800.000 ₫"), Sửa (chỉ khi có trường đổi, `diffFields`), Bắt đầu nhặt, Trả lại (lý do; cả "Trả lại văn phòng" và "Rút về để sửa"), Hủy (lý do), Ghi sổ ("Xuất 120 khung, 80 chéo, 60 mâm · thiếu 40 chéo · hợp đồng sang Đang thực hiện"). Xuất vượt có xác nhận thì cờ "Có xác nhận bất thường". Lệnh bị từ chối không ghi. Test tĩnh `src/lib/activity/coverage.test.ts` thêm `src/lib/deliveries/`.
- Mọi lệnh sửa trạng thái khóa hợp đồng rồi phiếu `FOR UPDATE`, đọc lại rồi mới kiểm; sửa gửi `updatedAt`, lệch → 409.
- Hủy hợp đồng (`src/lib/contracts/approval.ts`): sau khi khóa hợp đồng gọi `hasDeliveries` và `openDeliveries`; còn phiếu mở thì từ chối "Hợp đồng còn phiếu xuất PX-2026-141 chưa xong. Bạn hủy phiếu xuất đó trước rồi hủy hợp đồng." Lý do chặn thay vì hủy kèm: phiếu có thể đang được nhặt ngoài bãi.

### D12. API và trang

| Route | Việc | Quyền |
|---|---|---|
| `GET /api/contracts/[id]/deliveries` | D6: hàng ở công trình / đã giao, còn phải giao, dòng thời gian | `canContract(view)` |
| `POST /api/deliveries` | lập đợt (`contractId`, `sourceLocationId`, `plannedDate`, `kits[]`, `lines[]`, `companyTruck`, `freightAmount`, `vehiclePlate`, `note`, `overContractConfirmed`) | `canContract(manage)` |
| `GET /api/deliveries/[id]` | chi tiết (văn phòng: có giá) | `canContract(view)` |
| `PUT /api/deliveries/[id]` | sửa `PLANNED`, kèm `updatedAt` | `canContract(manage)` |
| `POST /api/deliveries/[id]/cancel` \| `/recall` | hủy / rút về (lý do) | `canContract(manage)` |
| `GET /api/m/deliveries` | việc xuất cho M1 (không giá) | `deliveries.pick` |
| `GET /api/m/deliveries/[code]` | M5: dòng đã rã, tồn Mới/Tốt ở bãi, không giá | `deliveries.pick` |
| `POST /api/m/deliveries/[code]/start` \| `/return` | bắt đầu nhặt / trả lại văn phòng | `deliveries.pick` |
| `POST /api/m/deliveries/[code]/post` | xác nhận xe rời bãi (`clientDraftId`, `startedVersion`, `departedAt`, `vehiclePlate`, `picks[]`) | `deliveries.pick` |

Trang: `/sales/contracts/[id]/deliveries` (D6, nút "Tạo đợt xuất" mở form trong trang), `/sales/deliveries/[code]` (chi tiết, sửa, hủy, rút về, in), `/sales/deliveries/[code]/print`, `/m/deliveries/[code]` (M5). D5 thêm nút "Tiến độ cấp hàng" (thuê) / "Giao hàng" (bán) khi hợp đồng `APPROVED`/`ACTIVE`. Mọi route bọc `withAuth`; trang gọi `requirePermission` / `requireContractAccess`; `route-guards.test.ts` phủ route mới. Trang dùng "hôm nay" thì `await connection()` trước.

### D13. Nháp điện thoại

- `DRAFT_KINDS` thêm `DELIVERY`. Payload: `noteId`, `code`, `startedVersion`, `vehiclePlate`, `picks[] { lineId, condition, quantity, weighedKg, piecesEstimated }`, `departedAt` (lúc bấm xác nhận). Tự lưu sau mỗi thay đổi; outbox gửi lại như phiếu nhập (`src/lib/drafts/outbox.ts`), 401 giữ "Chờ gửi", 409/422 chuyển "Bị từ chối" giữ số.
- "Bắt đầu nhặt" cần mạng (đổi trạng thái ở server). Sau đó mất sóng vẫn nhặt và xác nhận được; xác nhận lúc mất sóng thành "Chờ gửi", D6 vẫn hiện "Đang nhặt" tới khi gửi được.

## Risks / Trade-offs

- [Thuê: tính theo số đang ở công trình thì hàng mất chưa lập phiếu thu hồi vẫn tính là đang ở] → đúng ý: hàng mất chỉ ra khỏi công trình khi có phiếu thu hồi / đền bù (0.2 #21). Không cần luật riêng.
- [Phụ lục giảm số sau khi đã giao vượt] → "Còn phải giao" hiện 0 kèm "đã giao vượt N"; không chặn phụ lục (đó là việc của Giám đốc khi duyệt). Thu hồi phần vượt ở `returns-and-compensation`.
- [Gửi muộn qua đêm làm ngày giao trễ một ngày] → khách được lợi một ngày thuê; D6 hiện giờ bấm trên máy để văn phòng thấy. Chấp nhận để giữ luật không ghi lùi.
- [Số cái phế liệu ước tính sai] → cờ "ước tính" hiện rõ; kiểm kê bãi sửa lệch bằng `ADJUST_*`.
- [Thủ kho quên bấm "Bắt đầu nhặt" rồi mất sóng] → M5 chặn nhập số khi phiếu chưa `PICKING` và báo "Bạn cần có mạng để bắt đầu nhặt phiếu này."
- [Rã bộ theo danh mục hiện tại khác thành phần lúc báo giá] → số theo mã mới là số tính tiền; phiếu hiện rõ từng linh kiện trước khi lưu, người lập sửa được.
- [Không giữ hàng khi lập đợt] → hai đợt cùng lúc có thể thiếu hàng; thủ kho xuất thiếu, phần thiếu vào "còn phải giao". Tồn bãi không âm được chặn ở sổ kho.

## Migration Plan

- Migration thêm bảng mới, không đổi dữ liệu cũ. Rollback: bỏ bốn bảng và khôi phục hai check cũ của `activity_log` (chỉ khi chưa có dòng `DELIVERY_NOTE`).
- Seed dev (`npm run db:seed:dev`): với hợp đồng thuê mẫu đã duyệt (có phụ lục `/01` nháp), ghi một phiếu đã xuất (đợt 1) qua `postDelivery` — hợp đồng sang Đang thực hiện — và một phiếu Chờ nhặt (đợt 2). Seed chạy lại không tạo thêm (dò theo ghi chú phiếu).
- E2E: global setup tạo **một lần** rồi dùng lại một hợp đồng thuê đã duyệt có `E2E-KHO-01/02` (ghi chú `E2E thử`, nhà thầu mẫu sẵn có, không thêm đối tác vì ảnh mốc đếm đối tác) và hủy phiếu Chờ nhặt / Đang nhặt do `e2e.*` lập ở lần chạy trước. E2E xuất từ `BAI-01`, kiểm theo chênh lệch (sổ kho không xóa được), không đụng hợp đồng mẫu của ảnh mốc D4/D5. Ghi luật này vào `CLAUDE.md` (mục Lưu ý E2E).
