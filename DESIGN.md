# DESIGN — Giao diện & trải nghiệm

[Quyết định] SRS không có mockup. Phần này là thiết kế đề xuất; có thể thay đổi màu/typography mà không ảnh hưởng nghiệp vụ.

## 1. Nguyên tắc
1. **Công cụ làm việc, không phải trang quảng cáo.** Mật độ thông tin vừa phải, bảng là trung tâm, ít trang trí.
2. **Mỗi vai trò thấy đúng thứ mình cần ngay khi đăng nhập.** Trang chủ khác nhau theo role.
3. **Không bất ngờ:** mọi thao tác phá hủy có hộp xác nhận; lỗi nghiệp vụ hiển thị bằng câu tiếng Việt cụ thể (kèm dữ liệu: "Phòng P201 đã có lớp IELTS-01 lúc 18:00–19:30 thứ 3, 14/01").
4. **Điện thoại cho GV & HV:** lịch, điểm danh, nhập điểm, xem kết quả, học phí dùng tốt ở 375px.
5. **Tiếng Việt toàn bộ**, ngày `dd/MM/yyyy`, giờ `HH:mm`, tiền `1.500.000 ₫`.

## 2. Design tokens (Tailwind theme + CSS variables của shadcn)

| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--primary` | `#1D4ED8` (blue-700) | `#3B82F6` | nút chính, link, mục đang chọn |
| `--background` | `#F8FAFC` | `#0B1220` | nền trang |
| `--card` | `#FFFFFF` | `#111827` | thẻ, bảng |
| `--foreground` | `#0F172A` | `#E5E7EB` | chữ |
| `--muted-foreground` | `#64748B` | `#94A3B8` | chữ phụ |
| `--border` | `#E2E8F0` | `#1F2937` | viền |
| `--destructive` | `#DC2626` | `#EF4444` | xóa, lỗi, vắng không phép |
| `--success` | `#16A34A` | `#22C55E` | có mặt, đã thanh toán |
| `--warning` | `#D97706` | `#F59E0B` | đi muộn, thanh toán một phần, cảnh báo |
| `--info` | `#0891B2` | `#06B6D4` | vắng có phép, thông tin |

- Font: **Be Vietnam Pro** (Google Fonts) 400/500/600; số dùng `tabular-nums` trong bảng.
- Cỡ chữ: body 14px (desktop), 16px (mobile); tiêu đề trang 24px/600.
- Bo góc 8px; khoảng cách theo bội số 4px; shadow chỉ cho popover/dialog.
- Dark mode: theo hệ thống, có nút chuyển trong menu người dùng.

### Badge trạng thái (component `StatusBadge`, map tập trung trong `lib/status.ts`)
| Nhóm | Giá trị → nhãn (màu) |
|---|---|
| Lớp | PLANNED Chờ mở (info) · ONGOING Đang học (success) · FINISHED Đã kết thúc (muted) · INACTIVE Ngừng hoạt động (muted) |
| Enrollment | PENDING_PLACEMENT Chờ kiểm tra (info) · WAITING_CLASS Chờ xếp lớp (warning) · ENROLLED Đang học (success) · TRANSFERRED Đã chuyển lớp (muted) · RESERVED Bảo lưu (muted) · COMPLETED Hoàn thành (primary) · CANCELLED Đã hủy (destructive) |
| Điểm danh | PRESENT Có mặt (success) · LATE Đi muộn (warning) · EXCUSED Vắng có phép (info) · UNEXCUSED Vắng không phép (destructive) |
| Hóa đơn | UNPAID Chưa thanh toán (destructive) · PARTIAL Thanh toán một phần (warning) · PAID Đã thanh toán (success) · VOID Đã hủy (muted) · + nhãn "Quá hạn" (destructive, viền) |
| Buổi học | SCHEDULED Đã lên lịch · CANCELLED Đã hủy (gạch ngang) · COMPLETED Đã học |

## 3. Khung ứng dụng (AppShell)

