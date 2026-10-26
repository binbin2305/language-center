# PRD — Hệ thống Quản lý Trung tâm Ngoại ngữ

> Nguồn: SRS "Hệ thống quản lý trung tâm ngoại ngữ" (ĐH Thăng Long, 2025).
> Bộ tài liệu: PRD.md (cái gì & tại sao) · ARCHITECTURE.md (cấu trúc) · BACKEND_SCHEMA.md (dữ liệu & API) · DESIGN.md (giao diện) · RULES.md (luật cho agent) · TASK.md (việc cần làm, theo wave).
> Mục có nhãn **[Quyết định]** là điểm SRS bỏ ngỏ và đã được chốt khi chuyển đổi. Agent KHÔNG tự ý đổi; nếu thấy sai, ghi vào `docs/QUESTIONS.md`.

## 1. Bối cảnh & mục tiêu

Trung tâm ngoại ngữ đang quản lý thủ công / nhiều nguồn rời rạc → khó tra cứu, theo dõi, cập nhật chính xác. Hệ thống số hóa toàn bộ vòng đời học viên: tiếp nhận → kiểm tra đầu vào → xếp lớp → lịch học → điểm danh → kết quả → học phí → báo cáo.

**Thành công nghĩa là:**
- Nhân viên học vụ tiếp nhận và tạo hồ sơ một học viên trong < 3 phút, không tạo trùng.
- Không bao giờ xếp quá sĩ số tối đa, không bao giờ trùng phòng/giáo viên trong lịch học.
- Giáo viên điểm danh một lớp 20 học viên trong < 1 phút trên điện thoại.
- Mỗi vai trò chỉ thấy đúng dữ liệu mình được phép (RBAC + phạm vi dữ liệu).
- Quản lý xem được báo cáo tuyển sinh, chuyên cần, học tập, tài chính và xuất Excel/PDF.

## 2. Tác nhân (roles)

| Role (code) | Tên | Tóm tắt |
|---|---|---|
| `MANAGER` | Quản lý | Toàn quyền nghiệp vụ trừ điểm danh & nhập điểm; duyệt ưu đãi học phí; xem mọi báo cáo. |
| `ACADEMIC_STAFF` | Nhân viên học vụ | Tiếp nhận, hồ sơ, kiểm tra đầu vào, xếp lớp, lịch học, hỗ trợ điểm danh, học phí, báo cáo. |
| `TEACHER` | Giáo viên | Xem lịch dạy, điểm danh, nhập/sửa điểm lớp mình phụ trách, chấm kiểm tra đầu vào được phân công, tra cứu học phí học viên lớp mình. |
| `STUDENT` | Học viên | Tự phục vụ: đăng ký khóa học, xác nhận lớp, xem lịch, điểm danh, kết quả, học phí của chính mình. |

[Quyết định] Có thêm vai trò kỹ thuật `ADMIN` được seed sẵn, chỉ để quản lý tài khoản người dùng (tạo GV/NV/QL, khóa tài khoản). `MANAGER` cũng được quản lý tài khoản.

## 3. Ma trận quyền (chuẩn hóa từ Bảng 3.1 SRS)

✓ = được làm · S = chỉ phạm vi của mình · — = không

| Chức năng | QL | GV | HV | NVHV |
|---|---|---|---|---|
| Tiếp nhận thông tin đăng ký (UC01) | ✓ | — | — | ✓ |
| Tạo hồ sơ học viên (UC02) | ✓ | — | — | ✓ |
| Cập nhật thông tin đăng ký (UC03) | ✓ | — | S | ✓ |
| Quản lý khóa học, phòng học | ✓ | — | — | ✓ |
| Kiểm tra đầu vào: tạo lịch / gán GV | ✓ | — | — | ✓ |
| Kiểm tra đầu vào: chấm & nhận xét | — | S (được phân công) | — | — |
| Thêm / sửa / xóa lớp (UC04–06) | ✓ | — | — | ✓ |
| Xếp lớp, chuyển lớp, danh sách chờ (UC07) | ✓ | — | — | ✓ |
| Xác nhận lớp/lịch học | — | — | S | — |
| Tra cứu học viên (UC08) | ✓ | S (lớp phụ trách) | — | ✓ |
| Xem chi tiết hồ sơ (UC09) | ✓ | S (trường giới hạn) | S | ✓ |
| Cập nhật hồ sơ học viên (UC10) | ✓ | — | — | ✓ |
| Tạo / sửa / hủy lịch học (UC11–13) | ✓ | — | — | ✓ |
| Xem lịch học (UC14) | ✓ | S | S | ✓ |
| Điểm danh / cập nhật điểm danh (UC15–16) | — | S | — | ✓ |
| Xem lịch sử điểm danh (UC17) | ✓ | S | S | ✓ |
| Nhập / cập nhật kết quả (UC18–19) | — | S | — | — |
| Xem kết quả học tập (UC20) | ✓ | S | S | ✓ |
| Cập nhật học phí (UC21) | ✓ | — | — | ✓ |
| Duyệt giảm giá / học bổng | ✓ | — | — | — |
| Tra cứu học phí (UC22) | ✓ | S | S | ✓ |
| Xem & xuất báo cáo (UC23) | ✓ | — | — | ✓ |

