# contract-amendments Specification

## Purpose
Phụ lục là cách duy nhất để đổi hợp đồng đã duyệt: giá mới áp từ ngày hiệu lực, kỳ đã chốt không tính lại, và hệ thống tra được giá, giá đền bù, điều khoản đang áp dụng tại một ngày bất kỳ.

## Requirements

### Requirement: Lập phụ lục cho hợp đồng đã duyệt
Người có quyền sửa loại hợp đồng đó SHALL lập được phụ lục cho hợp đồng Đã duyệt hoặc Đang thực hiện. Hợp đồng Nháp, Chờ duyệt, Thanh lý, Đã hủy SHALL không lập phụ lục. Mỗi hợp đồng SHALL có tối đa một phụ lục chưa xong (Nháp hoặc Chờ duyệt) tại một lúc.

#### Scenario: Lập phụ lục
- **WHEN** `quocbao` bấm "Lập phụ lục" trên D5 của `112026/ANPHAT-MINHPHAT` Đã duyệt
- **THEN** D5b mở phụ lục Nháp, điền sẵn bảng "Hiện tại" bằng nội dung đang áp dụng

#### Scenario: Hợp đồng chưa duyệt
- **WHEN** có lệnh lập phụ lục cho hợp đồng Chờ duyệt
- **THEN** hệ thống từ chối với "Hợp đồng chưa duyệt nên chưa lập phụ lục được. Bạn sửa thẳng khi hợp đồng còn Nháp." và không tạo phụ lục

#### Scenario: Đã có phụ lục chưa xong
- **WHEN** hợp đồng có phụ lục `/01` đang Chờ duyệt và `quocbao` lập thêm phụ lục
- **THEN** hệ thống từ chối với "Hợp đồng đang có phụ lục 01 chưa duyệt. Bạn chờ duyệt xong hoặc hủy phụ lục đó trước." và không tạo phụ lục

### Requirement: Số phụ lục
Phụ lục SHALL có số = số hợp đồng + `/` + thứ tự hai chữ số theo hợp đồng (`/01`, `/02`...), cấp khi tạo, không đổi, không dùng lại kể cả khi phụ lục bị hủy. Hai lệnh tạo phụ lục cùng lúc cho một hợp đồng SHALL không ra hai phụ lục cùng số.

#### Scenario: Phụ lục đầu tiên
- **WHEN** `quocbao` lập phụ lục đầu tiên cho `112026/ANPHAT-MINHPHAT`
- **THEN** phụ lục có số `112026/ANPHAT-MINHPHAT/01`

#### Scenario: Phụ lục bị hủy không dùng lại số
- **WHEN** phụ lục `/01` bị hủy rồi `quocbao` lập phụ lục mới
- **THEN** phụ lục mới có số `112026/ANPHAT-MINHPHAT/02`

#### Scenario: Tạo cùng lúc
- **WHEN** `quocbao` và Giám đốc cùng bấm "Lập phụ lục" cho một hợp đồng vào cùng một lúc
- **THEN** đúng một phụ lục `/01` được tạo **AND** lệnh kia nhận "Hợp đồng đang có phụ lục 01 chưa duyệt. Bạn chờ duyệt xong hoặc hủy phụ lục đó trước."

### Requirement: Nội dung đổi được qua phụ lục
Phụ lục SHALL đổi được: số lượng và giá dòng hàng, thêm mã mới, ngày kết thúc dự kiến, thuê tối thiểu, hạn thanh toán, VAT và thuế suất, bảng giá đền bù, cọc và bảo lãnh, kế hoạch giao. Phụ lục SHALL không đổi loại, nhà thầu, công trình, ngày ký, ngày bắt đầu, và không bỏ dòng hàng đã có. Ngày kết thúc dự kiến mới SHALL sau ngày hiệu lực. Phụ lục SHALL có lý do (1–500 ký tự) và ít nhất một thay đổi.

#### Scenario: Đổi giá và thêm mã
- **WHEN** phụ lục đổi giá `CHEO1,7` từ 300 ₫ thành 400 ₫/ngày và thêm `CC3` 200 cái × 700 ₫/ngày
- **THEN** D5b hiện "Tiền thuê 1 ngày · 1.330.000 ₫ → 1.530.000 ₫" và đánh dấu hai ô đổi

