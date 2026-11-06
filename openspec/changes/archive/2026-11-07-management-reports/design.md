# Design: management-reports

## Context

Lý do làm và phạm vi: xem `proposal.md`. Phần này chỉ nêu những gì đang có mà thiết kế dựa vào.

- **Doanh số D1** (`src/lib/dashboard/revenue.ts`, `revenueBook`):
  - thuê theo ngày, từ bảng chụp kỳ đã chốt hoặc `statementOf` của kỳ mở;
  - bán theo ngày giao;
  - đền bù và mua lại theo ngày duyệt, gộp chung một danh sách `separate`, không ghi loại.
- **Sổ kho** (`inventory_ledger`): mỗi dòng có `movement`, `document_type`, `amount` có dấu (ra âm, vào dương), `business_date` là ngày Việt Nam. Ghi sổ không bao giờ lùi ngày.
  - Phiếu thu hồi ghi `RETURN_OUT` (giá BQ Mới, Tốt), `RETURN_IN` (giá BQ tình trạng nhận) và `LOSS_OUT`.
  - Phiếu sửa ghi `REPAIR_OUT` (B) và `REPAIR_IN`. Giá trị vào Tốt = sửa xong × B + chi phí sửa + phần hỏng (0.2 #23). Dòng lưu `repair_cost` và `loss_amount` (lỗ hỏng hàng).
  - Kiểm kê (`STOCKTAKE`) và phiếu điều chỉnh (`ADJUSTMENT`) ghi `ADJUST_*` theo giá BQ.
  - Tồn đầu kỳ ghi `OPENING`. `ĐCG` ghi `REVALUE`: số lượng 0, `location_id` trống.
  - Xuất bán và mua lại ghi `SALE_OUT`.
- **Top 5 của D1** (`src/lib/dashboard/top.ts`): `revenueByCustomer`, `kgByCustomer`, `topCustomers(rows, limit)`.
- **Quyền**:
  - `reports.view` đã có trong bảng quyền, hiện chỉ Giám đốc.
  - Menu "Báo cáo" (`/reports`) đã có. Trang `/reports` là trang giữ chỗ duy nhất còn lại.
- **Tốc độ**: `bench:dashboard` đo khối Doanh số 6 tháng (300 hợp đồng, một năm sổ, chưa kỳ nào chốt) mất 184 ms.

## Goals / Non-Goals

**Goals:**
- Mọi số tính ra từ sổ kho và chứng từ mỗi lần xem, không cache, không lưu.
- Tiền thuê và bán khớp D1 vì **gọi cùng hàm**, không viết lại.
- Giá vốn và hao hụt có một **đẳng thức đối chiếu với sổ kho**, để test bắt được trừ hai lần hay bỏ sót.
- Kỳ năm tải dưới 2,5 s trên dữ liệu đo.

**Non-Goals:**
- Lưu hoặc chốt số báo cáo.
- Bảng tổng hợp theo tháng.
- Cache giữa các lần xem.
- Lợi nhuận ròng.
- Báo cáo theo công trình hay theo hợp đồng.

## Decisions

### D1. Không tính hai lần: sửa chữa và phế liệu (điểm cần chốt 1)

**Nguyên tắc.** Giá trị kho là "kho chứa" của giá vốn. Mỗi đồng vào kho (nhập mua, tồn đầu, `ĐCG`, chi phí sửa) chỉ thành giá vốn **một lần**: lúc nó rời kho hoặc bị ghi giảm. Ba trường hợp rời kho hoặc ghi giảm:
- bán, mua lại;
- mất;
- trả về tình trạng rẻ hơn, kiểm kê thiếu, điều chỉnh.

Phiếu sửa ghi **cộng** chi phí sửa vào giá hàng Tốt (0.2 #23). Nếu báo cáo trừ chi phí sửa ngay khi ghi sổ phiếu sửa, thì khi chính hàng đó bán, mất hay hỏng lại, giá BQ (đã gồm chi phí sửa) bị trừ lần thứ hai.

**Đề xuất.** Ghi nhận như sau:
- Khoản **"Sửa chữa"** của kỳ = **lỗ hỏng hàng** của phiếu sửa ghi sổ trong kỳ. Đây là phần giá trị mất hẳn khi cả dòng hỏng, sổ đã ghi giảm.
- **Chi phí sửa không trừ ngay.** Nó đã thành giá trị hàng Tốt, sẽ vào giá vốn khi hàng rời kho.
- Báo cáo **vẫn hiện** "Chi phí sửa đã chi trong kỳ: x ₫" ngay dưới bảng, để Giám đốc thấy tiền sửa.
- Phần hỏng mà hàng sửa xong gánh thêm cũng nằm trong giá Tốt, nên theo cùng luật này.

**Ví dụ số** (giả sử công ty chỉ có 10 `H1,7` Tốt, giá BQ 400.000 ₫):

| Tháng | Việc | Sổ kho | Báo cáo trừ |
|---|---|---|---|
| 10 | Trả về 10 cái Chờ sửa (giá BQ Chờ sửa 250.000 ₫) | −4.000.000 / +2.500.000 | Giảm giá trị **1.500.000** |
| 11 | Sửa 10 cái, chi phí 500.000 ₫, vào Tốt 300.000 ₫/cái | −2.500.000 / +3.000.000 | Sửa chữa **0** (ghi chú "đã chi 500.000") |
| 12 | 10 cái mất ở công trình | −3.000.000 | Hàng mất **3.000.000** |
| | **Cộng** | | **4.500.000** = 4.000.000 giá trị đầu + 500.000 chi phí sửa |

Nếu trừ chi phí sửa ngay ở tháng 11, tổng sẽ là 5.000.000: 500.000 bị trừ hai lần.

**Phế liệu bán đi.** Ví dụ 4 `GG-K17` Tốt 400.000 ₫:
- Tháng 10 trả về thành Phế liệu 60.000 ₫: báo cáo trừ giảm giá trị 1.360.000.
- Tháng 11 bán 4 cái đó: `SALE_OUT` 240.000 vào **giá vốn hàng bán**, tiền bán vào **doanh thu Bán hàng**.
- Tổng trừ 1.600.000 = 4 × 400.000. Không trừ hai lần, không bỏ sót.
- Phế liệu sinh từ phiếu sửa cũng vậy: phần hỏng hoặc lỗ hỏng trừ ở phiếu sửa, phần còn lại trừ khi bán.

**Đẳng thức đối chiếu** (test integration, spec "Giá vốn và hao hụt khớp sổ kho"):

```
Giá vốn và hao hụt (kỳ) = − Σ amount(dòng sổ trong kỳ, trừ OPENING, PURCHASE_IN, REVALUE)
                          + Σ repair_cost(phiếu sửa ghi sổ trong kỳ)
```

Vì sao đúng:
- Xuất thuê và chuyển công trình ra rồi vào cùng giá BQ, nên cộng ra 0.
- Phiếu sửa ghi tổng sổ = chi phí sửa − lỗ hỏng hàng, nên sau khi cộng `repair_cost` chỉ còn lỗ hỏng hàng.

**Phương án đã cân nhắc:**
- **Trừ chi phí sửa ngay khi chi** (đúng chữ "chi phí sửa chữa" ở 0.2 #107, đúng bản vẽ D15). Bị loại vì trừ hai lần như trên. Muốn đúng thì phải bỏ phần sửa ra khỏi giá BQ khi hàng rời kho, mà giá BQ đã trộn mọi cái nên không tách được.
- **Hiện hai dòng "Chi phí sửa +x" và "Cộng lại vào kho −x"**: cộng ra đúng như đề xuất nhưng hai dòng luôn triệt tiêu nhau, rối mắt.
- **Ghi lại sổ kho để không cộng chi phí sửa vào giá Tốt**: đổi 0.2 #23 và số đã có, ngoài phạm vi change chỉ đọc.

**Đã chốt** khi review PR #155 (0.2 #111). Bản vẽ D15 đã sửa: dòng "Sửa chữa (lỗ hỏng hàng)" và ghi chú "Chi phí sửa đã chi trong kỳ".

### D2. Đo "giảm giá trị khi trả về" (điểm cần chốt 2)

**Đề xuất.** Với mỗi phiếu thu hồi (`document_type = RETURN`):

```
Giảm giá trị = −(Σ amount RETURN_OUT + Σ amount RETURN_IN)
```

- Đây đúng là số "Giá trị giảm do đổi tình trạng" trên phiếu (spec `returns`, ví dụ `PTH-2026-071` = 6.870.000 ₫).
- Một phiếu, một số, cùng ngày ghi sổ.
- `LOSS_OUT` của phiếu đi vào dòng "Hàng mất", không nằm trong khoản này.
- Khoản này **gồm cả Mới → Tốt**: Mới ra theo giá BQ Mới, vào bãi theo giá BQ Tốt. Lý do: đó là giá trị sổ thật sự giảm, khớp với phiếu.
- Nhãn dòng: "Giảm giá trị khi trả về đổi tình trạng" (đã chốt, 0.2 #112).
- Số có thể âm khi giá BQ tình trạng nhận cao hơn. Hiện đúng dấu.

**Đã cân nhắc:**
- *Chỉ đếm dòng nhập Chờ sửa / Phế liệu, nhân chênh lệch giá BQ Tốt − giá BQ tình trạng đó*: phải tự ghép dòng ra với dòng vào, lệch với số trên phiếu khi phiếu rút Mới trước. Bị loại.
- *Đo theo giá trị lúc giao*: sổ không lưu giá theo lô. Bị loại.

**`ĐCG` (`REVALUE`) không vào lợi nhuận.**
- Nó sửa giá mua của hàng **còn trong kho**. 0.2 #35: toàn bộ chênh lệch dồn vào hàng đang tồn.
- Phần sửa sẽ vào giá vốn khi hàng đó rời kho (D1).
- Nếu trừ ngay thì lại là trừ hai lần.

**Phiếu điều chỉnh `ĐC`** (`document_type = ADJUSTMENT`: số lượng, tình trạng, vị trí) gộp vào dòng "Chênh lệch kiểm kê và điều chỉnh". Lý do: đó cũng là ghi giảm hoặc tăng không qua chứng từ bán.
- Chuyển vị trí cộng ra 0.
- Sửa sai tình trạng làm giảm giá trị như trả về hỏng.
- Không gộp thì đẳng thức D1 hở.
- Đã chốt, 0.2 #113.

**Tồn đầu kỳ** (`OPENING`), **nhập mua** (`PURCHASE_IN`, gồm chi phí chuyến) không vào giá vốn.

### D3. Ngày ghi nhận từng khoản (điểm cần chốt 3)

| Khoản | Ngày | Nguồn |
|---|---|---|
| Tiền thuê | Từng ngày tính (spec `sales-revenue`): bù tối thiểu vào ngày trả, điều chỉnh vào ngày lập (kẹp trong kỳ), cước thuê vào ngày giao | `revenueBook` |
| Bán hàng | Ngày giao (= ngày ghi sổ phiếu xuất, 0.2 #55) | `revenueBook` |
| Đền bù | Ngày duyệt (`approved_date`) | `revenueBook.separate` |
| Mua lại | Ngày duyệt; sổ ghi `SALE_OUT` cùng ngày | `revenueBook.separate` |
| Giá vốn hàng bán, mua lại, mất, giảm giá trị, kiểm kê, điều chỉnh | `business_date` của dòng sổ | `inventory_ledger` |
| Sửa chữa (lỗ hỏng), chi phí sửa đã chi | `business_date` của dòng sổ của phiếu (nối `posting_id`), không phải ngày sửa xong | `repair_order_line` + sổ |

**Luật cộng dồn:**
- Mỗi khoản có **đúng một ngày**.
- Mọi kỳ được tính bằng **tổng các tháng**: quý = 3 tháng; năm, lũy kế năm = các tháng từ tháng 1.
- Code tính một bảng theo tháng rồi cộng. Kỳ này, kỳ trước, lũy kế và biểu đồ dùng chung bảng đó, nên tự khớp nhau.
- Tháng đang chạy tính đến hôm nay.

**Hệ quả đã biết.** Hàng mất ghi theo ngày trả, đền bù của nó theo ngày duyệt. Hai ngày này có thể khác tháng (spec có kịch bản).
- Chọn ngày duyệt vì đó là lúc khoản nợ có thật (D1, D14 cùng luật).
- Lũy kế năm vẫn đủ cả hai.
- Đã chốt, 0.2 #116. D15 ghi chú dưới bảng "Hàng mất tính theo ngày trả, đền bù theo ngày duyệt".

### D4. Bình quân theo ngày và tốc độ (điểm cần chốt 4)

**Tồn cuối ngày theo lô**: hai truy vấn gom nhóm, không đọc từng dòng ra JS.

1. **Số dư đầu**, tính đến trước ngày bắt đầu `S` của khoảng cần đọc:
   ```sql
   select l.item_id, l.condition, loc.type = 'SITE' as on_site, sum(l.quantity)
   from inventory_ledger l join location loc on loc.id = l.location_id
   where l.business_date < :S and l.condition in ('NEW','GOOD')
   group by 1,2,3
   ```
   Nối `inner join location` nên dòng `REVALUE` (`location_id` trống, số lượng 0) tự bị loại (0.2 #35).
2. **Biến động theo ngày** trong `[S, E]`: cùng điều kiện, gom thêm `business_date`.

**Tính ngày.** Hàm thuần `dailyFleet` (`src/domain/fleet-metrics.ts`) cộng dồn từng ngày từ `S` tới `E` cho từng mã. Kết quả là **tổng theo tháng** cho mỗi mã:
- Σ tồn cuối ngày, tách tổng và phần ở công trình;
- số ngày.

Bình quân của kỳ = Σ (các tháng) ÷ Σ ngày. Đổi ra tấn bằng `lineWeightKgMilli` như D1.

**Hao hụt.** Truy vấn thứ ba gom `LOSS_OUT` và `RETURN_IN` (Chờ sửa, Phế liệu) của `document_type = RETURN` theo (tháng, mã). Số lượng đổi ra tấn.

**Khoảng đọc.** `S` = ngày sớm nhất trong:
- đầu năm của kỳ;
- đầu kỳ trước, cho cột Kỳ trước và % ở ô doanh thu (bình quân không cần kỳ trước).

`E` = min(cuối kỳ, hôm nay).

**Giá vốn** (D1, D2) đọc bằng một truy vấn gom `(tháng, document_type, movement)` của `sum(amount)` trong `[S, E]`. Thêm một truy vấn gom `repair_cost`, `loss_amount` theo tháng ghi sổ.

**Chỉ mục.** Thêm `inventory_ledger_business_date_idx` trên `(business_date)`.
- Truy vấn kỳ tháng và quý đọc một khoảng ngày nhỏ trên toàn bảng.
- Các chỉ mục hiện có bắt đầu bằng `item_id`, `location_id` hoặc `movement`, không dùng được cho khoảng ngày.
- Truy vấn số dư đầu vẫn quét phần sổ trước `S`. Chấp nhận được: một năm sổ là vài chục nghìn dòng.
- Không lưu số dư theo tháng: giữ luật "không lưu số cộng dồn".
- Test `dashboard-indexes.int.test.ts` thêm chỉ mục mới.

**Đo.**
- `npm run bench:reports` dùng lại guard `*_bench` (`src/lib/dashboard/bench-guard.ts`) và helper sinh dữ liệu của `bench:dashboard`. `BENCH_SKIP_SEED=1` đo trên DB đã sinh.
- Đo từng khối hai lần với kỳ tháng và kỳ năm: doanh thu, giá vốn, hàng cho thuê, xếp hạng, Excel.
- **Mục tiêu**: kỳ năm < 2,5 s toàn trang, kỳ tháng < 1,5 s.
- Kết quả ghi vào `docs/ops/reports-bench.md`.
- Phần nặng nhất là `revenueBook` cho 12 tháng cộng kỳ trước. Ước tính 2–3 lần 184 ms của D1.

**Đã cân nhắc:**
- *Đọc mọi dòng sổ rồi tính trong JS*: chậm, tốn bộ nhớ khi sổ lớn.
- *Bảng số dư cuối ngày*: là số cộng dồn lưu riêng, cần đối chiếu. Để dành nếu bench vượt mục tiêu.
- *Lấy tồn hiện tại rồi trừ ngược*: cũng phải quét sổ sau `S`, không lợi hơn.

### D5. Quyền và menu (điểm cần chốt 5)

**Dùng lại `reports.view`**, thêm `ACCOUNTANT` (0.2 #110). Không dùng `receivables.view`.
- Menu "Báo cáo", trang `/reports` và test chống quên quyền (`route-guards.test.ts`) đã gắn với `reports.view`.
- Tách khỏi công nợ để sau này đổi người xem báo cáo không kéo theo quyền công nợ.

Cách chặn:
- Trang gọi `requirePermission("reports.view")`. Kinh doanh bị 403. Thủ kho, Xưởng bị chuyển tới `/m` như mọi trang Desktop.
- API `GET /api/reports/export` bọc `withAuth("reports.view")`: Kinh doanh, Thủ kho, Xưởng đều 403.
- Bị từ chối thì không gọi hàm tính nào.
- Kinh doanh có `canContract` cũng không được xem: báo cáo gộp mọi hợp đồng.

### D6. Ảnh mốc D15 và E2E (điểm cần chốt 6)

- **Ảnh mốc** `@visual` chụp `/reports?period=month&value=2020-01` với Giám đốc.
  - Đây là kỳ sớm nhất chọn được, trước mọi dữ liệu dev, CI và E2E.
  - Mọi số là 0 ₫ hoặc "—". Dòng dưới tiêu đề cố định "Tháng 01/2020 · số liệu đến hết 31/01/2020".
  - Biểu đồ chỉ có T1. Xếp hạng năm 2020 trống.
  - Không cần `data-mask`.
  - Không dùng kỳ 02/2099 như D7 vì kỳ tương lai không chọn được (spec "Kỳ báo cáo").
- **E2E** trên DB dev (`reports.spec.ts`), không kiểm số tiền vì số đổi theo ngày chạy:
  - Giám đốc mở `/reports`: có 4 ô, bảng lợi nhuận có 10 dòng khoản mục, biểu đồ có cột tháng này.
  - Đổi sang Quý thì đường dẫn đổi `period=quarter`.
  - Đổi xếp hạng "Theo kg".
  - Bấm "Xuất Excel": tên file `bao-cao-<value>.xlsx`, mở được 5 sheet.
  - Kế toán (`statePath("ACCOUNTANT")`) mở được, thấy mục menu.
  - Kinh doanh nhận 403 ở trang và API.
- **Số liệu** kiểm bằng integration test trên DB test với dữ liệu tự dựng: tính tay, khớp D1, khớp sổ.

### D7. Doanh thu dùng lại `revenueBook`

- Gọi `revenueBook` **một lần** với các tháng từ tháng của `S` đến tháng của `E`. Bỏ các khoản sau `E`: hàm đọc bán, đền bù, mua lại tới hôm nay.
- Thêm `kind: "COMPENSATION" | "BUY_BACK"` vào `SeparateEntry`. D1 vẫn cộng chung như cũ, nên số D1 không đổi (test D1 hiện có giữ nguyên).
- Gom theo tháng: thuê = Σ `rent`, bán = Σ `sale`, đền bù và mua lại theo `kind`.
- Tháng có trong `openMonths` thì đánh dấu tạm tính.
- Test "khớp D1" gọi đúng hàm D1 dùng (`monthTotals`) trên cùng sổ và so từng tháng.

### D8. Xếp hạng nhà thầu

- Dùng lại `revenueByCustomer(book, 01/01)` và `kgByCustomer(db, 01/01, E năm)`.
- Xếp bằng `topCustomers(rows, Infinity)`: cùng luật bằng nhau xếp theo tên, bỏ số 0. 5 dòng đầu vì vậy giống D1.
- Thêm cột thuê, bán (tách từ cùng sổ) và số hợp đồng.
  - Số hợp đồng = số hợp đồng của nhà thầu có doanh thu hoặc phiếu xuất ghi sổ trong năm.
- Năm của xếp hạng là năm chứa kỳ.

**Hiện trên màn: đủ mọi nhà thầu** (0.2 #110 "đầy đủ"), một bảng cuộn trong khối.
- Bản vẽ gộp từ dòng 8 thành "11 nhà thầu khác". Theo luật "spec thắng" đề xuất hiện đủ.
- Đã chốt, 0.2 #115. Bản vẽ đã bỏ dòng gộp.

### D9. Kỳ, đường dẫn và hàm thuần

- `src/domain/report-period.ts`:
  - `parsePeriod(period, value, today)`: sai hoặc tương lai thì trả tháng này.
  - `periodRange`, `previousPeriod`, `yearToDate`, `periodLabel` ("Tháng 10/2026", "Quý 3/2026", "Năm 2026").
  - `comparableRange(period, today)`: phần đem so cho % ở ô doanh thu (D11).
  - `REPORT_FIRST_YEAR = 2020`.
- `src/domain/gross-profit.ts`:
  - `COST_CATEGORIES`;
  - `classifyLedger(documentType, movement)`: giá vốn bán, mua lại, mất, giảm giá trị trả về, kiểm kê và điều chỉnh, không tính;
  - `monthlyProfit(...)`, `sumMonths(...)`, `marginText(profit, revenue)` (làm tròn nửa lên 1 chữ số, doanh thu ≤ 0 thì "—").
- `src/domain/fleet-metrics.ts`: `dailyFleet`, `lossPer100Tons`, `utilization`, `groupOthers(rows, 10)`.
- Hằng số (10 dòng hiện, 100 tấn, năm đầu) đặt trong `src/domain`, truyền làm tham số.

### D10. Đọc dữ liệu, trang, API, Excel

- `src/lib/reports/`:
  - `costs.ts` (truy vấn giá vốn và sửa chữa);
  - `fleet.ts` (số dư đầu, biến động, hao hụt);
  - `ranking.ts`;
  - `report.ts` (`buildReport(db, period, today)`: gọi song song, trả một object dùng chung cho trang và Excel);
  - `export.ts` (`buildXlsxBook`, 5 sheet theo spec).
- Trang `src/app/(desktop)/reports/page.tsx`:
  - `await connection()`, `requirePermission`, đọc `searchParams`;
  - component trong `src/components/reports/`: thanh chọn kỳ (client, đổi URL), 4 ô, bảng lợi nhuận, biểu đồ SVG vẽ tay theo token như D1, bảng hao hụt, bảng khai thác, xếp hạng (client, nút đổi chế độ).
- **API** `GET /api/reports/export?period=month|quarter|year&value=...`:
  - Trả `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, tên `bao-cao-<value>.xlsx`.
  - Sai tham số thì 400 "Kỳ báo cáo không hợp lệ". Đây là API nên không tự đổi về tháng này như trang.
  - Không ghi nhật ký (giống xuất Excel D14).
- Không có bảng mới. Chỉ một migration thêm chỉ mục.

### D11. % so với kỳ trước khi kỳ chưa hết (review PR #155)

Kỳ đang chạy chỉ tính đến hôm nay. Nếu so với **cả** kỳ trước thì 6 ngày đầu tháng 11 luôn "thua" cả tháng 10 (khoảng − 80 %), vô nghĩa.

- **Kỳ đã hết**: so với cả kỳ trước, ghi "so với tháng 9", "so với quý 2/2026", "so với năm 2025".
- **Kỳ chưa hết**: so với **cùng số ngày đầu** của kỳ trước, không quá ngày cuối kỳ trước.
  - Tháng 11/2026, hôm nay 06/11: 6 ngày thì so 01/10 – 06/10, ghi "so với 01/10 – 06/10".
  - Năm 2026, hôm nay 06/11 (ngày thứ 310): so 01/01 – 06/11/2025.
  - Tháng 03/2027, hôm nay 31/03: 31 ngày, kỳ trước chỉ 28 ngày, nên so cả 01/02 – 28/02.
- Số ngày đếm theo ngày Việt Nam. Năm nhuận lệch một ngày: chấp nhận, vì khoảng ngày được ghi rõ trên ô.
- Doanh thu phần đem so lấy từ cùng `revenueBook` (lọc theo ngày, các khoản đều có ngày), không gọi thêm truy vấn.
- **Cột "Kỳ trước" của bảng giữ đủ kỳ** để đọc như báo cáo kỳ.

**Đã cân nhắc:**
- *So với cả kỳ trước* (bản đầu): sai như trên.
- *Chia theo ngày rồi nhân lên đủ kỳ*: thuê đều theo ngày nhưng bán và đền bù dồn cục, ước lượng dễ lệch. Bị loại.

## Risks / Trade-offs

- **[Rủi ro] Chủ doanh nghiệp muốn thấy chi phí sửa trừ thẳng** như bản vẽ.
  → Đã chốt theo đề xuất (0.2 #111). Dưới bảng vẫn hiện chi phí sửa đã chi.
- **[Rủi ro] Kỳ năm chậm khi nhiều kỳ chưa chốt.** `statementOf` chạy lại mọi tháng.
  → Bench trước khi xong. Nếu vượt mục tiêu thì tách tải: khối nặng (biểu đồ, xếp hạng) vào `Suspense`, như D1.
- **[Đánh đổi] Đền bù và hàng mất có thể lệch tháng** (D3).
  → Ghi chú dưới bảng. Lũy kế năm đúng.
- **[Đánh đổi] Mã chưa có trọng lượng chuẩn** tính 0 tấn.
  → Báo cáo ghi số mã như vậy để Giám đốc bổ sung ở Danh mục.
- **[Rủi ro] Tiền thuê kỳ mở đổi sau khi xem** (tạm tính).
  → Cột có nhãn "tạm tính" như D1. Excel có cột tạm tính.

## Migration Plan

1. Migration `drizzle/` thêm chỉ mục `inventory_ledger_business_date_idx`. Không đổi dữ liệu, chạy lại được.
2. Cập nhật bảng quyền (`reports.view` thêm Kế toán) cùng lúc với trang mới.
3. Lùi lại: revert code. Chỉ mục để lại không hại gì, hoặc `drop index`.