[Quyết định] Xem lịch sử điểm danh của NVHV: toàn trung tâm (SRS UC17 ghi "lớp phụ trách" nhưng NVHV không có khái niệm lớp phụ trách).

## 4. Phạm vi chức năng — 8 phân hệ

Mỗi yêu cầu có mã `FR-xx`; test phải ghi mã này trong tên/describe để truy vết.

### 4.1 Tuyển sinh (UC01–03; US 1–5)
- **FR-ADM-01** Tiếp nhận thông tin (lead): họ tên*, ngày sinh*, giới tính*, SĐT*, email, địa chỉ, khóa học quan tâm*, ghi chú. Thiếu trường bắt buộc → lỗi 400 chỉ rõ trường.
- **FR-ADM-02** Phát hiện trùng: trùng SĐT hoặc email với lead/học viên đã có → trả `409 DUPLICATE_PERSON` kèm danh sách bản ghi trùng; người dùng có thể xem hồ sơ có sẵn hoặc xác nhận vẫn lưu (`force`). Áp dụng cả khi tiếp nhận lẫn khi tạo hồ sơ. Không tự gộp. SĐT/email **không** là khóa duy nhất của học viên (anh chị em dùng chung SĐT phụ huynh).
- **FR-ADM-03** Tạo hồ sơ học viên từ lead (bắt buộc có lead; không có → `404 LEAD_NOT_FOUND`). Sinh mã duy nhất `HV{YYYY}{seq 5 số}` ví dụ `HV202600042`. Lead đã có hồ sơ → `409 PROFILE_EXISTS`.
- **FR-ADM-04** Tạo hồ sơ đồng thời tạo tài khoản `STUDENT` (đăng nhập bằng email hoặc mã HV), mật khẩu tạm hiển thị 1 lần, bắt đổi khi đăng nhập lần đầu. [Quyết định]
- **FR-ADM-05** Tạo hồ sơ tạo luôn một `Enrollment` (đăng ký khóa học) cho khóa học quan tâm, trạng thái `PENDING_PLACEMENT`.
- **FR-ADM-06** Cập nhật thông tin đăng ký: NV/QL sửa mọi trường; Học viên chỉ sửa SĐT, email, địa chỉ của chính mình và đổi khóa học khi enrollment còn `PENDING_PLACEMENT`. Hủy thao tác = không lưu (FE).
- **FR-ADM-07** Học viên đã có tài khoản có thể tự đăng ký thêm khóa học → tạo Enrollment `PENDING_PLACEMENT`.
- **FR-ADM-08** Lead có trạng thái `NEW | PROFILE_CREATED | CANCELLED`; danh sách lead lọc theo trạng thái, khóa học, ngày.

### 4.2 Kiểm tra đầu vào (US 4–7) [Quyết định: thuộc phân hệ Tuyển sinh/Xếp lớp]
- **FR-PLT-01** NVHV tạo đợt kiểm tra đầu vào: khóa học, thời gian, phòng, GV chấm; thêm học viên (enrollment `PENDING_PLACEMENT`) vào đợt.
- **FR-PLT-02** Phòng/GV của đợt kiểm tra tham gia kiểm tra xung đột lịch như buổi học (FR-SCH-03).
- **FR-PLT-03** GV được phân công nhập điểm (0–10, bước 0.25 — cùng thang FR-GRD-02), trình độ đề xuất (level của khóa), nhận xét.
- **FR-PLT-04** Khi có kết quả: enrollment → `WAITING_CLASS`, lưu `placementLevel`. NVHV có thể bỏ qua kiểm tra (đánh dấu `skipPlacement` + level thủ công + lý do).