#### Scenario: Đổi nhà thầu
- **WHEN** có lệnh phụ lục đổi nhà thầu sang `NT-0005`
- **THEN** hệ thống từ chối với "Phụ lục không đổi được loại, nhà thầu, công trình, ngày ký hay ngày bắt đầu. Bạn lập hợp đồng mới nếu cần đổi những mục này." và không lưu

#### Scenario: Đổi ngày bắt đầu
- **WHEN** có lệnh phụ lục đổi ngày bắt đầu từ 01/11/2026 sang 05/11/2026
- **THEN** hệ thống từ chối với cùng câu "Phụ lục không đổi được loại, nhà thầu, công trình, ngày ký hay ngày bắt đầu. Bạn lập hợp đồng mới nếu cần đổi những mục này." và không lưu

#### Scenario: Ngày kết thúc mới trước ngày hiệu lực
- **WHEN** phụ lục hiệu lực 15/12/2026 đặt ngày kết thúc dự kiến mới 10/12/2026
- **THEN** hệ thống từ chối với "Ngày kết thúc dự kiến mới phải sau ngày hiệu lực của phụ lục (15/12/2026)." và không lưu

#### Scenario: Bỏ dòng hàng
- **WHEN** có lệnh phụ lục bỏ dòng `KU0,5` khỏi hợp đồng
- **THEN** hệ thống từ chối với "Phụ lục không bỏ được dòng hàng đã có. Bạn giữ dòng và sửa số lượng dự kiến." và không lưu

#### Scenario: Không có thay đổi
- **WHEN** `quocbao` gửi duyệt phụ lục giống hệt nội dung đang áp dụng
- **THEN** hệ thống từ chối với "Phụ lục chưa có thay đổi nào." và phụ lục vẫn Nháp

### Requirement: Ngày hiệu lực của phụ lục
Ngày hiệu lực SHALL không trước ngày bắt đầu hợp đồng, không trước ngày hiệu lực của phụ lục đã duyệt gần nhất, và SHALL sau ngày cuối của kỳ tính tiền thuê đã chốt gần nhất. Hệ thống SHALL kiểm lúc lưu, lúc gửi duyệt và lúc duyệt. D5b SHALL hiện ngày cuối kỳ đã chốt gần nhất.

#### Scenario: Ngày hiệu lực trong kỳ đã chốt
- **WHEN** kỳ 01–30/11/2026 của hợp đồng đã chốt và `quocbao` đặt ngày hiệu lực 30/11/2026
- **THEN** hệ thống từ chối với "Ngày hiệu lực phải sau ngày chốt kỳ gần nhất (30/11/2026). Kỳ đã chốt không tính lại." và không lưu

#### Scenario: Ngày đầu tiên sau kỳ đã chốt
- **WHEN** kỳ 01–30/11/2026 đã chốt và ngày hiệu lực là 01/12/2026
- **THEN** phụ lục được lưu

#### Scenario: Kỳ được chốt trong lúc chờ duyệt
- **WHEN** phụ lục hiệu lực 15/12/2026 đang Chờ duyệt, rồi kỳ 01–31/12/2026 được chốt, rồi Giám đốc duyệt phụ lục
- **THEN** hệ thống từ chối duyệt với "Ngày hiệu lực phải sau ngày chốt kỳ gần nhất (31/12/2026). Kỳ đã chốt không tính lại." **AND** phụ lục vẫn Chờ duyệt

#### Scenario: Chưa có kỳ nào được chốt
- **WHEN** hợp đồng bắt đầu 01/11/2026, chưa có kỳ nào chốt, và ngày hiệu lực là 05/11/2026
- **THEN** phụ lục được lưu **AND** D5b hiện "Chưa có kỳ nào được chốt"

#### Scenario: Trước ngày bắt đầu hợp đồng
- **WHEN** hợp đồng bắt đầu 01/11/2026 và ngày hiệu lực là 25/10/2026
- **THEN** hệ thống từ chối với "Ngày hiệu lực không được trước ngày bắt đầu hợp đồng (01/11/2026)." và không lưu

### Requirement: Duyệt lại phụ lục
Phụ lục SHALL đi Nháp → Chờ duyệt → Đã duyệt; Giám đốc trả lại về Nháp kèm lý do; Nháp hoặc Chờ duyệt hủy được. Chỉ Giám đốc SHALL duyệt và trả lại. Phụ lục chỉ có hiệu lực sau khi duyệt; phụ lục chưa duyệt SHALL không ảnh hưởng giá đang áp dụng. Phụ lục đã duyệt SHALL không sửa, không hủy được. Duyệt phụ lục khi nhà thầu nợ quá hạn theo cùng luật lý do như hợp đồng.