```
┌───────────────────────────────────────────────────────────────────────┐
│ ☰  Trung tâm Ngoại ngữ ABC        [🔍 Tìm học viên (Ctrl+K)]  🔔3  👤 ▾│  Topbar 56px
├──────────────┬────────────────────────────────────────────────────────┤
│ Tổng quan    │  Học viên › HV202600042                                 │ Breadcrumb
│ Tuyển sinh   │  ┌──────────────────────────────────────────────────┐   │
│ Học viên     │  │ Tiêu đề trang                     [Hành động chính]│  │ PageHeader
│ Lớp học      │  ├──────────────────────────────────────────────────┤   │
│ Xếp lớp      │  │ Bộ lọc ......                                     │   │
│ Lịch học     │  │ Bảng / nội dung                                   │   │
│ Điểm danh    │  │                                                   │   │
│ Kết quả      │  └──────────────────────────────────────────────────┘   │
│ Học phí      │                                                         │
│ Báo cáo      │                                                         │
│ ─────────    │                                                         │
│ Danh mục ▸   │  (Khóa học, Phòng học, Tài khoản, Cài đặt)              │
└──────────────┴────────────────────────────────────────────────────────┘
 Sidebar 240px (thu gọn 64px; < 1024px thành drawer)
```
- Mobile (< 768px) cho GV/HV: bottom navigation 4–5 mục thay sidebar.
- Ctrl+K: command palette tìm học viên/lớp (M, S, T).
- Chuông thông báo: popover 10 thông báo mới nhất + "Xem tất cả".

### Menu theo vai trò
| Mục | M | S | T | H |
|---|---|---|---|---|
| Tổng quan (dashboard) | ✓ | ✓ | Hôm nay của tôi | Trang của tôi |
| Tuyển sinh (Leads, Kiểm tra đầu vào) | ✓ | ✓ | Kiểm tra đầu vào được phân công | — |
| Học viên | ✓ | ✓ | Học viên lớp tôi | Hồ sơ của tôi |
| Lớp học | ✓ | ✓ | Lớp của tôi | Lớp của tôi |
| Xếp lớp (Danh sách chờ) | ✓ | ✓ | — | — |
| Lịch học | ✓ | ✓ | Lịch dạy | Lịch học |
| Điểm danh | ✓ (xem) | ✓ | ✓ | Chuyên cần của tôi |
| Kết quả học tập | ✓ | ✓ | ✓ | Kết quả của tôi |
| Học phí | ✓ | ✓ | Tra cứu | Học phí của tôi |
| Báo cáo | ✓ | ✓ | — | — |
| Danh mục: Khóa học, Phòng | ✓ | ✓ | — | — |
| Tài khoản, Cài đặt | ✓ | — | — | — |

## 4. Màn hình

Mỗi màn hình có đủ 4 trạng thái: **loading** (skeleton), **rỗng** (EmptyState: icon + câu + hành động), **lỗi** (thông báo + "Thử lại"), **có dữ liệu**. Route ghi trong ngoặc.

### 4.1 Chung
- **Đăng nhập** (`/login`): ô "Email hoặc mã học viên", mật khẩu (hiện/ẩn), "Đăng nhập". Lỗi chung "Sai thông tin đăng nhập"; bị khóa: "Tài khoản tạm khóa đến HH:mm".
- **Đổi mật khẩu** (`/change-password`): bắt buộc khi `mustChangePassword`, không có menu.
- **Thông báo** (`/notifications`): danh sách, lọc chưa đọc, click → điều hướng tới đối tượng.

### 4.2 Tổng quan
- **M/S** (`/`): 5 thẻ số (HV đang học, lớp đang mở, buổi học hôm nay, HV chờ xếp lớp, công nợ quá hạn) → click mở danh sách tương ứng; bảng "Buổi học hôm nay" (giờ, lớp, phòng, GV, đã điểm danh?); biểu đồ đường tuyển sinh 6 tháng.
- **T** (`/`): "Buổi dạy hôm nay" dạng thẻ lớn với nút **Điểm danh**; "Bài cần nhập điểm"; "Kiểm tra đầu vào sắp tới".
- **H** (`/`): buổi học tiếp theo, tỷ lệ chuyên cần, điểm TB hiện tại, số tiền còn nợ + hạn; banner "Bạn được xếp vào lớp X — Xác nhận" nếu chưa xác nhận.

