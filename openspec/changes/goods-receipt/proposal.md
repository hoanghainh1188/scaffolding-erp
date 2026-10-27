# Proposal: goods-receipt

## Why

Đơn thu mua đã có (`purchase-orders`), nhưng hàng về bãi vẫn chưa vào sổ kho: tồn, giá vốn và tiền trả người bán chưa theo số thực nhận. Change này cho Thủ kho nhận hàng trên điện thoại theo **từng chuyến xe**: đếm hoặc cân, tách tình trạng, nhập chi phí chuyến, rồi **ghi sổ kho** (`PURCHASE_IN`) trong một lần xác nhận.

- Giai đoạn: **[MVP]**, change số 6 trong `docs/roadmap.md`, issue #8.
- Màn hình (file trong `docs/design/screens/`):
  - **M1** Việc hôm nay (`M1-Today.dc.html`), phần "Xe sắp về bãi";
  - **M2** Quét mã (`M2-Scan.dc.html`);
  - **M3** Nhập hàng từ đơn mua (`M3-GoodsReceipt.dc.html`);
  - **M7** Lịch sử (`M7-History.dc.html`), phần phiếu nhập và phiếu nháp;
  - **D3b** Chi tiết đơn thu mua (`D3b-PurchaseOrderDetail.dc.html`), phần nhận hàng còn để trống;
  - **Cài đặt** (Desktop): màn mới "Giá sắt vụn tham khảo".
- Quyết định đã chốt dùng: `docs/requirements.md` mục 0.2 số 2, 3, 7, 10, 11, 12, 13, 14, 24, 25, 26, 27, 28, và **#29 mới** (chốt khi review PR #41).

## What Changes