### 4.3 Xếp lớp (UC04–07; US 8–13)
- **FR-CLS-01** Thêm lớp: mã lớp* (duy nhất, không phân biệt hoa thường), tên*, khóa học*, trình độ*, GV phụ trách*, trợ giảng, phòng mặc định, sĩ số tối đa* (1–100), ngày bắt đầu*, ngày kết thúc*. Trùng mã → `409 CLASS_CODE_EXISTS`.
- **FR-CLS-02** Trạng thái lớp: `PLANNED` (Chờ mở) → `ONGOING` (Đang học) → `FINISHED` (Đã kết thúc); `INACTIVE` (Ngừng hoạt động).
- **FR-CLS-03** Cập nhật lớp: `maxCapacity < currentSize` → `422 CAPACITY_BELOW_CURRENT`.
- **FR-CLS-04** Xóa lớp: còn học viên `ENROLLED` hoặc có buổi học/điểm/hóa đơn liên quan → `422 CLASS_HAS_DEPENDENCIES` kèm lý do. Lớp không có dữ liệu liên quan → xóa cứng. [Quyết định] Lớp có lịch sử nhưng không còn học viên → chỉ cho chuyển `INACTIVE`.
- **FR-CLS-05** Tìm lớp phù hợp: lọc theo khóa, trình độ, trạng thái (`PLANNED|ONGOING`), còn chỗ, khung giờ học.
- **FR-CLS-06** Xếp học viên: chỉ enrollment `WAITING_CLASS`; kiểm tra (a) cùng khóa, (b) level lớp == placementLevel (sai lệch → cảnh báo, QL/NVHV có thể ghi đè với lý do), (c) lớp `PLANNED|ONGOING`, (d) còn chỗ. Tăng sĩ số **nguyên tử** (không bao giờ vượt max khi 2 người xếp cùng lúc). Enrollment → `ENROLLED`.
- **FR-CLS-07** Học viên xem và xác nhận lớp/lịch (`confirmedAt`). Chưa xác nhận vẫn được điểm danh. [Quyết định]
- **FR-CLS-08** Chuyển lớp: enrollment cũ → `TRANSFERRED`, tạo enrollment mới `ENROLLED` ở lớp đích, giảm/tăng sĩ số trong cùng transaction; lịch sử điểm danh/điểm của lớp cũ giữ nguyên.
- **FR-CLS-09** Danh sách chờ xếp lớp: mọi enrollment `WAITING_CLASS`, sắp theo ngày chờ, hiển thị số ngày chờ.
- **FR-CLS-10** Rút khỏi lớp / bảo lưu: enrollment → `CANCELLED` hoặc `RESERVED`, giảm sĩ số. Học lại sau bảo lưu: enrollment `RESERVED → WAITING_CLASS` (không tạo enrollment mới, không sinh hóa đơn mới). Xử lý hóa đơn khi rút/bảo lưu: BACKEND_SCHEMA §2.16.
- **FR-CLS-11** Kết thúc lớp (`FINISHED`, thao tác thủ công) → mọi enrollment `ENROLLED` của lớp → `COMPLETED`. Trạng thái lớp không tự đổi theo ngày.
- **FR-CLS-12** Sau khi rời lớp (chuyển, bảo lưu, rút, hoàn thành), học viên **vẫn xem được** điểm danh, kết quả, hóa đơn của lớp cũ; chỉ không còn thấy lịch tương lai của lớp đó.

### 4.4 Quản lý học viên (UC08–10)
- **FR-STU-01** Tra cứu theo mã HV, họ tên (không dấu, không phân biệt hoa thường, khớp một phần), SĐT, email; lọc trạng thái, lớp, khóa. Không nhập điều kiện → trả danh sách phân trang theo quyền.
- **FR-STU-02** Chi tiết hồ sơ: thông tin cá nhân, liên hệ, các enrollment (khóa, lớp, trạng thái), tóm tắt chuyên cần, kết quả, học phí. GV chỉ thấy: mã, tên, ngày sinh, lớp, SĐT (ẩn email, địa chỉ, học phí chi tiết). Hồ sơ đã xóa mềm → `404`.
- **FR-STU-03** Cập nhật hồ sơ: họ tên, ngày sinh, giới tính, SĐT, email, địa chỉ, trạng thái (`ACTIVE | RESERVED | DROPPED | COMPLETED`), ghi chú. Mọi thay đổi ghi audit log (before/after).
- **FR-STU-04** Đính kèm giấy tờ (ảnh/PDF ≤ 5MB, lưu local disk `uploads/`). [Quyết định]

