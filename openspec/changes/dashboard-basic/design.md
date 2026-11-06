# Design: dashboard-basic

## Context

- `/dashboard` đang là `PlaceholderPage`, gọi `requirePermission("dashboard.view")` (Giám đốc, Kế toán, Kinh doanh). Thủ kho, Xưởng mở Desktop đã bị chuyển `/m` (spec `app-shell`).
- Mọi số D1 cần đã có nguồn:
  - Tiền thuê: `loadBillingSource` + `statementOf` (`src/lib/billing/compute.ts`), kỳ đã chốt ở `billing_period`, `billing_period_line`, `billing_period_freight` (chỉ ghi thêm).
  - Hàng bán: `deliveredAmounts` (`src/lib/deliveries/amounts.ts`): tiền hàng + cước theo ngày giao.
  - Công nợ: `readLedgers` / `customerBalances` (`src/lib/receivables/balances.ts`), quá hạn theo ngày Việt Nam (`overdueOf`).
  - Hàng ở công trình: `siteMovements` / `onSiteByItem` (`src/lib/deliveries/records.ts`), cột "Tại công trình" của D10 (`getStockOverview`).
  - Khu vực: `regionOf(site.province)` (`src/domain/province.ts`), `UNKNOWN_REGION_LABEL` khi công trình chưa có tỉnh.
  - Chứng từ chờ duyệt: `contract_revision.status = 'PENDING'`, `compensation_note.status = 'PENDING'`, `buy_back_note.status = 'PENDING'`, `stocktake.status = 'SUBMITTED'`, `stock_adjustment.status = 'PENDING_APPROVAL'`.
- Quyết định nghiệp vụ: 0.2 #90 (doanh số theo phát sinh), #91 (ai thấy tiền), #92 (công trình rủi ro), #93 (top 5).
- Bản vẽ: `docs/design/screens/Main.dc.html` (1366px). Hex trong bản vẽ đổi sang token.

## Goals / Non-Goals

**Goals**
- Một màn đọc, số **khớp từng đồng / từng cái** với màn gốc (D7, D10, D14, D6).
- Không có cách tính thứ hai: mọi số đi qua hàm đã có hoặc hàm thuần mới trong `src/domain/dashboard.ts` có unit test.
- Vai trò không có quyền **không nhận** số tiền từ server (không chỉ ẩn khối).

**Non-Goals**
- Không bảng mới, không lưu số "cộng dồn", không cache (D2).
- Không lợi nhuận, không xếp hạng đầy đủ (Bản 2).

## Decisions

### D1. Vai trò × khối, quyền (điểm cần chốt 1)

**Không thêm quyền.** Dùng lại:

| Quyền | Ai | Dùng cho |
|---|---|---|
| `dashboard.view` | GĐ, KT, KD | mở trang |
| `receivables.view` | GĐ, KT | mọi khối có tiền (0.2 #91 trùng đúng tập này) |
| `inventory.view` | GĐ, KT, KD | tồn kho theo tình trạng |
| `canContract(user, "RENTAL", "view")` | GĐ, KT, KD (theo phạm vi) | công trình rủi ro, tra nhanh, hàng ở ngoài |
| quyền duyệt từng loại | xem dưới | khối chờ duyệt |

| Khối | Giám đốc | Kế toán | Kinh doanh |
|---|---|---|---|
| Câu chào + số việc | ✔ "chờ bạn duyệt" | ✔ "đang chờ Giám đốc duyệt" | ✔ "đang chờ Giám đốc duyệt" |
| Chờ duyệt (danh sách) | ✔ cả 5 loại | ✔ HĐ/phụ lục, đền bù, mua lại, kiểm kê, điều chỉnh kho | ✔ HĐ/phụ lục trong `canContract`, đền bù, mua lại (khi xem được HĐ thuê) |
| Công nợ quá hạn | ✔ | ✔ | ✘ |
| Doanh số tháng / ngày, đền bù + mua lại | ✔ | ✔ | ✘ |
| Hàng ở ngoài (cái, tấn, khu vực) | ✔ | ✔ | ✔ (toàn công ty, không có tiền) |
| Công trình rủi ro | ✔ | ✔ | ✔ chỉ hợp đồng trong `canContract`, dấu hiệu nợ chỉ hiện số ngày, không số tiền |
| Tra nhanh công trình | ✔ đủ | ✔ đủ | ✔ không có dòng tiền; chỉ hợp đồng trong `canContract` |
| Tồn kho theo tình trạng | ✔ | ✔ | ✔ (chỉ số lượng, như D10 không có giá trị) |
| Top 5 nhà thầu | ✔ | ✔ | ✘ (cả hai cách xếp; theo kg cũng lộ quy mô từng khách ngoài phạm vi) |
| Thủ kho, Xưởng | chuyển `/m` như hiện nay (spec `app-shell`), không đổi |

- **Chờ duyệt.** Mọi loại chờ duyệt hiện nay chỉ Giám đốc duyệt (`contracts.approve`, `compensations.approve`, `buybacks.approve`, `inventory.approve`). Nếu chỉ hiện "việc bạn duyệt được" thì Kế toán, Kinh doanh luôn thấy 0, khối vô ích. Đề xuất: Giám đốc thấy "chờ bạn duyệt"; vai trò khác thấy **"đang chờ Giám đốc duyệt"** trong phạm vi xem được (Kế toán theo dõi điều chỉnh kho, kiểm kê vì có `inventory.adjust`; Kinh doanh theo dõi hợp đồng mình làm). Câu chào đổi theo: "Chào Thu Hà, có 3 việc đang chờ Giám đốc duyệt". Số trên câu chào = số dòng của khối (cùng một hàm đếm). **Hỏi anh trong PR (Q1).**
- Số tiền trên dòng chờ duyệt là số đã hiện ở màn gốc mà người xem vốn xem được: hợp đồng = **giá trị dự kiến** (spec `contracts`), phụ lục = giá trị dự kiến của phụ lục, đền bù = số phải trả sau giảm trừ, mua lại = tổng tiền, kiểm kê / điều chỉnh = chênh lệch giá trị. Kinh doanh không có `inventory.*` nên không thấy hai loại cuối.
- **Kiểm ở server**: hàm đọc `dashboardFor(viewer, today)` nhận người xem và **không gọi** hàm tính tiền khi thiếu quyền; kiểu trả về để trường tiền là `undefined`. Route tra nhanh lọc ở server. Test integration kiểm payload của Kinh doanh không có trường tiền.

Phương án đã cân nhắc: (a) quyền mới `dashboard.money` — trùng nghĩa `receivables.view`, thêm một chỗ phải giữ khớp; (b) ẩn khối bằng CSS — vi phạm "phân quyền ở server".

### D2. Doanh số thuê theo ngày: tính lại mỗi lần, không cache (điểm cần chốt 2)

**Cách tính** (spec `sales-revenue`):
- Mỗi (hợp đồng thuê, tháng): kỳ **đã chốt** → đọc bảng chụp (`billing_period_line`, `billing_period_freight`); kỳ **mở** → `statementOf(source, month, today, holidays)` như D7.
- Chia một bảng kê thành từng ngày bằng hàm thuần `dailyRevenue(statement)` (`src/domain/dashboard.ts`):
  - dòng `RENT`: tiền dòng chia đều cho các **ngày tính** (từ Từ đến Đến, bỏ ngày nghỉ), phần lẻ theo phần dư lớn nhất để tổng khớp từng đồng;
  - dòng `MINIMUM` (bù tối thiểu): cả dòng vào **ngày trả** (Đến);
  - dòng `ADJUSTMENT`: vào **ngày cuối kỳ** (kỳ đang chạy: ngày `asOf`), như 0.2 #79;
  - cước của hợp đồng thuê: vào **ngày giao**, cộng vào cột Thuê (cước nằm trong bảng kê kỳ; để tổng tháng khớp "tổng chưa VAT của kỳ").
- Tổng các ngày của một (hợp đồng, tháng) = `beforeVat` của bảng kê (= `rent + adjustment + freight` của kỳ đã chốt). Test kiểm đẳng thức này.
- Bán: `saleTotal + freight` của phiếu xuất bán đã ghi sổ, vào ngày giao.

**Không cache.** Trang `await connection()`, tính mỗi lần mở.
- Lý do: số đổi theo mọi chứng từ (phiếu xuất, thu hồi, chuyển, mua lại, chốt kỳ, ngày nghỉ); gắn `revalidateTag` vào hàng chục đường ghi dễ sót, số sai còn tệ hơn số chậm. Khóa `"use cache"` sau này phải gồm công ty (0.2 #33): khi có SaaS thêm cache thì làm một lần, khóa `[companyId, "dashboard", today]`.
- **Khối lượng**: vài trăm hợp đồng thuê, một năm sổ kho (~vài chục nghìn dòng). Đọc **theo lô**, không theo từng hợp đồng: thêm `loadBillingSources(db, contractIds)` gom mỗi nguồn (sổ kho công trình, giá, cước, điều chỉnh, kỳ đã chốt) một truy vấn cho cả lô rồi dựng `BillingSource` như cũ; tính thuần trong bộ nhớ. Chỉ nạp hợp đồng thuê có dòng sổ / cước trước cuối khoảng xem và chưa thanh lý trước đầu khoảng.
- Khoảng xem: 6 tháng (tháng này + 5 tháng trước) cho biểu đồ tháng, tháng này cho theo ngày. Tháng đã chốt hết thì không nạp sổ kho của tháng đó (đọc bảng chụp).
- **Mục tiêu**: phần đầu trang (câu chào, chờ duyệt) hiện < 1 s; khối doanh số < 2,5 s với 300 hợp đồng, 12 tháng. Mỗi khối trong `<Suspense>` riêng nên khối chậm không chặn khối nhanh. Đo bằng script `scripts/bench-dashboard.mts` trên DB dev có dữ liệu sinh (không chạy trên CI).
- **Chỉ mục mới** (một migration, chỉ thêm chỉ mục):
  - `billing_period_month_idx (month)`: đọc kỳ đã chốt của mọi hợp đồng theo tháng.
  - `delivery_note_posted_date_idx (business_date) WHERE status = 'POSTED'`: doanh số bán theo ngày, top theo kg.
  - `inventory_ledger_movement_date_idx (movement, business_date)`: hàng mất (`LOSS_OUT`) trong 30 ngày.
  - Các chỉ mục theo hợp đồng (`delivery_note_contract_idx`, `return_note_contract_idx`, `site_transfer_from/to_idx`, `buy_back_note_contract_idx`, `billing_adjustment_contract_idx`) và theo trạng thái chờ duyệt đã có.

Phương án đã cân nhắc: (a) bảng tổng hợp doanh số theo ngày ghi khi chốt / ghi sổ — trái nguyên tắc "tính từ sổ kho, không lưu số cộng dồn"; (b) `"use cache"` 5 phút — số chờ duyệt và nợ lệch với màn gốc ngay sau khi người dùng vừa duyệt; (c) tính từng hợp đồng tuần tự bằng `loadBillingSource` — ~5 truy vấn × 300 hợp đồng, quá chậm.

### D3. "Theo kg" của top 5 (điểm cần chốt 3)

Đề xuất: **kg hàng đã giao trong năm** = Σ trên phiếu xuất đã ghi sổ (thuê và bán) có ngày giao từ 01/01 đến hôm nay: số lượng × trọng lượng chuẩn; dòng có kg cân (`weighed_kg`) hoặc mã tính theo kg thì dùng kg đó. Hàng thu hồi không trừ. Hiện tấn (1 chữ số lẻ).
- Lý do: đo **khối lượng làm ăn** trong năm, cùng gốc "theo phát sinh" với doanh thu; dễ đối chiếu với phiếu xuất; không phụ thuộc giá.

Phương án đã cân nhắc:
- **kg đang giữ hôm nay**: ảnh chụp tức thời, không phải "năm nay", khách vừa trả hết rơi khỏi bảng.
- **kg-ngày thuê** (tấn × ngày): sát tiền thuê nhất nhưng đơn vị khó đọc, gần như trùng thứ tự với doanh thu thuê.

**Hỏi anh trong PR (Q2).** Khi anh chốt, ghi 0.2 #94 trong PR này.

### D4. "Số liệu lúc HH:MM" và làm mới (điểm cần chốt 4)

- Giờ ghi = lúc server tính trang (giờ Việt Nam, `HH:MM`).
- Cạnh giờ có nút **"Làm mới"** (`router.refresh()`): tính lại cả trang, không tải lại khung. Tải lại trình duyệt cũng tính lại.
- **Không tự làm mới.** Lý do: D1 nặng nhất hệ thống (D2), tự làm mới mỗi vài phút × số máy văn phòng là tải vô ích; số không đổi theo phút. Tab mở lâu thì giờ cũ hiện rõ để người xem bấm.

Phương án đã cân nhắc: tự làm mới 5 phút (tải nền vô ích, số nhảy khi đang đọc); làm mới khi tab quay lại (`visibilitychange`) — để Bản 2 nếu cần.

### D5. Công trình có nhiều hợp đồng (điểm cần chốt 5)

- Một công trình có thể có nhiều hợp đồng thuê (nhiều nhà thầu, 0.2 #66–#68). Dấu hiệu rủi ro thuộc **hợp đồng** (nợ quá hạn của nhà thầu ở hợp đồng đó, hàng mất trên phiếu thu hồi của hợp đồng, ngày kết thúc của hợp đồng).
- **Rủi ro**: tính theo hợp đồng, **gom theo công trình**: một dòng một công trình, dưới tên công trình là từng hợp đồng có dấu hiệu (nhà thầu · số hợp đồng · dấu hiệu). Số trên ô "Công trình rủi ro" = số **công trình** có ít nhất một hợp đồng rủi ro; khớp tiêu đề khối.
- **Tra nhanh**: kết quả là **công trình**; thẻ công trình hiện tổng hàng đang giữ của công trình (mọi hợp đồng người xem xem được) và **từng hợp đồng** một dòng (nhà thầu, số, ngày ký, trạng thái, đang giữ, tiền thuê tháng này tạm tính, đang nợ, cọc). Gõ tên nhà thầu → các công trình có hợp đồng của nhà thầu đó.
- "Đang nợ" của một hợp đồng = còn lại của các khoản nợ có `contractId` đó (kỳ thuê, đền bù, mua lại), kèm "quá hạn N ngày" / "chưa quá hạn". Tiền trả trước và cọc thuộc nhà thầu / hợp đồng như D14, không chia lại.
- Kinh doanh: hợp đồng ngoài `canContract` bị bỏ khỏi cả rủi ro và tra nhanh; công trình chỉ có hợp đồng ngoài phạm vi thì coi như không tìm thấy.

Phương án đã cân nhắc: gom tiền theo công trình (cộng nợ nhiều nhà thầu) — sai về pháp lý, mỗi nhà thầu nợ riêng; một dòng mỗi hợp đồng ở khối rủi ro — số dòng lệch với số "công trình" trên ô tổng.

### D6. Ảnh mốc D1 (điểm cần chốt 6)

- Số trên D1 đổi theo ngày chạy và theo dữ liệu E2E. Mỗi khối có **chiều cao cố định** (danh sách cuộn bên trong, tối đa: chờ duyệt 5 dòng, rủi ro 5, tồn kho 6 mã, top 5) để số dòng thay đổi không xô bố cục.
- Gắn `data-mask`: mọi ô số (tiền, cái, tấn, số việc, số công trình, ngày, "lúc HH:MM"), thân danh sách chờ duyệt, rủi ro, top 5, bảng tồn kho, khu vực, vùng cột biểu đồ, tên người trong câu chào.
- Chụp được (không mask): khung, tiêu đề khối, nhãn, chú thích, nút "Theo tháng / Theo ngày", "Doanh thu / Theo kg", ô tra nhanh ở trạng thái trống.
- Hai ảnh mốc: **Giám đốc** (đủ khối) và **Kinh doanh** (không có khối tiền), để bắt lỗi lộ khối theo vai trò.
- Số tiền, số lượng kiểm bằng integration test và E2E theo chênh lệch, không bằng ảnh.

### D7. Bố cục và component

- Theo bản vẽ: hàng 4 ô số (Công nợ quá hạn là ô màu chính, Doanh số tháng, Hàng ở ngoài, Công trình rủi ro) → Tra nhanh → Doanh số (biểu đồ cột chồng Thuê / Bán, chuyển tháng / ngày) + Tồn kho → Top 5 + Chờ duyệt → Công trình rủi ro + Hàng ở ngoài theo khu vực.
- Vai trò thiếu khối: lưới tự dồn, không để ô trống.
- Biểu đồ: cột chồng vẽ bằng SVG trong component (không thêm thư viện, spec "Không tự thêm thư viện UI").
- Ô tra nhanh: gõ ≥ 2 ký tự, debounce 250 ms, gọi `GET /api/dashboard/site-lookup?q=`, tối đa 8 kết quả, chọn bằng bàn phím.
- Tiền viết `1.250.000 ₫`; biểu đồ tháng viết gọn "278,4 tr"; tấn 1 chữ số lẻ (spec `domain-values`).

### D8. API

`GET /api/dashboard/site-lookup?q=<text>` (`withAuth`, quyền `dashboard.view` + `canContract(RENTAL, view)`):

```json
{ "ok": true, "data": { "sites": [ {
  "siteId": "…", "code": "CT-0007", "name": "Chung cư An Phú – Block B",
  "provinceName": "Hà Nội", "regionLabel": "Miền Bắc",
  "onSite": { "pieces": 1240, "kg": 18600 },
  "contracts": [ {
    "id": "…", "code": "082026/ANPHAT-MINHPHAT", "customerName": "Cty TNHH Xây dựng Minh Phát",
    "signedDate": "2026-08-01", "status": "ACTIVE",
    "onSite": { "pieces": 1240, "kg": 18600 },
    "money": { "rentThisMonth": 4560000, "rentAsOf": "2026-11-06",
               "owed": 33050000, "overdue": { "amount": 0, "days": 0 },
               "depositAgreed": 50000000, "depositReceived": 50000000 }
  } ] } ] } }
```

- `money` **không có** trong JSON khi người xem thiếu `receivables.view`.
- `q` < 2 ký tự → `{ sites: [] }`; > 100 ký tự → 400.
- Tìm theo `search_text` của công trình và nhà thầu (không dấu, như danh mục).

Các khối khác đọc trong Server Component, không có API riêng.

## Risks / Trade-offs

- [Trang chậm khi dữ liệu lớn] → đọc theo lô, chỉ mục D2, `<Suspense>` từng khối, script đo; nếu vượt mục tiêu thì change sau thêm cache có khóa công ty.
- [Doanh số lệch D7] → dùng đúng `statementOf` và bảng chụp, test đẳng thức tổng ngày = `beforeVat`; `npm run billing:check` vẫn đối chiếu kỳ đã chốt.
- [Lộ tiền cho Kinh doanh] → hàm đọc không tính tiền khi thiếu quyền, test payload, ảnh mốc riêng cho Kinh doanh.
- [Chia tiền dòng thuê theo ngày có phần lẻ] → phần dư lớn nhất, tổng khớp từng đồng (như `landed-cost`).

## Migration Plan

- Một migration chỉ `CREATE INDEX` (3 chỉ mục D2). Không đổi dữ liệu. Lùi lại: `DROP INDEX`.
- Thay trang giữ chỗ `/dashboard`; không đổi đường dẫn.

## Open Questions

Hỏi anh trong mô tả PR; trả lời xong ghi `docs/requirements.md` 0.2 (#94 trở đi) ngay trong PR này:
- **Q1** Kế toán, Kinh doanh thấy "đang chờ Giám đốc duyệt" (đề xuất) hay ẩn khối chờ duyệt?
- **Q2** "Theo kg" của top 5 = kg hàng đã giao trong năm (đề xuất), kg đang giữ, hay tấn-ngày?
- **Q3** Cước của hợp đồng thuê cộng vào cột **Thuê** (đề xuất, để tháng khớp tổng chưa VAT của kỳ) hay cột **Bán** (theo câu chữ "bán = hàng bán + cước" của 0.2 #90)?
- **Q4** Kinh doanh thấy khối Hàng ở ngoài cho **toàn công ty** (đề xuất, không có tiền) hay chỉ hợp đồng trong phạm vi?
