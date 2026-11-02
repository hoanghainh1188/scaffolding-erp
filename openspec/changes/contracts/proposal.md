# Proposal: contracts

## Why

Chưa có chứng từ nào cho phần chiếm 90 % doanh thu: cho thuê. Xuất kho theo đợt (`deliveries`), thu hồi – đền bù và tính tiền thuê đều cần một **hợp đồng đã duyệt** để biết giá, giá đền bù, hạn thanh toán, VAT và cọc của từng công trình. Hiện kế toán giữ những số này trong Excel (báo giá `BG THUÊ` từng công trình, VAT gõ tay, cọc ghi riêng). Change này đưa hợp đồng vào hệ thống trước các change đó (issue #9, roadmap dòng 10).

- Giai đoạn: **[MVP]**, issue #9, phụ thuộc `catalog-extensions` (đã xong).
- Màn hình: **D4** Danh sách hợp đồng, **D5** Chi tiết hợp đồng (có thanh duyệt của Giám đốc), **D5a** Soạn hợp đồng / báo giá, **D5b** Lập phụ lục. Thiết kế ở `docs/design/screens/D4-Contracts`, `D5-Contract`, `D5a-ContractForm`, `D5b-ContractAmendment`.
- Quyết định đã chốt dùng: `docs/requirements.md` 0.2 #4, #5, #6, #15, #16, #18, #20, #22, #33, #39, #40, #41, #43, #45, #48, #49, #50.

## What Changes

- **Hợp đồng** hai loại: **Cho thuê** và **Bán**. Một hợp đồng = một nhà thầu + một công trình (0.2 #5); hợp đồng bán được để trống công trình ("Nhận hàng tại bãi"). **Báo giá = hợp đồng ở trạng thái Nháp**, in ra được.
- **Số hợp đồng tự sinh** `MMYYYY/<VIẾT_TẮT_CÔNG_TY>-<TÊN_HOẶC_MÃ_KHÁCH>` (0.2 #40), VD `112026/ANPHAT-MINHPHAT`. Viết tắt lấy từ `company_profile.short_name`. Trùng gốc trong tháng thì thêm `-2`, `-3`. Đếm bằng bảng `document_counter`, không tạo `SEQUENCE`. Phụ lục `/01`, `/02`.
- **Dòng hàng** theo **bộ** (tự tách thành linh kiện) hoặc theo **mã**. Giá lấy từ danh mục rồi sửa riêng; giá khác danh mục được đánh dấu. Hợp đồng bán được **bán theo kg** với mã tính theo cái; bán phế liệu chỉ theo kg.
- **Tiền thuê** (0.2 #4, #39): giá ngày × số ngày thực tế (không tính ngày xuất, tính ngày trả), tối thiểu 45 ngày. Giá tháng **chỉ để hiện**: giá ngày × số ngày của tháng (hiện cả tháng 30 và 31 ngày). Không quy giá tháng ra giá ngày bằng ÷ 30. Hằng số 45 ngày đặt một chỗ trong `src/domain`. Change này dùng công thức cho **giá trị dự kiến**; tính tiền theo kỳ thuộc `rental-billing`.
- **Điều khoản**: thuê tối thiểu (mặc định 45 ngày), chốt kỳ (hàng tháng, ngày cuối tháng), hạn thanh toán (mặc định lấy từ nhà thầu, 0.2 #18), cờ **VAT + thuế suất** (0.2 #39). Chưa tính lãi/phạt chậm trả (0.2 #48).
- **Bảng giá đền bù** (mất, hỏng sửa được) chép từ **bảng chung của công ty** = giá đền bù mặc định trong danh mục vật tư (0.2 #20, #49). Giá đã chép không đổi khi bảng chung đổi. Có nút "Lấy lại bảng chung" khi còn Nháp.
- **Cọc**: nhiều khoản **cọc tiền** và **bảo lãnh ngân hàng** (ngân hàng, số chứng thư, giá trị, ngày hết hạn). Cảnh báo bảo lãnh **còn ≤ 30 ngày**, **đã hết hạn**, và **hết hạn trước ngày kết thúc dự kiến** (0.2 #50). Change này **chỉ lưu**, chưa cấn trừ (0.2 #40).
- **Kế hoạch giao theo đợt**: ngày dự kiến + hàng của từng đợt. **Chỉ là dự kiến**, không ràng buộc phiếu xuất của `deliveries`.
- **Nhân viên phụ trách** chép từ nhà thầu khi tạo (0.2 #41).
- **Luồng**: Nháp → Chờ duyệt → Đã duyệt → Đang thực hiện → Thanh lý; Giám đốc **trả lại** (về Nháp, kèm lý do) hoặc **hủy**. **Chỉ Giám đốc duyệt** (0.2 #6). Nhà thầu nợ quá hạn thì chỉ cảnh báo, duyệt **bắt buộc ghi lý do** (0.2 #15); số nợ đọc qua một hàm chờ sẵn, trả 0 cho tới khi có `receivables`.
- **Phụ lục** (0.2 #16): không sửa thẳng hợp đồng đã duyệt. Phụ lục đổi được hàng và giá, thời hạn, đền bù, cọc và bảo lãnh, hạn thanh toán, VAT; Giám đốc **duyệt lại**. Ngày hiệu lực **sau** ngày cuối kỳ đã chốt (0.2 #22). Giá mới áp từ ngày hiệu lực; kỳ đã chốt không tính lại. Tra được **"giá đang áp dụng tại ngày X"** cho `rental-billing`.
- **Tách quyền** hợp đồng thuê và hợp đồng bán: quyền xem, quyền tạo/sửa riêng từng loại trong `src/domain/permissions.ts`, cộng với **phạm vi hợp đồng** của từng tài khoản Kinh doanh (Cả hai / Chỉ cho thuê / Chỉ bán) do Giám đốc đặt ở D17. Server kiểm cả hai. Quyền duyệt chỉ Giám đốc.
- **Nhật ký**: mọi thao tác ghi (tạo, sửa, gửi duyệt, duyệt, trả lại, hủy của hợp đồng và phụ lục) gọi `logActivity` trong cùng transaction. Duyệt kèm lý do nợ quá hạn gắn cờ "Có xác nhận bất thường".
- Sửa gửi kèm `updatedAt`, lệch thì 409; khóa `FOR UPDATE` trước khi kiểm tra. Ô ngày dùng `DateInput`. Chữ trên giao diện theo 0.2 #45, menu "Cho thuê & Bán" (0.2 #43).

## Ảnh hưởng tới sổ kho và giá vốn

- **Không ghi sổ kho.** Hợp đồng chỉ lưu số dự kiến và giá; xuất hàng ghi sổ ở `deliveries`. Tồn kho, giá vốn hiện có không đổi.
- Ô "Kho đủ hàng Tốt cho đợt 1" chỉ **đọc** tồn từ sổ kho để cảnh báo, không giữ hàng.

## Ngoài phạm vi

- Phiếu xuất, rã bộ khi xuất, cước vận chuyển thực tế (`deliveries`); trạng thái "Đang thực hiện" chỉ được khai báo, change `deliveries` mới chuyển sang.
- Tính tiền thuê theo kỳ, chốt kỳ, tiền VAT trên công nợ (`rental-billing`). Bảng kỳ đã chốt chưa có: kiểm "sau kỳ đã chốt" đọc qua hàm chờ sẵn, trả "chưa có kỳ nào" cho tới change đó.
- Công nợ, nợ quá hạn thật, cấn trừ cọc, hoàn cọc, theo dõi tiền cọc đã nhận (`receivables`). Thanh lý hợp đồng do `returns-and-compensation` / `receivables` chuyển.
- Lãi, phạt chậm trả (0.2 #48). Trừ ngày Tết/lễ, cách tính 45 ngày theo đợt hay cả hợp đồng (0.2b Q1, Q2): dùng công thức hiện chốt, đổi ở `rental-billing`.
- Giá bán mặc định trong danh mục: hợp đồng bán nhập giá tay.
- Cột giá tháng ở D9 (danh mục) vẫn hiện giá ngày × 30 để quy đổi như spec `item-catalog`; chỉ màn hợp đồng hiện theo số ngày thực tế của tháng.
- Ký điện tử, đính kèm file hợp đồng scan, mẫu in nhiều kiểu; in bằng mẫu duy nhất qua trình duyệt.
- Mobile: hợp đồng chỉ có trên Desktop.

## Capabilities

### New Capabilities

- `contracts`: hợp đồng cho thuê và bán: số tự sinh, loại, nhà thầu + công trình, dòng hàng theo bộ/mã, bán theo kg, điều khoản (thuê tối thiểu, chốt kỳ, hạn thanh toán, VAT), cách tính tiền thuê và giá trị dự kiến, bảng giá đền bù chép từ bảng chung, cọc và bảo lãnh, cảnh báo bảo lãnh, kế hoạch giao dự kiến, luồng Nháp → Chờ duyệt → Đã duyệt, duyệt khi nợ quá hạn, quyền theo loại, in báo giá, D4/D5/D5a.
- `contract-amendments`: phụ lục hợp đồng: số `/01`, nội dung đổi được, ngày hiệu lực sau kỳ đã chốt, duyệt lại, tra giá đang áp dụng tại một ngày, D5b.

### Modified Capabilities

- `auth`: bảng quyền thêm quyền hợp đồng thuê, hợp đồng bán và duyệt hợp đồng; server kiểm thêm phạm vi hợp đồng của tài khoản Kinh doanh.
- `user-management`: Giám đốc đặt phạm vi hợp đồng (Cả hai / Chỉ cho thuê / Chỉ bán) cho tài khoản Kinh doanh ở D17.
- `activity-log`: hợp đồng và phụ lục nằm trong danh sách chứng từ được ghi nhật ký.

## Impact

- **DB:** migration `drizzle/0014_contracts.sql`: bảng `contract`, `contract_revision` (bản gốc + phụ lục), `contract_kit`, `contract_line`, `contract_compensation`, `contract_deposit`, `contract_delivery_batch`, `contract_delivery_batch_line`; cột `user.contract_scope`; trigger khóa nội dung bản đã duyệt. Bảng thường (CRUD) cho `erp_app`, không thêm bảng chỉ ghi thêm.
- **Code mới:** `src/domain/contract.ts` (trạng thái, `transition()`), `src/domain/contract-code.ts` (số hợp đồng, phụ lục), `src/domain/rental.ts` (số ngày thuê, tối thiểu 45 ngày, giá trị dự kiến, giá tháng hiển thị), `src/domain/contract-revision.ts` (chọn bản áp dụng tại ngày, kiểm ngày hiệu lực), `src/domain/guarantee.ts` (cảnh báo bảo lãnh); `src/lib/contracts/` (service, hàm chờ `overdueDebt`, `lastClosedPeriodEnd`, tra giá theo ngày).
- **API:** `src/app/api/contracts/**` (danh sách, tạo, sửa, gửi, duyệt, trả lại, hủy, tra giá theo ngày, phụ lục).
- **Giao diện:** `src/app/(desktop)/sales/contracts/**` (D4, D5, D5a, D5b, trang in), thay trang giữ chỗ `/sales`; D17 thêm ô phạm vi hợp đồng.
- **Sửa:** `src/domain/permissions.ts`, `src/domain/activity.ts` (loại chứng từ `CONTRACT`, `CONTRACT_AMENDMENT`), `src/lib/users/`, seed dev (một hợp đồng chờ duyệt như D5, một hợp đồng đã duyệt có phụ lục nháp như D5b).
- **Dùng lại:** `document_counter`, `logActivity`, `withAuth`, `requirePermission`, `DateInput`, `printDocument`, tồn từ `src/lib/inventory/totals.ts`, `company_profile`.
- Không thêm thư viện.