### 4.5 Lịch học (UC11–14; US 15–20)
- **FR-SCH-01** Tạo lịch: (a) một buổi lẻ, hoặc (b) theo mẫu lặp: các thứ trong tuần + giờ bắt đầu/kết thúc + từ ngày đến ngày → sinh nhiều buổi (`Session`). Mỗi buổi có lớp, phòng, GV, startAt, endAt.
- **FR-SCH-02** Validate: endAt > startAt; buổi nằm trong [startDate, endDate] của lớp; phòng đủ chỗ cho sĩ số lớp (cảnh báo, không chặn).
- **FR-SCH-03** Xung đột: cùng phòng hoặc cùng GV có buổi (chưa hủy) chồng thời gian → `409 SCHEDULE_CONFLICT` kèm danh sách buổi xung đột. Với tạo hàng loạt: kiểm tra tất cả, nếu có bất kỳ xung đột thì không tạo buổi nào và trả toàn bộ xung đột.
- **FR-SCH-04** Cập nhật buổi (giờ, phòng, GV): kiểm tra xung đột (loại trừ chính nó). Buổi không tồn tại → `404`. Buổi đã điểm danh hoặc đã qua → không đổi được giờ (`422 SESSION_LOCKED`).
- **FR-SCH-05** Hủy buổi: bắt buộc lý do; chỉ buổi `SCHEDULED` và chưa bắt đầu; sau đó → `CANCELLED`. Hủy theo lớp: hủy mọi buổi tương lai của lớp.
- **FR-SCH-06** Tạo / sửa / hủy gửi thông báo in-app cho GV và học viên `ENROLLED` của lớp.
- **FR-SCH-07** Xem lịch theo ngày/tuần/tháng; HV: lớp mình đang học; GV: buổi mình dạy; NVHV/QL: tất cả, lọc theo lớp/GV/phòng. Không có dữ liệu → trạng thái rỗng "Chưa có lịch học".
- **FR-SCH-08** Buổi tự chuyển `COMPLETED` khi đã điểm danh và đã qua endAt (tính khi đọc, không cần cron). [Quyết định]

### 4.6 Điểm danh (UC15–17; US 21–26)
- **FR-ATT-01** Trạng thái: `PRESENT` (Có mặt), `LATE` (Đi muộn), `EXCUSED` (Vắng có phép), `UNEXCUSED` (Vắng không phép). [Quyết định: dùng đủ 4 trạng thái theo mục tiêu 1.2.2]
- **FR-ATT-02** Điểm danh một buổi: GV của buổi (kể cả dạy thay), GV/trợ giảng của lớp, hoặc NVHV (ARCHITECTURE §4.6); chỉ khi buổi không bị hủy và `now >= startAt - 15 phút`. Danh sách = học viên `ENROLLED` của lớp tại thời điểm buổi học. Phải gửi trạng thái cho **tất cả** học viên; thiếu → `400 ATTENDANCE_INCOMPLETE` kèm danh sách thiếu. Ghi chú buổi học tùy chọn.
- **FR-ATT-03** Cập nhật điểm danh: thay trạng thái một/nhiều học viên, lý do tùy chọn; lưu lịch sử thay đổi (ai, khi nào, từ → sang). [Quyết định] GV chỉ được sửa trong 7 ngày sau buổi học; NVHV sửa không giới hạn.
- **FR-ATT-04** Lịch sử điểm danh: HV của mình; GV lớp mình dạy; NVHV/QL tất cả. Lọc khoảng thời gian, lớp, học viên. Tổng hợp: số buổi theo từng trạng thái, tỷ lệ chuyên cần = (PRESENT + LATE) / số buổi đã điểm danh.
- **FR-ATT-05** Cảnh báo vắng: học viên có tỷ lệ vắng (EXCUSED + UNEXCUSED) > ngưỡng `attendanceWarningThreshold` (mặc định 20%) được đánh dấu trong danh sách lớp và gửi thông báo cho học viên + NVHV một lần mỗi khi vượt ngưỡng.

