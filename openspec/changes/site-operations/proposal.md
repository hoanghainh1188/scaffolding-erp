# Proposal: site-operations

## Why

Ba việc hằng ngày ở công trình chưa làm được trên hệ thống (0.2 #38, file kế toán thật 01/11/2026):

- **Chuyển hàng thẳng** từ công trình này sang công trình khác, không về bãi. Hiện phải lập một phiếu thu hồi về bãi rồi một đợt xuất, sai ngày tính thuê và bắt thủ kho đếm hàng không qua bãi.
- **Khách mua lại** hàng đang thuê (ty ren, bát chuồn đã đổ bê tông). Hiện kế toán ghi tay, sổ kho vẫn tính hàng đó đang ở công trình và vẫn tính thuê.
- **Đổi hàng** tại công trình (chéo dài ↔ chéo ngắn) trong một chuyến xe. Hiện hai chứng từ rời nhau, D6 không cho biết đó là một lần đổi.

`returns-and-compensation` đã xong, nên "đang ở công trình" đã đọc được từ sổ kho. Change này dùng lại nó (issue #132, roadmap dòng 12b).

- Giai đoạn: **[MVP]**, issue #132, phụ thuộc `returns-and-compensation` (đã archive, PR #135).
- Màn hình (vẽ ở PR #137):
  - **D6b** Chuyển công trình, **D6c** Phiếu mua lại, **D6d** Đổi hàng (Desktop, mở từ D6).
  - **M9** Xác nhận chuyển công trình (điện thoại).
  - Sửa **D6** (bảng hàng ở công trình, dòng thời gian), **M1**, **M4**, **M7**, **D18**.
- Thiết kế: `docs/design/screens/D6b-SiteTransfer.dc.html`, `D6c-BuyBack.dc.html`, `D6d-Exchange.dc.html`, `M9-SiteTransfer.dc.html`.
- Quyết định đã chốt dùng: `docs/requirements.md` 0.2 #4, #5, #11, #15, #16, #18, #21, #24, #38, #51, #55, #56, #61–#68. Ba điểm chính đã chốt khi vẽ (#66 chuyển công trình, #67 mua lại, #68 đổi hàng); `design.md` chi tiết hóa. Các câu hỏi của PR #138 đã chốt 04/11/2026, ghi ở 0.2 **#69–#72**.

## What Changes

- **Phiếu chuyển công trình** (`CCT-2026-001`, bảng đếm chứng từ), lập trên **D6b** từ D6 của hợp đồng đi:
  - hợp đồng đi là hợp đồng thuê **Đang thực hiện**; hợp đồng nhận là hợp đồng thuê **Đã duyệt / Đang thực hiện** khác;
  - mã phải có trên **bản hợp đồng nhận đang áp dụng**; thiếu thì lập phụ lục cho hợp đồng nhận trước;
  - hai hợp đồng **khác nhà thầu** thì phải tích xác nhận; nhật ký gắn cờ "Có xác nhận bất thường";
  - số chuyển không quá **số đang ở công trình** của hợp đồng đi; vượt "còn phải giao" của hợp đồng nhận thì chỉ cảnh báo và xác nhận, như 0.2 #56;
  - **hai cách xác nhận** (0.2 #66): văn phòng bấm "Xác nhận chuyển" ghi sổ ngay, hoặc "Gửi điện thoại" để người đi xe xác nhận trên **M9**, được giảm số thực chở (không tăng);
  - ghi sổ **một transaction**: `TRANSFER_OUT` ở vị trí công trình đi, `TRANSFER_IN` ở vị trí công trình nhận, cùng (mã + tình trạng), theo **giá BQ hiện tại**, không đổi giá BQ (0.2 #11, #24); rút **Mới trước rồi Tốt** như thu hồi (0.2 #62); hàng giữ nguyên tình trạng;
  - **ngày chuyển = ngày ghi sổ** (như 0.2 #55): hợp đồng đi tính thuê đến hết ngày đó, hợp đồng nhận tính từ hôm sau (0.2 #4); **cùng nhà thầu** thì hàng chuyển không áp tối thiểu 45 ngày ở hợp đồng đi, khác nhà thầu thì áp riêng (0.2 #70);
  - chuyển vào hợp đồng **Đã duyệt** lần đầu thì hợp đồng đó sang **Đang thực hiện**, như phiếu xuất đầu tiên;
  - hàng hỏng phát hiện lúc chuyển **không chuyển**: về bãi bằng phiếu thu hồi để tính đền bù.
- **Phiếu mua lại** (`MLA-2026-001`), Kinh doanh lập trên **D6c** (0.2 #67):
  - chỉ hàng **đang ở công trình** của một hợp đồng thuê Đang thực hiện;
  - đơn giá **điền sẵn bằng giá mất** trên bản hợp đồng đang áp dụng; Kinh doanh sửa được, giá khác hợp đồng được đánh dấu; chưa có giá mất thì phải nhập;
  - **Chờ duyệt → Đã duyệt / Đã từ chối**, chỉ **Giám đốc** chuyển; nợ quá hạn thì duyệt bắt buộc lý do (0.2 #15);
  - **duyệt xong mới ghi sổ**: `SALE_OUT` ở vị trí công trình theo giá BQ, rút Mới trước rồi Tốt; **thôi tính thuê từ ngày duyệt** (tính đến hết ngày đó);
  - khi duyệt lưu **tiền bán**, ngày duyệt, **hạn trả** = ngày duyệt + số ngày được nợ (0.2 #18) để `receivables` đọc; không lưu số cộng dồn.
- **Đổi hàng** (0.2 #68) trên **D6d**: một lệnh tạo **một đợt xuất** (mã giao ra) và **một bản ghi "chờ thu hồi"** (mã nhận về, số dự kiến) nối với nhau. Không có chứng từ riêng:
  - đợt xuất đi theo đúng luồng `deliveries` (M5, "Xác nhận xe rời bãi", tính thuê từ hôm sau);
  - M4 khi xe về hỏi "Phiếu này là hàng đổi của PX-…?"; phiếu thu hồi ghi sổ như thường (chia tình trạng, đền bù tự sinh) và được nối vào lần đổi;
  - D6 hiện hai phiếu có nhãn "Đổi hàng" và trỏ tới nhau.
- **"Đang ở công trình" tính thêm chuyển công trình và mua lại.** "Còn phải giao" của cả hai hợp đồng đổi theo.
- **D6** thêm cột "Chuyển đến", "Chuyển đi", "Mua lại" (chỉ hiện khi khác 0), dòng thời gian có phiếu chuyển, phiếu mua lại và nhãn "Đổi hàng"; nút "Chuyển công trình", "Khách mua lại", "Đổi hàng".
- **Khóa**: mọi lệnh ghi sổ khóa hợp đồng `FOR UPDATE` trước, rồi chứng từ. Phiếu chuyển khóa **hai hợp đồng theo id tăng dần** để hai lệnh ngược chiều không deadlock.
- **Quyền** (kiểm ở server):
  - lập, sửa, gửi, xác nhận văn phòng, hủy phiếu chuyển; lập, sửa phiếu mua lại; lập đổi hàng: `canContract(RENTAL, manage)` (0.2 #51), với phiếu chuyển kiểm cả hai hợp đồng;
  - xác nhận trên M9: `deliveries.pick` (Giám đốc, Thủ kho);
  - duyệt, từ chối phiếu mua lại: quyền mới `buybacks.approve` (Giám đốc);
  - xem: `canContract(RENTAL, view)`. M9 không trả giá.
- **Nhật ký**: mỗi thao tác ghi đúng một dòng; D18 lọc được Phiếu chuyển công trình, Phiếu mua lại.

## Capabilities

### New Capabilities

- `site-transfers`: phiếu chuyển hàng thẳng giữa hai công trình (D6b, M9): lập, hai cách xác nhận, ghi sổ, ngày chuyển, khóa hai hợp đồng, quyền, nhật ký.
- `buy-backs`: phiếu khách mua lại hàng đang thuê (D6c): giá, duyệt, ghi sổ bán ở công trình, thôi tính thuê, số liệu cho công nợ.
- `site-exchanges`: đổi hàng tại công trình bằng một đợt xuất và một phiếu thu hồi nối với nhau (D6d, M4).

### Modified Capabilities

- `deliveries`: "Đang ở công trình" và D6 tính thêm chuyển công trình, mua lại; không hủy hợp đồng còn phiếu chuyển chưa xong hoặc đã nhận hàng chuyển đến.
- `contracts`: Đã duyệt → Đang thực hiện cả khi nhận phiếu chuyển công trình đầu tiên.
- `activity-log`: thao tác trên phiếu chuyển công trình và phiếu mua lại được ghi; bộ lọc D18.
- `mobile-home`: khối "Chuyển công trình" trên M1.
- `mobile-history`: M7 có phiếu chuyển công trình đã ghi sổ và bộ lọc "Chuyển".

## Ngoài phạm vi

- **Tính tiền thuê theo kỳ** (`rental-billing`): change này chỉ để sổ kho và chứng từ đủ ngày, số (design D11). Công thức kỳ, tối thiểu 45 ngày làm ở `rental-billing`.
- **Công nợ** (`receivables`): chỉ lưu số phiếu mua lại đã duyệt; màn công nợ làm ở `receivables`. `overdueDebt` vẫn là hàm chờ.
- Chuyển **hàng hỏng** giữa công trình, chuyển từ công trình về **xưởng**, chuyển giữa **hợp đồng bán**.
- **Mua lại hàng đã về bãi** (đó là hợp đồng bán thường), mua lại theo **kg**.
- Cước chiều về của đổi hàng, cước của phiếu chuyển (chỉ lưu biển số).
- **Hoàn tác** phiếu chuyển hay phiếu mua lại đã ghi sổ: sai thì lập phiếu ngược (chuyển lại) hoặc điều chỉnh tồn.
- In phiếu chuyển, phiếu mua lại (làm sau nếu kế toán cần).

## Impact

- **Sổ kho, giá vốn**: không thêm loại dòng mới. Dùng `TRANSFER_OUT` / `TRANSFER_IN` (đã có, chưa dùng) và `SALE_OUT` ở vị trí công trình. Không đổi giá BQ; tổng giá trị kho giảm đúng giá trị hàng mua lại theo giá BQ. **Số liệu đã có không đổi**: không có dòng sổ cũ nào thuộc phiếu chuyển hay mua lại. `npm run inventory:check` vẫn khớp.
- **DB** (migration `drizzle/0017_site_operations.sql`): bảng `site_transfer`, `site_transfer_line`, `buy_back_note`, `buy_back_note_line`, `delivery_exchange`, `delivery_exchange_line`; trigger khóa chứng từ đã ghi sổ / đã duyệt; check `activity_log` thêm loại chứng từ.
- **Code**: `src/lib/site-transfers/`, `src/lib/buy-backs/`, `src/lib/exchanges/`; hàm thuần `src/domain/site-transfer.ts`, `src/domain/buy-back.ts`; sửa `siteMovements` (`src/lib/deliveries/records.ts`), `postReturn` (nối đổi hàng), D6, M1, M4, M7, D18, `src/domain/permissions.ts`.
- **API**: `/api/site-transfers`, `/api/m/site-transfers`, `/api/buy-backs`, `/api/exchanges` (design D10).
- **Seed dev, E2E, ảnh mốc**: thêm mẫu D6b, D6c, D6d, M9; nhãn `update-snapshots`.
- Không thêm thư viện.