- **Phiếu nhập** mã `PN-2026-094` (bộ đếm `document_counter` có sẵn). Mỗi chuyến xe một phiếu; một đơn có nhiều phiếu (#14). Phiếu chỉ có trên server khi đã **xác nhận nhập kho**; trước đó là nháp trên máy.
- **Từng dòng của đơn** trên phiếu (#14):
  - **Đã đếm**: số thực nhận theo đơn vị của mã. Dòng đặt theo kg của mã tính theo cái nhập **cả số cái đếm và số kg cân**. Mã tính theo kg nhập số kg cân.
  - **Chuyến này không có**: ghi 0.
  - Chỉ xác nhận được khi **mọi dòng còn mở** đã đếm hoặc đã đánh dấu.
- **Tách tình trạng**:
  - Đơn hàng mới: cả số vào **Mới**.
  - Đơn hàng cũ: Condition Split chia **Tốt / Chờ sửa / Phế liệu**, phải khớp tổng. Mã tính theo kg vào thẳng **Phế liệu**.
- **Chi phí chuyến này** (#28): Thủ kho nhập trên M3. Chuyến đầu điền sẵn chi phí dự kiến của đơn, chuyến sau để trống.
- **Ghi sổ kho khi xác nhận**, trong **một transaction** với việc lưu phiếu và đổi trạng thái đơn:
  - tiền hàng dòng = số thực nhận (hoặc số kg cân) × đơn giá trên đơn (#13);
  - chi phí chuyến chia vào hàng **của chính chuyến đó** theo cách chia trên đơn (#25), bằng `allocate`;
  - lô hàng cũ chia giá ra tình trạng bằng `splitLotByCondition` (#27);
  - mỗi (mã + tình trạng) có hàng thành một dòng `PURCHASE_IN` vào bãi, làm đổi giá vốn bình quân.
- **Chờ giao bù** (#12), theo từng dòng:
  - Dòng đếm thiếu: mặc định **không** chờ (dòng chốt theo số đã nhận); tích "Chờ giao bù phần thiếu" thì chờ.
  - Dòng "Chuyến này không có": mặc định **chờ chuyến sau**; bỏ tích nếu người bán không giao mã này nữa. (0.2 #29, chốt 27/10/2026.)
- **Trạng thái đơn sau mỗi phiếu** (gọi `transition()` có sẵn): mọi dòng nhận đủ → **Đã nhận đủ**; còn dòng chờ → giữ **Đang nhận**; còn lại → **Đã đóng**.
- **Lưu nháp trên máy** (#7): phiếu đang làm tự lưu vào **IndexedDB** của trình duyệt. Mất sóng lúc xác nhận thì phiếu chờ gửi và tự gửi lại khi có mạng. Mỗi nháp có **mã nháp sinh trên máy**; server dùng mã này để **không bao giờ tạo hai phiếu** cho một nháp.
- **Giá sắt vụn tham khảo** (₫/kg): bảng chỉ ghi thêm, Giám đốc nhập ở `/settings/scrap-price`. Phiếu dùng giá hiện hành lúc ghi sổ và lưu lại giá đã dùng. Lô có phế liệu mà chưa có giá thì không xác nhận được.
- **M1** (`/m`): thẻ "Xe sắp về bãi" từ đơn đang xử lý, thanh "N phiếu chưa gửi". Phần "Xuất hàng", "Công trình trả hàng" do `deliveries`, `returns-and-compensation` thêm.
- **M2** (`/m/scan`): quét mã QR dán theo mã hàng (#2) hoặc gõ mã; hiện tồn theo tình trạng. Mở từ M3 thì quét xong nhảy tới dòng của mã đó. Nội dung mã QR = **mã hàng** (VD `GG-K17`).
- **M3** (`/m/receive/[mã đơn]`): như bản vẽ, trừ ô chụp ảnh (ngoài phạm vi).
- **M7** (`/m/history`): nháp trên máy ở đầu, rồi phiếu nhập đã ghi sổ theo ngày. Bấm mở phiếu chỉ xem (`/m/receipts/[mã]`).
- **D3b**: cột "Đã nhận", khối "Các chuyến nhập", "Phải trả người bán", "So với đơn", thanh "Còn chờ giao bù…", lịch sử có ghi sổ phiếu nhập.
- **Quyền mới** trong `src/domain/permissions.ts`:
  - `receiving.manage` (Giám đốc, Thủ kho): xem đơn cần nhận trên điện thoại, lập phiếu nhập;
  - `stock.lookup` (mọi vai trò): tra tồn một mã trên M2, không có giá vốn;
  - `scrap-price.manage` (Giám đốc).
- **Thư viện quét QR**: `barcode-detector` (design D2), người dùng đã duyệt 27/10/2026.

## Capabilities

### New Capabilities

- `goods-receipts`: phiếu nhập theo chuyến từ đơn thu mua: dòng đã đếm / chuyến này không có, đơn vị và kg cân, tách tình trạng, chi phí chuyến, ghi sổ kho và giá vốn, chờ giao bù, trạng thái đơn sau phiếu, tiền phải trả người bán, quyền, M3 và phiếu chỉ xem.
- `mobile-drafts`: lưu nháp chứng từ trên điện thoại (IndexedDB), gửi lại khi có mạng, chống tạo trùng bằng mã nháp. Phiếu xuất, thu hồi sau này dùng lại.
- `scrap-price`: giá sắt vụn tham khảo (₫/kg), lịch sử giá, màn nhập của Giám đốc.
- `item-scan`: M2 quét QR hoặc gõ mã hàng, nội dung mã QR, thẻ tồn của mã, quét từ phiếu đang làm.
- `mobile-home`: M1 Việc hôm nay, phần xe sắp về và phiếu chưa gửi.
- `mobile-history`: M7 Lịch sử phiếu, gồm nháp trên máy và phiếu nhập.

### Modified Capabilities

- `auth`: "Bảng quyền theo vai trò" thêm `receiving.manage`, `stock.lookup`, `scrap-price.manage`.
- `purchase-orders`:
  - "Chuyển trạng thái đơn thu mua": nhận đủ / thiếu tính theo từng dòng, có dòng chờ giao bù;
  - "Quyền với đơn thu mua": Thủ kho đọc đơn cần nhận qua `receiving.manage`, vẫn không mở D2/D3b;
  - "Lịch sử đơn": thêm ghi sổ phiếu nhập, đánh dấu chờ giao bù;
  - "Phần nhận hàng trên D3b": số thật thay cho "Chưa có chuyến nhập".
- `app-shell`:
  - "Thanh báo mất kết nối trên Mobile": thêm "đã lưu nháp" khi đang làm phiếu;
  - "Trang giữ chỗ cho mục chưa làm": tab Việc hôm nay, Quét mã, Lịch sử có nội dung thật.

## Impact

- **Sổ kho và giá vốn**:
  - Phiếu nhập là chứng từ đầu tiên ngoài phiếu điều chỉnh ghi `PURCHASE_IN`. Mỗi phiếu **làm đổi giá vốn bình quân** của các (mã + tình trạng) nhận vào (#1, #24).
  - Dòng sổ cũ và giá vốn hiện có không đổi. Sổ kho mẫu (seed) đã có mã `PN-2026-087`… ở loại chứng từ `GOODS_RECEIPT`; seed đẩy bộ đếm `PN` qua các mã đó để không trùng.
  - Sai sau khi ghi sổ thì lập phiếu điều chỉnh kho (đã có), không sửa phiếu nhập.
- **DB**: migration `drizzle/0005_goods_receipts.sql` tạo `goods_receipt`, `goods_receipt_line`, `goods_receipt_cost`, `scrap_price`. Không sửa cột bảng cũ; thêm loại sự kiện vào `purchase_order_event`.
- **Code**:
  - `src/domain/goods-receipt.ts` (luật dòng, tính giá từng chuyến, trạng thái đơn sau phiếu), `src/domain/qr-payload.ts`;
  - `src/lib/receiving/` (service ghi phiếu, đọc), thay phần thân `src/lib/purchasing/receipts.ts`;
  - `src/lib/drafts/` (IndexedDB, hàng đợi gửi lại, chạy ở trình duyệt);
  - route `src/app/api/receiving/*`, `src/app/api/stock/lookup`, `src/app/api/settings/scrap-price`;
  - trang `src/app/(mobile)/m/*`, `src/app/(desktop)/settings/scrap-price`, phần nhận hàng của D3b;
  - `npm run db:seed:dev`: giá sắt vụn 7.500 ₫/kg, hai phiếu nhập để có đơn "Đang nhận" như D3b.
- **E2E**: `tests/e2e/global-setup.ts` không xóa được đơn đã có phiếu nhập nữa (sổ kho không xóa được): chỉ xóa đơn `E2E thử` **chưa có phiếu nhập**; E2E nhập hàng dùng mã `E2E-KHO-01/02` và kiểm theo chênh lệch.
- **Thư viện**: `barcode-detector` (đã duyệt). Không thêm thư viện IndexedDB.
- **Test**: unit (luật dòng, tính giá chuyến, trạng thái đơn, đọc mã QR, hàng đợi nháp), integration (ghi phiếu trong transaction, gửi trùng, đồng thời, quyền), component (M1, M2, M3, M7, D3b, giá sắt vụn), E2E (nhập 2 chuyến, mất mạng rồi gửi lại), ảnh mốc mới.

## Ngoài phạm vi

- **Chụp ảnh hàng lúc nhận** trên M3: chưa có chỗ lưu file; làm cùng ảnh hiện trạng ở `returns-and-compensation`.
- **In nhãn QR**: issue #40. Change này chỉ quét và tra mã.
- **Chạy offline thật** (service worker, mở trang khi không có mạng): không làm ở MVP (#7). Chỉ trang đang mở tiếp tục làm được và nháp không mất.
- **Sửa hoặc hủy phiếu nhập đã ghi sổ**: không có; sai thì lập phiếu điều chỉnh kho.
- **Nhập hàng không có đơn** (mua lẻ tại bãi), nhận mã không có trong đơn: lập đơn trước.
- **Nhiều người cùng làm một nháp**, đồng bộ nháp giữa các máy: nháp chỉ ở máy đã tạo.
- **Công nợ phải trả** người bán, nhà xe: `payables` [Bản 2]. Change này chỉ hiện số "Phải trả người bán".
- Phần "Xuất hàng", "Công trình trả hàng" của M1 và tab Xuất, Thu hồi của M7: `deliveries`, `returns-and-compensation`.
- Nút "Xem thẻ kho" trên M2 cho vai trò không có quyền xem kho: ẩn.