### 4.7 Kết quả học tập (UC18–20; US 27–31)
- **FR-GRD-01** Bài đánh giá (Assessment) theo lớp: tên, loại (`QUIZ | MIDTERM | FINAL | SKILL`), trọng số (%), ngày thi. GV lớp hoặc NVHV tạo. Tổng trọng số các bài của lớp ≤ 100.
- **FR-GRD-02** Thang điểm 0–10, bước 0.25. [Quyết định] Điểm ngoài thang → `400` chỉ rõ học viên nào.
- **FR-GRD-03** Nhập điểm hàng loạt cho một bài: thiếu điểm → cho phép lưu nháp (`isDraft=true`); "Xác nhận" yêu cầu đủ mọi học viên. Học viên không thấy điểm nháp.
- **FR-GRD-04** Cập nhật điểm đã xác nhận: bắt buộc lý do; lưu lịch sử. Bảng điểm khóa sau `gradeLockDays` (mặc định 14) ngày kể từ ngày thi → `422 GRADEBOOK_LOCKED`. QL có thể mở khóa một bài (đặt `unlockedUntil`).
- **FR-GRD-05** Điểm trung bình = Σ(điểm × trọng số) / Σ(trọng số của các bài đã có điểm xác nhận), làm tròn 2 chữ số. Xếp loại: ≥ 9.0 Xuất sắc · ≥ 8.0 Giỏi · ≥ 6.5 Khá · ≥ 5.0 Trung bình · < 5.0 Không đạt. Đạt khi ≥ 5.0. [Quyết định]
- **FR-GRD-06** Xem kết quả: HV của mình; GV lớp mình; NVHV/QL lọc theo khóa/lớp/học viên. Chưa có điểm → "Chưa có kết quả học tập".
- **FR-GRD-07** Nếu setting `resultViewRequiresPaidFees = true` và học viên còn hóa đơn quá hạn chưa đóng đủ → HV bị chặn xem (`403 FEES_OUTSTANDING`) kèm hướng dẫn liên hệ NVHV. Mặc định `false`.
- **FR-GRD-08** Xuất phiếu điểm PDF cho một học viên trong một lớp.

### 4.8 Học phí (UC21–22; US 32–35)
- **FR-FEE-01** Học phí niêm yết theo khóa (`Course.baseFee`, VND, số nguyên ≥ 0). QL/NVHV sửa.
- **FR-FEE-02** Khi enrollment → `ENROLLED` lần đầu, tự sinh hóa đơn (Invoice) = baseFee, hạn đóng = ngày bắt đầu lớp + 7 ngày. [Quyết định] Chuyển lớp cùng khóa không sinh hóa đơn mới.
- **FR-FEE-03** Giảm giá/học bổng: NVHV đề xuất (phần trăm hoặc số tiền + lý do) → trạng thái `PENDING_APPROVAL`; QL duyệt/từ chối. QL tự áp dụng thì duyệt luôn. Số tiền sau giảm ≥ 0.
- **FR-FEE-04** Ghi nhận thanh toán: số tiền > 0, ≤ số còn nợ, phương thức (`CASH | BANK_TRANSFER | CARD`), ngày, ghi chú. Cập nhật `amountPaid`, `balance`, trạng thái `UNPAID | PARTIAL | PAID`. Hủy phiếu thu (void) cần lý do, chỉ QL.
- **FR-FEE-05** Hóa đơn quá hạn: `dueDate < hôm nay` và `balance > 0` → cờ `overdue` (tính khi đọc).
- **FR-FEE-06** Tra cứu: HV của mình (tổng phải đóng, đã đóng, còn nợ, hạn, lịch sử giao dịch); GV học viên lớp mình (chỉ trạng thái & còn nợ); NVHV/QL lọc theo mã HV, lớp, khoảng thời gian, trạng thái công nợ.
- **FR-FEE-07** In phiếu thu PDF.

### 4.9 Báo cáo thống kê (UC23; US 36–37)
- **FR-RPT-01** Tuyển sinh: số lead, số hồ sơ mới, tỷ lệ chuyển đổi lead→hồ sơ, số xếp lớp, số đang chờ — theo khoảng thời gian, theo khóa.
- **FR-RPT-02** Chuyên cần: tỷ lệ chuyên cần theo lớp, theo học viên; danh sách học viên vượt ngưỡng vắng.
- **FR-RPT-03** Học tập: điểm TB theo lớp/khóa, phân bố xếp loại, tỷ lệ đạt/không đạt, theo GV.
- **FR-RPT-04** Tài chính: doanh thu thực thu (theo ngày thanh toán), tổng phải thu, công nợ, quá hạn, tổng giảm giá — theo tháng/khóa/lớp.
- **FR-RPT-05** Hiển thị bảng + biểu đồ; xuất Excel (.xlsx) và PDF. Không có dữ liệu → "Không có dữ liệu thống kê cho khoảng thời gian này".
- **FR-RPT-06** Tổng quan (dashboard) cho QL/NVHV: số HV đang học, lớp đang mở, buổi học hôm nay, công nợ quá hạn, HV chờ xếp lớp.

