# Design: site-operations

## Context

- Lý do làm: xem `proposal.md` mục Why. Hành vi: xem các spec `site-transfers`, `buy-backs`, `site-exchanges` và delta của `deliveries`, `contracts`, `activity-log`, `mobile-home`, `mobile-history`.
- Đã có (sau `deliveries`, `returns-and-compensation`):
  - `postMovements` (`src/lib/inventory/post.ts`) ghi mọi dòng sổ trong transaction của chứng từ, khóa vật tư → vị trí → giá.
  - `postDelivery`, `postReturn` khóa **hợp đồng** `FOR UPDATE` trước rồi mới tới phiếu.
  - `siteMovements` (`src/lib/deliveries/records.ts`) cộng dòng sổ tại vị trí công trình của **phiếu xuất** và **phiếu thu hồi** thuộc hợp đồng; `onSiteByItem`, `onSiteByItemCondition` dựa vào nó. "Còn phải giao" (0.2 #56) và M4 dùng hai hàm này.
  - `allocateReturn` (`src/domain/return-note.ts`) rút Mới trước rồi Tốt.
  - Loại dòng `TRANSFER_OUT` / `TRANSFER_IN` có trong enum, check DB và `MOVEMENTS`, **chưa chứng từ nào dùng**. `SALE_OUT` hiện chỉ ghi ở bãi.
  - Phiếu đền bù (`src/lib/compensations/`) đã có mẫu duyệt: Chờ duyệt → Đã duyệt / Đã từ chối, lý do khi nợ quá hạn qua `overdueDebt`, lưu `amount_due`, `due_date`, trigger khóa.
  - Hợp đồng: `contractTermsAt` (giá, giá mất, `payment_terms_days` tại một ngày), `canContract` (0.2 #51).
- Ràng buộc: sổ kho chỉ ghi thêm; tiền thuê và tồn luôn tính từ sổ; một vị trí `SITE` thuộc một công trình (`site.location_id`), một hợp đồng một công trình, nhưng **hai hợp đồng có thể cùng một công trình** (gia hạn bằng hợp đồng mới).

## Goals / Non-Goals

**Goals:**

- Ba nghiệp vụ dùng lại tối đa luồng có sẵn: chuyển công trình là một chứng từ mới; mua lại theo mẫu phiếu đền bù; đổi hàng không có chứng từ riêng.
- "Đang ở công trình" vẫn tính ra từ sổ kho, một chỗ (`siteMovements`), để D6, M4, còn phải giao và `rental-billing` sau này đọc cùng một nguồn.
- Không deadlock khi một lệnh khóa hai hợp đồng.

**Non-Goals:**

- Không làm `rental-billing`, chỉ chốt dữ liệu nó sẽ đọc (D11).
- Không thêm loại dòng sổ mới, không đổi giá BQ.

## Decisions

### D1. Chuyển công trình: ai lập, ai xác nhận (điểm cần chốt 1, đã chốt 0.2 #66, chi tiết #69, #70)

**Chọn:** Kinh doanh (hoặc Giám đốc) lập trên **D6b** từ D6 của hợp đồng đi. Hai cách xác nhận, chọn trên phiếu:

1. **Văn phòng xác nhận ngay**: "Xác nhận chuyển" lưu và ghi sổ trong một lệnh. Dùng khi xe đã chở xong và người đi xe đã gọi báo.
2. **Gửi điện thoại**: phiếu sang **Chờ xác nhận**; người có `deliveries.pick` mở **M9** từ M1, sửa **thực chở ≤ số văn phòng ghi**, nhập biển số, bấm xác nhận khi hàng đã hạ ở công trình nhận.

Trạng thái phiếu (`site_transfer.status`): `DRAFT` → `POSTED` (văn phòng); `DRAFT` → `SENT` → `POSTED` (M9); `SENT` → `DRAFT` (rút về); `DRAFT` / `SENT` → `CANCELLED` (lý do). Chuyển trạng thái qua hàm thuần `transition()` ở `src/domain/site-transfer.ts`, như `delivery-note.ts`.

**Ngày chuyển = ngày ghi sổ** (giờ VN), như 0.2 #55. Không nhập tay, không ghi lùi. Giờ bấm trên máy lưu riêng (`confirmed_on_device_at`) chỉ để xem; D6 nhắc khi khác ngày như phiếu xuất.

**Hàng hỏng phát hiện khi chuyển:** không chuyển. Người đi xe giảm thực chở trên M9, hàng hỏng để lại xe chở về bãi và làm **phiếu thu hồi** của hợp đồng đi (chia Chờ sửa / Phế liệu, đền bù tự sinh). Phiếu chuyển chỉ chở Mới / Tốt và giữ tình trạng.

**Cân nhắc:**

- *Chỉ văn phòng xác nhận*: đơn giản nhưng văn phòng không biết số thực chở; sai số thì phải lập phiếu chuyển ngược.
- *Bắt buộc điện thoại như phiếu xuất*: chuyển công trình thường do xe thuê, không qua bãi, không có thủ kho tại chỗ; bắt buộc sẽ làm chậm.
- *Thực chở được tăng trên M9*: bỏ, vì hợp đồng nhận cần kiểm mã và vượt "còn phải giao" ở văn phòng. Muốn thêm thì văn phòng rút về sửa.

### D2. Chuyển công trình trên sổ kho

- Mỗi (mã + tình trạng): `TRANSFER_OUT` âm ở `from_site_location_id`, `TRANSFER_IN` dương ở `to_site_location_id`, cùng số, đơn giá = giá BQ hiện tại (`pairedWith` như phiếu xuất). Không đổi giá BQ (0.2 #11, #24).
- Rút **Mới trước rồi Tốt** từ "đang ở công trình theo tình trạng" của hợp đồng đi: hàm thuần `allocateTransfer` trong `src/domain/site-transfer.ts`, dùng lại phần rút của `allocateReturn` (tách ra hàm chung `drawNewFirst` trong `src/domain/condition-split.ts` nếu cần, có test).
- `document_type = 'SITE_TRANSFER'`, `document_id = site_transfer.id`.
- **Dùng `TRANSFER_OUT/IN`, không thêm loại mới** (`SITE_TRANSFER_OUT`): loại đã có, chưa ai dùng, nghĩa đúng ("chuyển vị trí"). Phân biệt hai hợp đồng bằng `document_type` + **dấu dòng** (ra thuộc hợp đồng đi, vào thuộc hợp đồng nhận), không bằng vị trí, nên **hai hợp đồng cùng công trình** vẫn đúng (D8).
- Thẻ kho hiện nhãn "Chuyển công trình" khi `document_type = 'SITE_TRANSFER'`.

### D3. Kiểm khi lưu và khi ghi sổ phiếu chuyển

Hàm thuần `assertTransferLines` (`src/domain/site-transfer.ts`) nhận số đang ở công trình của hợp đồng đi, mã trên bản hợp đồng nhận đang áp dụng, "còn phải giao" của hợp đồng nhận, cờ khác nhà thầu và hai ô xác nhận; ném câu đúng spec:

- Hợp đồng đi `RENTAL` + `ACTIVE`; nhận `RENTAL` + `APPROVED`/`ACTIVE`; khác nhau.
- Mã phải có trên `contractTermsAt(nhận, hôm nay)` (dòng theo mã hoặc trong bộ, như `deliveries`).
- Số chuyển > 0, số nguyên với mã tính theo cái, ≤ đang ở công trình (Mới + Tốt).
- Khác `customer_id` → cần `other_customer_confirmed`.
- Vượt còn phải giao của hợp đồng nhận → cần `over_contract_confirmed` (như 0.2 #56).
- Hai ô xác nhận đều làm nhật ký gắn cờ "Có xác nhận bất thường".

Kiểm khi lưu nháp (để báo sớm) và **kiểm lại trong transaction ghi sổ**, vì hàng có thể đã trả về hoặc chuyển đi trong lúc chờ.

### D4. Khóa hai hợp đồng (không deadlock)

`postSiteTransfer(tx, actor, id, input)`:

1. Tìm mã nháp trước (gửi lại → trả phiếu đã có, như `postReturn`).
2. Đọc `from_contract_id`, `to_contract_id` của phiếu (chưa khóa), rồi `lockContract` **hai hợp đồng theo id tăng dần** (`[a, b].sort()`), `FOR UPDATE`.
3. Khóa phiếu `FOR UPDATE` và **đọc lại** `from_contract_id`, `to_contract_id`. Khác cặp đã khóa (lệnh sửa nháp đổi hợp đồng nhận chạy xen giữa bước 2 và 3) → trả **409** "Phiếu vừa được người khác sửa…", không ghi gì. Không thử lại tự động: người bấm tải lại để thấy hợp đồng nhận mới trước khi xác nhận.
4. Kiểm trạng thái (`DRAFT` với văn phòng, `SENT` với M9) và `updatedAt` với văn phòng (409).
5. Đọc đang ở công trình, terms, còn phải giao; `assertTransferLines`.
6. `postMovements`; ghi `site_transfer` `POSTED`, `business_date`, `same_customer`, `posted_by`; hợp đồng nhận `APPROVED` → `ACTIVE`; `logActivity` một dòng.

**Lệnh sửa nháp** theo đúng thứ tự đó: đọc phiếu (chưa khóa) → khóa hợp đồng đi, hợp đồng nhận **cũ** và hợp đồng nhận **mới** theo id tăng dần → khóa phiếu, đọc lại cặp cũ và `updatedAt` (khác → 409) → ghi. Nhờ vậy lệnh sửa và lệnh ghi sổ luôn cùng giữ khóa hợp đồng nhận cũ: một trong hai chờ lệnh kia xong; ghi sổ không bao giờ ghi vào hợp đồng nó chưa khóa. Test: lệnh sửa (B → C) và "Xác nhận chuyển" chạy song song nhiều lần, không lần nào có dòng sổ ở hợp đồng C mà phiếu ghi sổ khi đang khóa A, B.

*Cân nhắc:* khóa phiếu trước rồi mới khóa hợp đồng — bỏ, vì ngược thứ tự chung "hợp đồng → chứng từ" của `postDelivery`, `postReturn`, dễ deadlock với phiếu xuất / thu hồi của cùng hợp đồng.

Mọi lệnh khác chạm một hợp đồng (`postDelivery`, `postReturn`, duyệt mua lại, lập đổi hàng) chỉ khóa **một** hợp đồng rồi chứng từ, nên thứ tự "hợp đồng (id tăng dần) → chứng từ → `lockForPosting`" là thứ tự chung, không có vòng khóa. Hàm nhỏ `lockContractsInOrder(tx, ids)` đặt ở `src/lib/contracts/records.ts`.

"Văn phòng xác nhận ngay" khi phiếu chưa lưu: tạo phiếu và ghi sổ trong **cùng** transaction, chỉ ghi một dòng nhật ký Ghi sổ (spec `site-transfers`).

### D5. Mua lại: giá, duyệt, ngày (điểm cần chốt 2, đã chốt 0.2 #67, chi tiết #71)

- **Giá:** điền sẵn bằng **giá mất** của mã trên bản hợp đồng đang áp dụng **hôm lập phiếu** (`contractTermsAt`), lưu `contract_price` trên dòng để đánh dấu "khác giá hợp đồng". Kinh doanh sửa được `unit_price` (≥ 0). Không có giá mất → bắt buộc nhập.
  - *Cân nhắc:* giá bán trong danh mục (chưa có cột giá bán cho hàng cũ), nhập tay hoàn toàn (dễ sai, không có mốc). Giá mất là số khách đã ký, nên là mốc tốt nhất.
- **Duyệt:** chỉ Giám đốc (quyền mới `buybacks.approve`), như phiếu đền bù: nợ quá hạn → bắt buộc lý do (`overdueDebt`, 0.2 #15); từ chối bắt buộc lý do, không quay lại.
- **Không có trạng thái Nháp:** lưu là Chờ duyệt (như thiết kế D6c "Quốc Bảo gửi lúc…"). Kinh doanh sửa được khi Chờ duyệt, gửi `updatedAt` (409). Lập sai thì Giám đốc từ chối.
- **Duyệt mới ghi sổ:** trong transaction duyệt: khóa hợp đồng → phiếu `FOR UPDATE`; kiểm lại số đang ở công trình; `SALE_OUT` ở vị trí công trình, rút Mới trước rồi Tốt, `document_type = 'BUY_BACK'`; lưu `amount_due` = tổng dòng, `approved_date`, `due_date` = `approved_date + payment_terms_days` của bản hợp đồng tại ngày duyệt (0.2 #18); một dòng nhật ký Duyệt.
- **D6c nhắc Giám đốc:** ngay dưới nút Duyệt hiện "Tính thuê tới khi duyệt: duyệt hôm nay thì tính đến hết <hôm nay>", để thấy duyệt chậm thì khách trả thêm (review PR #138).
- **Tính thuê tới ngày nào:** **ngày duyệt** là ngày "trả" của số hàng đó (tính đến hết ngày duyệt). *Cân nhắc:* ngày lập phiếu (khách nói mua từ hôm đó) — bỏ vì hàng vẫn có thể bị từ chối, sổ kho không ghi lùi được, và phải có một ngày trên sổ. Văn phòng muốn ngừng tính sớm thì gửi duyệt sớm.
- **SALE_OUT ở công trình:** đúng nghĩa "hàng ra khỏi công ty vì bán"; báo cáo doanh thu bán (sau này) đọc `SALE_OUT` của cả phiếu xuất bán và phiếu mua lại. Giá trị kho giảm = số × giá BQ; lãi gộp = tiền bán − giá trị đó (tính ra, không lưu).

### D6. Đổi hàng: ghép phiếu xuất + phiếu thu hồi (điểm cần chốt 3, đã chốt 0.2 #68, chi tiết #72)

**Chọn:** không có chứng từ đổi hàng. Bảng nối `delivery_exchange` (một dòng một lần đổi):

- `delivery_note_id` (unique, bắt buộc): đợt xuất mã giao ra, tạo cùng lúc trên D6d qua đúng hàm tạo đợt của `deliveries` (kiểm mã trên hợp đồng, cước mặc định, vượt còn phải giao).
- `return_note_id` (unique, trống tới khi M4 lưu): phiếu thu hồi mã nhận về.
- `delivery_exchange_line`: mã nhận về và **số dự kiến** (chỉ để hiện và điền gợi ý trên M4).
- `status`: `WAITING` (Chờ thu hồi) → `DONE` (đã nối phiếu thu hồi) hoặc `CANCELLED` (hủy đợt xuất, hoặc "Bỏ chờ thu hồi" có lý do).

Phiếu thu hồi chỉ có trên server khi đã ghi sổ (0.2 #61), nên "phiếu thu hồi chờ" không thể là một dòng `return_note`; bản ghi `delivery_exchange` đóng vai đó. M4 gửi thêm `exchangeId`; `postReturn` (sau khi khóa hợp đồng) khóa `delivery_exchange` `FOR UPDATE`, kiểm cùng hợp đồng, `WAITING`, rồi đặt `return_note_id`, `DONE`. Không ràng buộc số đếm theo số dự kiến. Thứ tự hai phiếu tự do (xe có thể nhận hàng cũ trước khi văn phòng bấm xuất).

**Tiền thuê ngày đổi:** không có quy tắc riêng: mã giao ra tính từ hôm sau ngày giao (phiếu xuất), mã nhận về tính đến hết ngày trả (phiếu thu hồi), 0.2 #4.

**Cân nhắc:** chứng từ đổi hàng riêng ghi `RETURN_*` và `DELIVERY_*` trong một phiếu — bỏ, vì phải làm lại M5 (nhặt), M4 (chia tình trạng, ảnh, đền bù), hai ngày khác nhau (xe rời bãi, xe về bãi) trên một chứng từ, và mọi chỗ đọc "đang ở công trình" thêm một loại chứng từ.

### D7. Quyền

| Lệnh | Quyền |
|---|---|
| Lập, sửa, gửi, rút về, hủy, xác nhận văn phòng phiếu chuyển | `canContract(RENTAL, manage)` trên **cả hai** hợp đồng |
| Mở M9, xác nhận M9 | `deliveries.pick` (Giám đốc, Thủ kho) |
| Lập, sửa phiếu mua lại | `canContract(RENTAL, manage)` |
| Duyệt, từ chối phiếu mua lại | `buybacks.approve` (mới, Giám đốc) |
| Lập đổi hàng, bỏ chờ thu hồi | `canContract(RENTAL, manage)` |
| Xem phiếu chuyển, phiếu mua lại, D6b, D6c, D6d | `canContract(RENTAL, view)` |

Quyền mới thêm vào `PERMISSIONS` (`src/domain/permissions.ts`); route mới bọc `withAuth`, trang gọi `requirePermission` (`route-guards.test.ts`).

### D8. "Đang ở công trình" đọc cả phiếu chuyển và mua lại (điểm cần chốt 4, phần D6)

`siteMovements(tx, contractId)` thêm hai nhánh vào `Promise.all`:

- Phiếu chuyển: dòng `document_type = 'SITE_TRANSFER'` của phiếu có `from_contract_id = contractId` **và `quantity < 0`**, cộng dòng của phiếu có `to_contract_id = contractId` **và `quantity > 0`**. Không lọc theo vị trí để hai hợp đồng cùng công trình vẫn tách đúng.
- Phiếu mua lại: dòng `document_type = 'BUY_BACK'` của phiếu thuộc hợp đồng (chỉ có dòng khi đã duyệt).

`onSiteByItem`, `onSiteByItemCondition`, "còn phải giao", M4, D6, kiểm phiếu thu hồi đều tự đúng vì cùng đi qua hàm này. Test hồi quy: các ca của `returns` và `deliveries` vẫn xanh.

**D6** (bảng hàng ở công trình): cột từ `movement`: "Đã xuất" `DELIVERY_IN`; "Chuyển đến" `TRANSFER_IN`; "Đã trả" `RETURN_OUT`; "Chuyển đi" `TRANSFER_OUT`; "Mua lại" `SALE_OUT`; "Mất" `LOSS_OUT`. Ba cột mới chỉ hiện khi khác 0 để D6 của hợp đồng thường không đổi (ảnh mốc D6 hiện có giữ nguyên). Dòng thời gian thêm phiếu chuyển (đi / đến), phiếu mua lại, nhãn "Đổi hàng" (spec `deliveries`, `site-exchanges`).

### D9. Dữ liệu (migration `drizzle/0017_site_operations.sql`)

- `site_transfer`: `id`, `code` unique (`CCT`), `from_contract_id`, `to_contract_id` (FK `contract`, `RESTRICT`, check khác nhau), `from_site_location_id`, `to_site_location_id` (FK `location`), `status` check (`DRAFT`, `SENT`, `POSTED`, `CANCELLED`), `confirm_mode` (`OFFICE`, `PHONE`), `vehicle_plate`, `note`, `other_customer_confirmed`, `over_contract_confirmed` (bool), `same_customer` (bool, null tới khi ghi sổ; 0.2 #70), `posted_xact` (`xid8`, null tới khi ghi sổ), `cancelled_reason` (bắt buộc khi `CANCELLED`), `client_draft_id` unique, `posting_id`, `business_date`, `confirmed_on_device_at`, `posted_by`, `posted_at`, `created_by`, `created_at`, `updated_at`.
- `site_transfer_line`: `transfer_id`, `line_no`, `item_id`, `planned_quantity` (số văn phòng ghi, > 0), `moved_quantity` (thực chở, null tới khi ghi sổ, 0 ≤ moved ≤ planned).
- `buy_back_note`: `id`, `code` unique (`MLA`), `contract_id`, `site_location_id`, `revision_id` (bản lúc lập, lấy giá mất), `status` (`PENDING`, `APPROVED`, `REJECTED`), `reason` (bắt buộc), `approval_reason`, `rejected_reason`, `amount_due`, `approved_by`, `approved_at`, `approved_date`, `due_date`, `posting_id`, `created_by`, `created_at`, `updated_at`; check `APPROVED` ⇒ `amount_due`, `approved_date`, `due_date` có giá trị.
- `buy_back_note_line`: `note_id`, `line_no`, `item_id`, `quantity` (> 0), `unit_price` (bigint ≥ 0), `contract_price` (bigint, null khi hợp đồng không có giá mất).
- `delivery_exchange`: `id`, `contract_id`, `delivery_note_id` unique, `return_note_id` unique null, `status` (`WAITING`, `DONE`, `CANCELLED`), `cancelled_reason`, `created_by`, `created_at`, `updated_at`; check `DONE` ⇔ `return_note_id` có giá trị.
- `delivery_exchange_line`: `exchange_id`, `item_id`, `expected_quantity` (> 0).
- Trigger: `site_transfer_frozen`: phiếu `POSTED`/`CANCELLED` và dòng con không sửa, không xóa. Cột `posted_xact xid8` trên `site_transfer` đặt bằng `pg_current_xact_id()` khi phiếu sang `POSTED` (cùng câu UPDATE). Trigger dòng con cho UPDATE **chỉ cột `moved_quantity`** của phiếu `POSTED` khi `parent.posted_xact = pg_current_xact_id()`, tức chỉ trong chính transaction ghi sổ; transaction khác bị chặn. Cùng cách so mã transaction như `return_note.created_xact` (`drizzle/0016_returns.sql`), không so giờ, nên `options.now` khác giờ DB vẫn ghi được. Thứ tự trong `postSiteTransfer`: UPDATE phiếu sang `POSTED` (đặt `posted_xact`) rồi mới UPDATE `moved_quantity`.
- Trigger khác: `buy_back_note_frozen` (như `compensation_note_frozen`), `delivery_exchange_frozen` (`DONE`/`CANCELLED` không đổi).
- Check `activity_log.document_type` thêm `SITE_TRANSFER`, `BUY_BACK`; check `action` thêm `SEND` ("Gửi điện thoại", nhóm "Duyệt, ghi sổ", không vào ô Duyệt / ghi sổ).
- Mọi bảng mới: CRUD cho `erp_app` qua `src/db/grants.ts`, không vào `APPEND_ONLY_TABLES`. Mã `CCT`, `MLA` đếm bằng `document_counter` (0.2 #33), không `CREATE SEQUENCE`.

### D10. API và trang

| Route | Việc |
|---|---|
| `POST /api/site-transfers` | lập (nháp) hoặc lập + xác nhận ngay (`confirm: true`) |
| `PUT /api/site-transfers/[id]` | sửa nháp (`updatedAt`) |
| `POST /api/site-transfers/[id]/send` · `/pull-back` · `/cancel` · `/post` | gửi điện thoại, rút về, hủy (lý do), văn phòng xác nhận |
| `GET /api/m/site-transfers/[code]` · `POST …/post` | M9 đọc (không giá) và xác nhận (`clientDraftId`, `lines[].moved`, `vehiclePlate`, `confirmedOnDeviceAt`) |
| `POST /api/buy-backs` · `PUT /api/buy-backs/[id]` | lập, sửa (`updatedAt`) |
| `POST /api/buy-backs/[id]/approve` · `/reject` | duyệt (lý do khi nợ quá hạn), từ chối (lý do) |
| `POST /api/exchanges` · `POST /api/exchanges/[id]/cancel` | lập đổi hàng (đợt + chờ thu hồi), bỏ chờ thu hồi |
| `POST /api/m/returns` | thêm trường tùy chọn `exchangeId` |

Trang: `/sales/contracts/[id]/site-transfer/new` và `/sales/site-transfers/[code]` (D6b), `/sales/contracts/[id]/buy-back/new` và `/sales/buy-backs/[code]` (D6c), `/sales/contracts/[id]/exchange/new` (D6d), `/m/site-transfers/[code]` (M9). Ô ngày (nếu có, VD ngày dự kiến của đổi hàng) dùng `DateInput`. Nháp M9 là loại mới `TRANSFER` trong `src/lib/drafts/`.

### D11. Ảnh hưởng tới `rental-billing` (điểm cần chốt 4, phần tiền thuê)

`rental-billing` (change sau) tính tiền thuê từ dòng sổ tại công trình của hợp đồng, lấy qua cùng nguồn với `siteMovements`. Change này chốt nghĩa từng loại dòng với hợp đồng:

| Dòng (thuộc hợp đồng theo D8) | Với tiền thuê |
|---|---|
| `DELIVERY_IN` (phiếu xuất), `TRANSFER_IN` (phiếu chuyển tới) | giao: tính từ **hôm sau** ngày nghiệp vụ |
| `RETURN_OUT`, `LOSS_OUT` (phiếu thu hồi), `TRANSFER_OUT` (phiếu chuyển đi), `SALE_OUT` (phiếu mua lại) | trả: tính **đến hết** ngày nghiệp vụ; `TRANSFER_OUT` cùng nhà thầu không áp tối thiểu (dưới) |

- Thuê tối thiểu 45 ngày (0.2 #70), đọc từ `site_transfer.same_customer`:
  - **cùng nhà thầu**: phần hàng chuyển **không áp tối thiểu ở hợp đồng đi** (chỉ số ngày thật tới hết ngày chuyển), vì khách thuê liên tục;
  - **khác nhà thầu**: áp riêng từng hợp đồng (hợp đồng đi coi như trả, hợp đồng nhận coi như giao);
  - cách gộp chuỗi thuê nối tiếp khi tính tối thiểu ở **hợp đồng nhận** (cùng nhà thầu) do `rental-billing` chốt cùng 0.2b Q2; change này chỉ lưu cờ và ngày.
- Hàng mua lại áp tối thiểu như hàng trả về, ngày trả = ngày duyệt (0.2 #71).
- Hai ngày cùng một hôm (chuyển đi rồi chuyển lại, đổi hàng cùng ngày) không tính trùng: ngày đó chỉ tính cho bên "trả".
- Ngày tính thuê lấy `business_date` của chứng từ (0.2 #55), không lấy giờ bấm trên máy.
- Change này chỉ thêm hàm đọc "tiền thuê 1 ngày" cho D6, D6b, D6c, D6d (số đang ở công trình × giá ngày của bản đang áp dụng), không tính kỳ.

### D12. Nhật ký

Một dòng mỗi lệnh (spec `activity-log`), qua `logActivity(tx, actor, …)` trong transaction. Tóm tắt dùng hàm thuần mới trong `src/domain/activity-summary.ts`:

- Phiếu chuyển Ghi sổ: "<đi> → <nhận> · 50 khung, 36 chéo · chở ít hơn 4 cái".
- Phiếu mua lại Duyệt: "Mua lại 20 ty ren, 50 bát chuồn · 1.300.000 ₫".
- Lập đổi hàng: dòng Tạo của phiếu xuất "Đổi hàng · Đợt 4 · giao … · nhận về dự kiến …".

`coverage.test.ts` bắt hàm ghi mới quên gọi `logActivity`.

## Risks / Trade-offs

- [`siteMovements` thêm hai nhánh làm D6 chậm] → bốn truy vấn nhóm chạy song song, đều có chỉ mục (`inventory_ledger(document_type, document_id)` đã có); số dòng mỗi hợp đồng nhỏ.
- [Phiếu chuyển nháp để lâu, hàng đã trả về bãi] → kiểm lại khi ghi sổ, báo câu rõ, phiếu vẫn Nháp để văn phòng sửa.
- [Mua lại chờ duyệt lâu, vẫn tính thuê] → đúng chủ ý (D5); D6 hiện phiếu Chờ duyệt trong dòng thời gian để kế toán nhắc Giám đốc.
- [Đổi hàng Chờ thu hồi bị quên] → D6 hiện "Chờ thu hồi"; văn phòng "Bỏ chờ thu hồi" khi khách giữ hàng.
- [Thủ kho bỏ tích "hàng đổi" trên M4] → phiếu thu hồi vẫn đúng sổ; chỉ mất liên kết. Không chặn.
- [Hai hợp đồng khác nhà thầu: tài sản sang người khác] → bắt buộc tích, nhật ký gắn cờ, Giám đốc thấy trên D18.

## Migration Plan

1. `npm run db:migrate` chạy `0017_site_operations.sql` (chỉ thêm bảng, trigger, mở rộng check). Không sửa dữ liệu cũ, không có dòng sổ cũ nào thuộc loại chứng từ mới.
2. Seed dev thêm: một phiếu chuyển Chờ xác nhận (M9), một phiếu mua lại Chờ duyệt (D6c), một đổi hàng Chờ thu hồi (D6d) trên hợp đồng mẫu An Phú – Block B, cùng hợp đồng nhận Dương Nội.
3. Rollback: bỏ deploy; bảng mới không được đọc bởi code cũ. Nếu đã có phiếu ghi sổ thì không rollback DB (sổ chỉ ghi thêm), sửa tiến.

## Open Questions

- In phiếu chuyển, phiếu mua lại: chưa cần ở MVP; kế toán cần thì thêm sau theo mẫu in phiếu xuất (không đổi spec của change này).