### 4.3 Tuyển sinh
- **Danh sách lead** (`/admissions/leads`): bảng (họ tên, SĐT, khóa quan tâm, ngày tiếp nhận, trạng thái, người tiếp nhận); lọc trạng thái/khóa/ngày; nút **Tiếp nhận mới**.
- **Form tiếp nhận** (`/admissions/leads/new`, sheet bên phải trên desktop): các trường FR-ADM-01; trường bắt buộc có dấu *. Khi 409 DUPLICATE_PERSON → dialog "Có thể đã tồn tại" liệt kê bản ghi trùng (tên, SĐT, mã HV, link xem) với nút "Xem hồ sơ" / "Vẫn lưu lead mới".
- **Chi tiết lead** (`/admissions/leads/:id`): thông tin + nút **Tạo hồ sơ học viên** → dialog xác nhận/bổ sung thông tin → thành công hiển thị mã HV + mật khẩu tạm (nút sao chép, cảnh báo "chỉ hiển thị một lần").
- **Kiểm tra đầu vào** (`/admissions/placement`): danh sách đợt (thời gian, khóa, phòng, GV, số thí sinh, trạng thái); tạo đợt (form + kiểm tra xung đột trực tiếp); chi tiết đợt: thêm thí sinh từ danh sách `PENDING_PLACEMENT`.
- **Chấm kiểm tra** (GV, `/admissions/placement/:id/grade`): bảng thí sinh với ô điểm, chọn level, nhận xét; lưu.

### 4.4 Học viên
- **Danh sách** (`/students`): ô tìm (mã/tên/SĐT/email, debounce 300ms), lọc trạng thái/khóa/lớp; bảng (mã, họ tên, ngày sinh, SĐT, lớp hiện tại, trạng thái); phân trang 20.
- **Hồ sơ** (`/students/:id`): header (tên, mã, badge trạng thái, nút **Sửa**); tabs: *Thông tin* · *Khóa học & lớp* (enrollments + hành động: xếp lớp, chuyển lớp, bảo lưu) · *Chuyên cần* · *Kết quả* · *Học phí* · *Giấy tờ* · *Lịch sử thay đổi* (audit). GV chỉ thấy tab Thông tin (rút gọn), Chuyên cần, Kết quả của lớp mình.
- **Sửa hồ sơ**: form; "Hủy" khi đã sửa → hỏi "Bỏ thay đổi?".
- **Hồ sơ của tôi** (HV, `/me/profile`): xem; sửa SĐT/email/địa chỉ; đổi mật khẩu.

### 4.5 Lớp học & Xếp lớp
- **Danh sách lớp** (`/classes`): bảng (mã, tên, khóa, trình độ, GV, sĩ số `18/20` với thanh tiến độ — đỏ khi đầy, thời gian, trạng thái); lọc khóa/trình độ/trạng thái/"còn chỗ"; nút **Thêm lớp**.
- **Form lớp** (dialog): FR-CLS-01. Khi sửa max < hiện tại → lỗi ngay trên trường.
- **Chi tiết lớp** (`/classes/:id`): header (sĩ số, GV, phòng, thời gian, trạng thái + menu: Sửa, Ngừng hoạt động, Xóa); tabs *Học viên* (bảng + cờ ⚠ vắng nhiều + nút "Xếp thêm") · *Lịch học* · *Điểm danh* (ma trận học viên × buổi, ô màu theo trạng thái) · *Bài đánh giá & điểm* · *Học phí lớp*.
- **Xóa lớp**: ConfirmDialog; nếu 422 CLASS_HAS_DEPENDENCIES → hiển thị lý do + gợi ý "Chuyển sang Ngừng hoạt động".
- **Danh sách chờ xếp lớp** (`/enrollments/waiting`): bảng (HV, khóa, trình độ, chờ bao nhiêu ngày — > 14 ngày tô cam); chọn HV → **panel xếp lớp** bên phải: thông tin HV + kết quả kiểm tra; danh sách lớp phù hợp (cùng khóa, cùng trình độ, còn chỗ) với sĩ số và lịch; lớp lệch trình độ ở nhóm "Khác" (chọn → yêu cầu lý do). **Xếp vào lớp** → toast thành công; 422 CLASS_FULL → báo "Lớp vừa đầy", làm mới danh sách.
- **Chuyển lớp**: dialog chọn lớp đích (cùng logic), lý do bắt buộc.