### 4.10 Xuyên suốt
- **FR-AUTH-01** Đăng nhập email/mã HV + mật khẩu; JWT access (15 phút) + refresh (7 ngày, httpOnly cookie, xoay vòng). Đăng xuất thu hồi refresh token. Khóa tài khoản sau 5 lần sai liên tiếp trong 15 phút.
- **FR-AUTH-02** Đổi mật khẩu; bắt buộc đổi khi `mustChangePassword`. Mật khẩu ≥ 8 ký tự, có chữ và số.
- **FR-USR-01** QL/ADMIN tạo, sửa, khóa tài khoản GV, NVHV, QL. GV có chuyên môn (ngôn ngữ, trình độ).
- **FR-NTF-01** Thông báo in-app: danh sách, số chưa đọc, đánh dấu đã đọc. Không gửi email/SMS.
- **FR-AUD-01** Audit log cho mọi thao tác ghi trên hồ sơ, lớp, lịch, điểm danh, điểm, học phí.
- **FR-SET-01** Cài đặt trung tâm (QL): `attendanceWarningThreshold`, `gradeLockDays`, `resultViewRequiresPaidFees`, `teacherAttendanceEditDays`, tên trung tâm.

## 5. Yêu cầu phi chức năng
- **NFR-01 Bảo mật:** bcrypt (cost 12); mọi endpoint (trừ login/refresh/health) yêu cầu JWT; RBAC + kiểm tra phạm vi dữ liệu ở service; không trả `passwordHash`; rate limit login 10 req/phút/IP; helmet; CORS chỉ origin FE.
- **NFR-02 Hiệu năng:** API danh sách p95 < 300ms với 10.000 học viên, 500 lớp, 50.000 buổi học (dữ liệu seed lớn có script riêng).
- **NFR-03 Toàn vẹn:** thao tác nhiều document (xếp lớp, chuyển lớp, thanh toán) dùng MongoDB transaction.
- **NFR-04 Ngôn ngữ & giờ:** giao diện tiếng Việt; lưu thời gian UTC; hiển thị & tính "ngày" theo `Asia/Ho_Chi_Minh`; tiền VND số nguyên, hiển thị `1.500.000 ₫`.
- **NFR-05 Thiết bị:** màn hình nhân viên tối ưu desktop ≥ 1280px; màn hình GV (lịch, điểm danh, nhập điểm) và HV dùng được ở 375px.
- **NFR-06 Khả năng truy cập:** điều hướng bằng bàn phím, label cho mọi input, tương phản AA.
- **NFR-07 Chất lượng:** TDD; coverage dòng ≥ 85% cho `apps/api/src/modules/**` và ≥ 75% cho `apps/web/src/features/**`; mọi FR có ít nhất một test có mã FR.

## 6. Ngoài phạm vi (Non-goals)
- Thanh toán online / cổng thanh toán; hóa đơn điện tử VAT.
- Gửi email, SMS, Zalo, push notification.
- Nhiều chi nhánh; đa ngôn ngữ giao diện.
- Ứng dụng di động native; LMS (bài giảng, bài tập online, thi online).
- Tính lương giáo viên.

## 7. Anti-goals (coi là thất bại dù "chạy được")
- Vượt sĩ số khi hai người xếp lớp đồng thời.
- Trùng phòng hoặc trùng giáo viên.
- Học viên/giáo viên nhìn thấy dữ liệu ngoài phạm vi (ví dụ HV gọi API với id học viên khác mà xem được).
- Sửa điểm/điểm danh/học phí mà không để lại lịch sử.
- Số tiền sai do dấu phẩy động.

## 8. Truy vết User Story → FR
| US | FR |
|---|---|
| 1 | FR-ADM-07 | 
| 2 | FR-ADM-01..05 |
| 3 | FR-ADM-06, FR-STU-01..03 |
| 4–7 | FR-PLT-01..04 |
| 8–10 | FR-CLS-05, 06 |
| 11 | FR-CLS-07 |
| 12 | FR-CLS-08, FR-CLS-10..12 |
| 13 | FR-CLS-09 |
| 14 | FR-RPT-01, FR-RPT-06 |
| 15–20 | FR-SCH-01..08 |
| 21–26 | FR-ATT-01..05 |
| 27–31 | FR-GRD-01..08 |
| 32–35 | FR-FEE-01..07 |
| 36–37 | FR-RPT-01..05 |