#### Scenario: Duyệt phụ lục
- **WHEN** Giám đốc duyệt phụ lục `/01` hiệu lực 15/12/2026
- **THEN** phụ lục sang Đã duyệt **AND** D5 "Các bản của hợp đồng" hiện "Phụ lục 01 · 15/12/2026 · Đã duyệt"

#### Scenario: Kinh doanh duyệt phụ lục
- **WHEN** `quocbao` gửi `POST /api/contracts/<id>/amendments/01/approve`
- **THEN** API trả 403 và phụ lục vẫn Chờ duyệt

#### Scenario: Phụ lục chưa duyệt không đổi giá
- **WHEN** phụ lục `/01` hiệu lực 15/12/2026 đổi giá `H1,7` thành 1.400 ₫ còn Chờ duyệt
- **THEN** giá `H1,7` áp dụng ngày 20/12/2026 vẫn là 1.200 ₫

#### Scenario: Sửa phụ lục đã duyệt
- **WHEN** có lệnh sửa phụ lục `/01` đã duyệt
- **THEN** hệ thống từ chối với "Phụ lục đã duyệt không sửa được. Bạn lập phụ lục mới." và không đổi dữ liệu

### Requirement: Hủy hợp đồng thì hủy phụ lục chưa xong
Khi hợp đồng đã duyệt bị hủy, phụ lục đang Nháp hoặc Chờ duyệt của nó SHALL bị hủy trong cùng transaction, mỗi phụ lục một dòng nhật ký Hủy với lý do "Hợp đồng đã hủy". Lưu, gửi duyệt, duyệt hay trả lại phụ lục của hợp đồng không còn Đã duyệt hoặc Đang thực hiện SHALL bị từ chối.

#### Scenario: Hủy hợp đồng có phụ lục chờ duyệt
- **WHEN** `112026/ANPHAT-MINHPHAT` Đã duyệt, chưa xuất hàng, có phụ lục `/01` Chờ duyệt, và Giám đốc hủy hợp đồng
- **THEN** hợp đồng sang Đã hủy **AND** `/01` sang Đã hủy **AND** nhật ký có một dòng Hủy hợp đồng và một dòng Hủy `112026/ANPHAT-MINHPHAT/01` "Hợp đồng đã hủy"

#### Scenario: Duyệt phụ lục của hợp đồng đã hủy
- **WHEN** có lệnh duyệt phụ lục `/01` sau khi hợp đồng đã hủy
- **THEN** hệ thống từ chối với "Hợp đồng đã hủy nên không duyệt phụ lục được." và không đổi dữ liệu

#### Scenario: Gửi duyệt phụ lục của hợp đồng đã hủy
- **WHEN** tab cũ của `quocbao` gửi duyệt phụ lục `/01` sau khi hợp đồng đã hủy
- **THEN** hệ thống từ chối với "Hợp đồng đã hủy nên không gửi duyệt phụ lục được." và không có dòng nhật ký mới

### Requirement: Giá đang áp dụng tại một ngày
Với một hợp đồng và một ngày X, hệ thống SHALL trả bản đang áp dụng: phụ lục đã duyệt có ngày hiệu lực lớn nhất mà ≤ X, nếu không có thì bản gốc. Hai bản cùng ngày hiệu lực thì bản có số lớn hơn (lập sau) thắng. Kết quả SHALL gồm giá ngày từng mã, giá đền bù, thuê tối thiểu, hạn thanh toán, VAT, và số của bản đó. Ngày hiệu lực thuộc bản mới. Change tính tiền thuê SHALL đọc giá qua đây.

#### Scenario: Trước ngày hiệu lực
- **WHEN** bản gốc có `H1,7` 1.200 ₫/ngày, phụ lục `/01` đã duyệt hiệu lực 15/12/2026 đổi thành 1.400 ₫, tra ngày 14/12/2026
- **THEN** giá `H1,7` là 1.200 ₫ từ bản `112026/ANPHAT-MINHPHAT`

#### Scenario: Đúng ngày hiệu lực
- **WHEN** tra ngày 15/12/2026 với cùng hợp đồng
- **THEN** giá `H1,7` là 1.400 ₫ từ bản `112026/ANPHAT-MINHPHAT/01`