### 4.6 Lịch học
- **Lịch** (`/schedule`): FullCalendar, mặc định *Tuần* (desktop) / *Danh sách ngày* (mobile); chuyển Ngày/Tuần/Tháng; lọc lớp/GV/phòng (M, S). Sự kiện: `IELTS-01 · P201 · Cô Lan`, màu theo khóa; buổi hủy gạch ngang xám.
- **Tạo lịch** (M,S — dialog 2 tab): *Một buổi* | *Lặp lại* (chọn thứ trong tuần dạng chip T2–CN, giờ bắt đầu/kết thúc, từ–đến ngày). Nút **Kiểm tra xung đột** gọi dry-run; xung đột hiển thị danh sách đỏ (ngày, giờ, đối tượng trùng: phòng/GV, lớp đang chiếm). Nút Tạo bị vô hiệu khi còn xung đột. Xem trước: "Sẽ tạo 24 buổi".
- **Chi tiết buổi** (popover/sheet): thông tin; M,S: Sửa, Hủy buổi (dialog lý do bắt buộc); T/S: **Điểm danh**.

### 4.7 Điểm danh
- **Màn điểm danh** (`/sessions/:id/attendance`, ưu tiên mobile):
```
┌─────────────────────────────────┐
│ IELTS-01 · Thứ 3 14/01 18:00    │
│ Đã chọn 17/20   [Tất cả có mặt] │
├─────────────────────────────────┤
│ Nguyễn Văn A          HV2026..  │
│ [Có mặt][Muộn][Vắng CP][Vắng KP]│  ← segmented, chạm 44px
│ ⚠ vắng 3/10 buổi                │
├─────────────────────────────────┤
│ ...                             │
├─────────────────────────────────┤
│ Ghi chú buổi học [............] │
│ [        Lưu điểm danh        ] │  ← sticky bottom
└─────────────────────────────────┘
```
  Lưu khi còn HV chưa chọn → cảnh báo "Còn 3 học viên chưa điểm danh" và cuộn tới người đầu tiên. Đã điểm danh → chế độ cập nhật (hiển thị "Đã điểm danh lúc ... bởi ..."; thay đổi có ô lý do; xem lịch sử thay đổi mỗi HV). Quá cửa sổ sửa (GV) → chỉ đọc + thông báo.
- **Lịch sử điểm danh** (`/attendance`): lọc thời gian/lớp/HV; bảng tổng hợp (HV, có mặt, muộn, vắng CP, vắng KP, tỷ lệ chuyên cần); click → chi tiết từng buổi. HV: `/me/attendance` thẻ tỷ lệ + danh sách buổi.

### 4.8 Kết quả học tập
- **Bài đánh giá của lớp** (tab trong chi tiết lớp): danh sách bài (tên, loại, trọng số, ngày, trạng thái: Nháp/Đã xác nhận/Đã khóa 🔒); tổng trọng số hiển thị `85/100%`.
- **Nhập điểm** (`/assessments/:id/grades`): bảng HV × (điểm, nhận xét); Tab/Enter di chuyển ô; điểm sai thang viền đỏ + tooltip. Nút **Lưu nháp** và **Xác nhận kết quả** (thiếu điểm → dialog "Còn N học viên chưa có điểm. Lưu nháp?"). Sau xác nhận, sửa một ô mở dialog yêu cầu lý do. Khóa → banner "Bảng điểm đã đóng, không thể chỉnh sửa".
- **Kết quả** (`/results`): M,S lọc khóa/lớp/HV; bảng HV × bài + TB + xếp loại. HV `/me/results`: thẻ theo lớp (TB, xếp loại badge, các bài + nhận xét), nút **Tải phiếu điểm PDF**; bị chặn học phí → khối cảnh báo + liên hệ.

