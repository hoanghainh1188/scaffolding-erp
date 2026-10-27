# Proposal: purchase-orders

## Why

Kinh doanh đang ghi đơn mua hàng ra giấy hoặc nhắn tin. Thủ kho vì thế không biết xe nào sắp về và về bao nhiêu. Change `goods-receipt` (#8) cần có **đơn thu mua** để thủ kho mở ra đếm, và cần **một cách chia chi phí mua hàng** (cước xe, bốc xếp...) vào giá nhập. Change này làm hai phần đó.

- Giai đoạn: **[MVP]**, change số 5 trong `docs/roadmap.md`, issue #7.
- Màn hình:
  - **D2** Danh sách đơn thu mua (`D2-PurchaseOrders.dc.html`)
  - **D3** Tạo/sửa đơn (`D3-PurchaseOrder.dc.html`)
  - **D3b** Chi tiết đơn (`D3b-PurchaseOrderDetail.dc.html`), riêng phần đơn
- Quyết định đã chốt dùng: `docs/requirements.md` mục 0.2 số 1, 3, 10, 12, 13, 14, 25, 26, và **#27 mới** (chốt khi review PR #36).

## What Changes

- **Đơn thu mua** mã `PO-2026-055`, cấp bằng bộ đếm chứng từ `document_counter` đã có. Đơn gồm:
  - nhà cung cấp (cá nhân hoặc công ty), chỉ chọn được nhà cung cấp đang dùng;
  - loại hàng: **Hàng mới** hoặc **Đã qua sử dụng**;
  - ngày dự kiến nhập (giờ thì không bắt buộc), phương tiện vận chuyển, ghi chú;
  - các dòng hàng: mã hàng, đơn vị đặt (**cái** hoặc **kg**), số lượng, đơn giá;
  - các khoản **chi phí mua hàng dự kiến** (cước xe tải, bốc xếp, cầu đường... mỗi khoản có tên và số tiền);
  - **cách chia chi phí**: theo giá trị (mặc định) hoặc theo trọng lượng.
- **Đơn chỉ là dự kiến** (#13):
  - Đơn chỉ lưu số lượng và chi phí dự kiến.
  - Tiền trả người bán và giá vốn tính theo số thực nhận ở `goods-receipt`.
  - Đơn **không ghi sổ kho**. Biến động `PURCHASE_IN` làm ở `goods-receipt`.
- **Trạng thái** (design D2). Trạng thái lưu chỉ dùng bộ có sẵn của `domain-values`; nhãn chi tiết tính ra:
  - `DRAFT` = **Nháp**
  - `IN_PROGRESS` = **Chờ xe về** (chưa có chuyến nhập) hoặc **Đang nhận** (đã có chuyến nhập)
  - `DONE` kèm kết quả: **Đã nhận đủ**, **Đã đóng** (nhận thiếu, không chờ nữa) hoặc **Đã hủy**
  - Kinh doanh hoặc Giám đốc lập, đặt, sửa, hủy, đóng đơn. Việc nhận hàng làm đơn chuyển trạng thái thuộc `goods-receipt`; change này chỉ chốt luật chuyển trạng thái (có test).
- **Sửa và hủy**:
  - Chưa có chuyến nhập: sửa được hết; hủy được, phải ghi lý do.
  - Đã có chuyến nhập: không hủy được nữa (hàng nhập sai thì lập phiếu điều chỉnh kho). Chỉ sửa được ngày dự kiến, phương tiện, ghi chú. Muốn dừng thì **Đóng đơn, không chờ nữa**.
  - Đơn nháp xóa được.
- **Hàm thuần chia chi phí** trong `src/domain/`:
  - Chia theo giá trị, theo trọng lượng (cái × trọng lượng chuẩn, hoặc số kg) và theo số lượng.
  - Sau làm tròn, **tổng các phần luôn bằng đúng tổng chi phí** đến từng đồng (cách chia phần dư lớn nhất).
  - D3 dùng hàm này để xem trước giá nhập trên số dự kiến. `goods-receipt` dùng lại cho từng chuyến (#25).
- **Chia giá lô hàng cũ ra tình trạng** (0.2 #27, design D5), hàm thuần dùng ở `goods-receipt`:
  - Phế liệu lấy giá = kg quy đổi × giá sắt vụn tham khảo;
  - phần còn lại chia cho Tốt và Chờ sửa theo số cái;
  - giá trị phế liệu vượt tiền dòng, hoặc cả lô là phế liệu, thì phế liệu nhận đúng tiền dòng.
- **Nhiều đơn vị** (design D4):
  - Mã tính theo cái đặt được theo cái hoặc theo kg. Đặt theo kg thì màn hình hiện số cái quy đổi theo trọng lượng chuẩn.
  - Mã tính theo kg (`PL-SAT`) chỉ đặt theo kg.
- **D2** (`/purchasing`, thay trang giữ chỗ "Thu mua"):
  - tab theo trạng thái kèm số đơn, tìm theo mã đơn hoặc nhà cung cấp, lọc loại hàng, phân trang;
  - lời nhắc "Hôm nay có N xe sắp về bãi".
- **D3** (`/purchasing/orders/new`, `/purchasing/orders/[code]/edit`): form đơn, bảng hàng có nút đổi cái/kg, bảng chi phí, chọn cách chia, cột "Chi phí phân bổ" và "Giá nhập / đơn vị" xem trước, khối Tổng cộng.
- **D3b** (`/purchasing/orders/[code]`):
  - phần làm ở change này: thông tin chung, bảng hàng đặt, chi phí dự kiến, lịch sử, các nút đặt, sửa, hủy, đóng đơn;
  - phần để trống tới `goods-receipt`: cột "Đã nhận", "Các chuyến nhập", "Phải trả người bán", "So với đơn". Các khối này hiện "Chưa có chuyến nhập".
- **Chống ghi đè khi hai người cùng sửa**: lệnh sửa gửi kèm thời điểm sửa gần nhất đã đọc; lệch thì báo "Đơn vừa được người khác sửa, tải lại trang".
- **Lịch sử đơn**: ai tạo, đặt, sửa, hủy, đóng, lúc nào. `goods-receipt` ghi thêm các chuyến nhập vào đây.
- **Quyền mới** `purchasing.manage` (Giám đốc, Kinh doanh) trong `src/domain/permissions.ts`. Xem đơn dùng `purchasing.view` đã có (Giám đốc, Kế toán, Kinh doanh).
- **Chặn ngừng dùng**: không ngừng dùng được nhà cung cấp còn đơn đang xử lý, hay vật tư nằm trong một đơn đang xử lý.

## Capabilities

### New Capabilities

- `purchase-orders`: đơn thu mua, gồm dòng hàng, chi phí dự kiến, trạng thái và luật chuyển, sửa/hủy/đóng, lịch sử, quyền, các màn D2, D3, D3b (phần đơn).
- `landed-cost`: luật chia chi phí mua hàng (theo giá trị, theo trọng lượng; làm tròn khớp tổng; giá nhập một đơn vị) và chia giá một dòng hàng cũ ra tình trạng (phế liệu theo giá sắt vụn).

### Modified Capabilities

- `auth`: requirement "Bảng quyền theo vai trò" thêm `purchasing.manage`.
- `partner-directory`: requirement "Ngừng dùng và xóa đối tác" thêm: nhà cung cấp đã có đơn không xóa được, còn đơn đang xử lý thì không ngừng dùng được.
- `item-catalog`: requirement "Ngừng dùng và xóa vật tư, bộ" thêm: vật tư nằm trong đơn thu mua đang xử lý thì không ngừng dùng được.

## Impact

- **Sổ kho và giá vốn**: change này **không ghi dòng sổ kho nào**, nên số tồn và giá vốn hiện có không đổi. Giá nhập xem trước ở D3 chỉ để tham khảo. Giá vốn thật được tính ở `goods-receipt` từ số thực nhận và chi phí thực của từng chuyến.
- **DB**: migration mới tạo 4 bảng:
  - `purchase_order`, `purchase_order_line`, `purchase_order_cost`, `purchase_order_event`;
  - khóa ngoại `RESTRICT` tới `supplier`, `item`, `user`;
  - không có sequence mới, mã `PO` lấy từ `document_counter`.
- **Code**:
  - `src/domain/landed-cost.ts`, `src/domain/purchase-order.ts`
  - `src/lib/purchasing/`
  - route `src/app/api/purchasing/*`
  - trang `src/app/(desktop)/purchasing/*`
  - component `src/components/purchasing/*`
  - sửa `src/lib/catalog/partners.ts` và `items.ts` (chặn ngừng dùng)
  - thêm quyền ở `src/domain/permissions.ts`
  - `npm run db:seed:dev` thêm đơn mẫu khớp D2/D3
- **Test**:
  - unit: chia chi phí và làm tròn, luật trạng thái, kiểm dòng và đơn vị;
  - integration: tạo/đặt/sửa/hủy/đóng, cấp mã đồng thời, khóa nhà cung cấp và vật tư, quyền 403 từng vai trò, chặn ngừng dùng, đơn không ghi sổ kho;
  - component: D2, D3, D3b;
  - E2E luồng chính;
  - ảnh mốc mới cho D2, D3, D3b.
- Không thêm thư viện.
- **Tài liệu**: `docs/requirements.md` 0.2 thêm #27 (giá lô hàng cũ theo tình trạng, chốt 27/10/2026).
- **Số mẫu trên bản vẽ D3** lệch 1 ₫ ở hai dòng (Chéo 771.839 → **771.840**, Phế liệu 565.539 → **565.538**) vì cách chia phần dư (design D3). Spec thắng. Giá nhập một đơn vị vẫn khớp bản vẽ.
- **Ràng buộc cho `goods-receipt`** (design D9):
  - Dùng hàm chia chi phí của change này cho từng chuyến, theo cách chia đã chọn trên đơn.
  - Chia giá một dòng hàng cũ ra tình trạng bằng hàm của D5.
  - Thêm chỗ lưu **giá sắt vụn tham khảo** (₫/kg) và màn để Giám đốc nhập.
  - Thêm quyền đọc đơn cho Thủ kho.
  - Thay phần "Chưa có chuyến nhập" ở D3b bằng số thật.

## Ngoài phạm vi

- **Phiếu nhập, đếm/cân, tách tình trạng, ghi sổ kho, "Chờ giao bù", "Chuyến này không có", chi phí thực từng chuyến, tiền phải trả người bán**: thuộc `goods-receipt` (#8).
- Màn Mobile cho Thủ kho (M1 "Xe sắp về", M3): thuộc `goods-receipt`.
- **Công nợ phải trả** cho người bán và nhà xe: `payables` [Bản 2].
- Nút **"In đơn"** ở D3b: chưa hiện.
- Duyệt đơn mua bởi Giám đốc: không có trong quyết định đã chốt, đơn đặt là có hiệu lực.
- Chia giá theo hệ số riêng cho từng tình trạng (VD: Chờ sửa rẻ hơn Tốt): không làm (design D5).
- Bảng và màn nhập **giá sắt vụn tham khảo**: thuộc `goods-receipt` (#8).
- Đơn mua bằng ngoại tệ, thuế VAT, chiết khấu.
- Tạo đơn từ file Excel.