#### Scenario: Hai phụ lục
- **WHEN** phụ lục `/01` hiệu lực 15/12/2026 (1.400 ₫) và `/02` hiệu lực 01/02/2027 (1.300 ₫) đều đã duyệt, tra ngày 10/01/2027 và 01/02/2027
- **THEN** ngày 10/01/2027 giá 1.400 ₫ **AND** ngày 01/02/2027 giá 1.300 ₫

#### Scenario: Hai bản cùng ngày hiệu lực
- **WHEN** phụ lục `/01` (1.400 ₫) và `/02` (1.350 ₫) đều đã duyệt, cùng hiệu lực 15/12/2026, tra ngày 15/12/2026
- **THEN** giá `H1,7` là 1.350 ₫ từ bản `112026/ANPHAT-MINHPHAT/02`

#### Scenario: Phụ lục cùng ngày bắt đầu hợp đồng
- **WHEN** hợp đồng bắt đầu 01/11/2026 (1.200 ₫) và phụ lục `/01` đã duyệt hiệu lực 01/11/2026 (1.250 ₫), tra ngày 01/11/2026
- **THEN** giá `H1,7` là 1.250 ₫ từ bản `/01`

#### Scenario: Mã thêm bằng phụ lục
- **WHEN** `CC3` thêm bằng phụ lục `/01` hiệu lực 15/12/2026, tra ngày 10/12/2026
- **THEN** kết quả không có giá cho `CC3`

#### Scenario: VAT đổi bằng phụ lục
- **WHEN** bản gốc không VAT và phụ lục `/01` hiệu lực 15/12/2026 bật VAT 8 %
- **THEN** tra ngày 14/12/2026 ra không VAT **AND** tra ngày 15/12/2026 ra VAT 8 %

### Requirement: Màn lập phụ lục D5b
D5b SHALL hiện ngày hiệu lực (ô `DateInput`), lý do, bảng hàng và giá "Hiện tại ↔ Mới" (dòng không đổi vẫn hiện để đối chiếu, ô đổi được đánh dấu), các thay đổi khác, tiền thuê 1 ngày trước và sau, ô ảnh hưởng tới tiền thuê (kỳ đã chốt không đổi; trước ngày hiệu lực giá cũ; từ ngày hiệu lực giá mới) và danh sách các bản của hợp đồng.

#### Scenario: Ô ảnh hưởng tới tiền thuê
- **WHEN** kỳ 11/2026 đã chốt và phụ lục hiệu lực 15/12/2026
- **THEN** D5b hiện "Kỳ 11/2026 · Đã chốt · không đổi", "01–14/12/2026 · Giá cũ", "Từ 15/12/2026 · Giá mới" **AND** ghi "Hàng thêm chỉ tính tiền từ ngày thực giao, không từ ngày hiệu lực."

#### Scenario: Ghi chú hợp đồng đã duyệt
- **WHEN** `quocbao` mở D5b
- **THEN** đầu trang ghi "Hợp đồng đã duyệt không sửa thẳng. Phụ lục cần Giám đốc duyệt lại mới có hiệu lực."

### Requirement: Nhật ký thao tác phụ lục
Mỗi lệnh làm đổi phụ lục SHALL ghi đúng một dòng nhật ký trong cùng transaction với mã là số phụ lục: Tạo, Sửa (chỉ khi có trường đổi), Gửi duyệt, Duyệt, Trả lại, Hủy. Tóm tắt Duyệt SHALL ghi ngày hiệu lực và tiền thuê 1 ngày trước → sau.

#### Scenario: Duyệt phụ lục ghi nhật ký
- **WHEN** Giám đốc duyệt `112026/ANPHAT-MINHPHAT/01` hiệu lực 15/12/2026, tiền thuê 1 ngày 1.330.000 ₫ → 1.690.000 ₫
- **THEN** có một dòng Duyệt `112026/ANPHAT-MINHPHAT/01` "Hiệu lực 15/12/2026 · tiền thuê 1 ngày 1.330.000 ₫ → 1.690.000 ₫"

#### Scenario: Ngày hiệu lực bị từ chối không ghi
- **WHEN** lưu phụ lục bị từ chối vì ngày hiệu lực trong kỳ đã chốt
- **THEN** không có dòng nhật ký mới