### 4.9 Học phí
- **Danh sách hóa đơn** (`/fees`): lọc HV/lớp/trạng thái/quá hạn/khoảng thời gian; bảng (mã HĐ, HV, khóa/lớp, phải đóng, đã đóng, còn nợ, hạn, trạng thái); tổng ở chân bảng.
- **Chi tiết hóa đơn** (`/fees/invoices/:id`): khối tiền (Học phí · Giảm giá · Phải đóng · Đã đóng · **Còn nợ** lớn); giảm giá (trạng thái chờ duyệt / duyệt-từ chối cho M); lịch sử thanh toán (mã PT, ngày, số tiền, hình thức, người thu, in phiếu, hủy — M). Nút **Ghi nhận thanh toán** → dialog (số tiền mặc định = còn nợ, định dạng tự động dấu chấm, hình thức, ngày, ghi chú).
- **Duyệt giảm giá** (M, `/fees/discounts`): danh sách chờ duyệt.
- **Học phí của tôi** (HV, `/me/fees`): mỗi hóa đơn một thẻ (còn nợ, hạn, trạng thái) + lịch sử thanh toán.
- **Tra cứu** (GV): tìm HV lớp mình → trạng thái + còn nợ (không chi tiết giao dịch).

### 4.10 Báo cáo (`/reports`)
- Tabs: *Tuyển sinh* · *Chuyên cần* · *Học tập* · *Tài chính*. Thanh lọc chung: khoảng thời gian (preset: tháng này, quý này, năm nay, tùy chọn), khóa, lớp. Nút **Xuất Excel** / **Xuất PDF**.
- Tuyển sinh: thẻ số + biểu đồ cột theo tháng (lead vs hồ sơ) + bảng theo khóa.
- Chuyên cần: biểu đồ cột tỷ lệ theo lớp + bảng HV vượt ngưỡng.
- Học tập: biểu đồ tròn phân bố xếp loại + bảng TB theo lớp/GV, tỷ lệ đạt.
- Tài chính: biểu đồ đường doanh thu theo tháng + thẻ (thực thu, phải thu, công nợ, quá hạn, giảm giá) + bảng.

### 4.11 Danh mục & quản trị
- **Khóa học** (`/settings/courses`), **Phòng học** (`/settings/rooms`): bảng + dialog form.
- **Tài khoản** (`/settings/users`): bảng (tên, email, vai trò, trạng thái); tạo (hiện mật khẩu tạm), khóa/mở, đặt lại mật khẩu.
- **Cài đặt** (`/settings/center`): form các tham số FR-SET-01 với mô tả ngắn từng mục.

## 5. Component dùng chung (Lead làm ở Wave 0)
`AppShell`, `PageHeader`, `DataTable` (TanStack Table: sort, phân trang server, chọn hàng, cột ẩn trên mobile), `FilterBar`, `SearchInput` (debounce), `StatusBadge`, `MoneyInput`, `MoneyText`, `DatePicker`, `DateRangePicker`, `TimeInput`, `EntitySelect` (async combobox: học viên/lớp/GV/phòng/khóa), `ConfirmDialog`, `ReasonDialog`, `EmptyState`, `ErrorState`, `FormField` (label + lỗi), `CapacityBar`, `ConflictList`, `toast` (sonner).

## 6. Văn phong thông báo
- Thành công: ngắn, động từ quá khứ: "Đã xếp Nguyễn Văn A vào lớp IELTS-01".
- Lỗi: nói cái gì sai + làm gì: "Lớp IELTS-01 đã đủ 20/20 học viên. Chọn lớp khác."
- Không dùng thuật ngữ kỹ thuật (không hiện "409", "ObjectId").
- Map `ErrorCode → câu tiếng Việt` tập trung tại `apps/web/src/lib/error-messages.ts`.
