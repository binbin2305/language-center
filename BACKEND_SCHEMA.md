# BACKEND_SCHEMA — Dữ liệu & API

Quy ước chung:
- MongoDB, Mongoose. Mọi collection có `_id: ObjectId`, `createdAt`, `updatedAt` (`timestamps: true`).
- Tham chiếu = `ObjectId` + `ref`. Không nhúng dữ liệu của thực thể độc lập (trừ snapshot ghi rõ).
- Tiền: `Number` **số nguyên VND** (validate `Number.isInteger`, ≥ 0). Không bao giờ dùng số thực cho tiền.
- Điểm: `Number`, 0–10, bội số của 0.25.
- Thời điểm: `Date` (UTC). Ngày thuần (ngày sinh, hạn đóng): `Date` lúc 00:00 giờ VN, quy đổi bằng `vnDay()`.
- Xóa mềm (`deletedAt: Date | null`) cho: `students`, `leads`, `users`. Truy vấn mặc định lọc `deletedAt: null`.
- Tên field trong DB và JSON: camelCase tiếng Anh. Nhãn tiếng Việt chỉ ở FE.
- Mọi enum dưới đây được định nghĩa trong `packages/shared/src/enums.ts` (nguồn sự thật duy nhất).

## 1. Enum

```ts
Role            = ADMIN | MANAGER | ACADEMIC_STAFF | TEACHER | STUDENT
UserStatus      = ACTIVE | LOCKED | DISABLED
Gender          = MALE | FEMALE | OTHER
LeadStatus      = NEW | PROFILE_CREATED | CANCELLED
StudentStatus   = ACTIVE | RESERVED | DROPPED | COMPLETED
CourseStatus    = ACTIVE | ARCHIVED
Level           = string do khóa học định nghĩa (Course.levels[]), ví dụ "A1","A2","B1","IELTS 5.0"
ClassStatus     = PLANNED | ONGOING | FINISHED | INACTIVE
EnrollmentStatus= PENDING_PLACEMENT | WAITING_CLASS | ENROLLED | TRANSFERRED | RESERVED | COMPLETED | CANCELLED
PlacementStatus = SCHEDULED | COMPLETED | CANCELLED
SessionStatus   = SCHEDULED | CANCELLED            # COMPLETED là trạng thái suy ra (FR-SCH-08)
AttendanceStatus= PRESENT | LATE | EXCUSED | UNEXCUSED
AssessmentType  = QUIZ | MIDTERM | FINAL | SKILL
InvoiceStatus   = UNPAID | PARTIAL | PAID | VOID
DiscountStatus  = PENDING_APPROVAL | APPROVED | REJECTED
PaymentMethod   = CASH | BANK_TRANSFER | CARD
PaymentStatus   = VALID | VOIDED
NotificationType= SESSION_CREATED | SESSION_UPDATED | SESSION_CANCELLED | CLASS_ASSIGNED | ATTENDANCE_WARNING | GRADES_PUBLISHED | INVOICE_CREATED | PAYMENT_RECORDED | DISCOUNT_DECIDED
GradeClass      = EXCELLENT | GOOD | FAIR | AVERAGE | FAIL   # Xuất sắc/Giỏi/Khá/Trung bình/Không đạt
```

## 2. Collections

### 2.1 `users`
| Field | Type | Ràng buộc |
|---|---|---|
| email | string \| null | unique sparse (lowercase); bắt buộc với mọi role trừ STUDENT. Tài khoản STUDENT **không lưu email** ở users (email nằm ở `students`) để tránh đụng unique khi anh chị em dùng chung email |
| username | string | unique; STUDENT = mã HV; khác = email |
| passwordHash | string | `select: false` |
| fullName | string | required |
| phone | string | |
| role | Role | required |
| status | UserStatus | default ACTIVE |
| mustChangePassword | boolean | default false |
| failedLoginCount | number | default 0 |
| failedLoginWindowStart | Date \| null | |
| lockedUntil | Date \| null | |
| teacherProfile | `{ languages: string[], levels: string[], specialization?: string }` | chỉ TEACHER |
| studentId | ObjectId → students | chỉ STUDENT, unique sparse |
| deletedAt | Date \| null | |

Index: `{username:1}` unique · `{email:1}` unique sparse · `{role:1, status:1}`.

### 2.2 `refresh_tokens`
`{ userId, tokenHash (sha256), expiresAt, revokedAt, replacedBy }` · TTL index trên `expiresAt`.

### 2.3 `courses`
| Field | Type | Ràng buộc |
|---|---|---|
| code | string | unique (uppercase), ví dụ `ENG-IELTS` |
| name | string | required |
| language | string | required, ví dụ "Tiếng Anh" |
| levels | string[] | ≥ 1 phần tử, có thứ tự |
| description | string | |
| totalSessions | number | int > 0 |
| baseFee | number | int VND ≥ 0 |
| status | CourseStatus | default ACTIVE |

### 2.4 `rooms`
`{ code (unique), name, capacity (int>0), status: ACTIVE|INACTIVE }`

### 2.5 `leads` (Tiếp nhận thông tin — UC01)
| Field | Type | Ràng buộc |
|---|---|---|
| fullName | string | required, 2–100 |
| dob | Date | required, tuổi 4–100 |
| gender | Gender | required |
| phone | string | required, regex VN `^(0|\+84)\d{9,10}$`, lưu dạng chuẩn hóa `0xxxxxxxxx` |
| email | string \| null | email hợp lệ, lowercase |
| address | string | |
| interestedCourseId | ObjectId → courses | required |
| note | string | |
| status | LeadStatus | default NEW |
| studentId | ObjectId → students \| null | set khi tạo hồ sơ |
| createdBy | ObjectId → users | |
| deletedAt | Date \| null | |

Index: `{phone:1}` · `{email:1}` · `{status:1, createdAt:-1}`.

### 2.6 `students` (HocVien + HoSoHocVien)
| Field | Type | Ràng buộc |
|---|---|---|
| code | string | unique, `HV{YYYY}{00001}` |
| fullName, dob, gender, phone, email, address | như leads | **không unique** (anh chị em dùng chung SĐT phụ huynh) — trùng chỉ cảnh báo qua DUPLICATE_PERSON |
| fullNameSearch | string | bỏ dấu + lowercase, tự sinh (pre-save) |
| status | StudentStatus | default ACTIVE |
| leadId | ObjectId → leads | unique sparse |
| userId | ObjectId → users | |
| documents | `[{ _id, fileName, mimeType, size, path, uploadedAt, uploadedBy }]` | ≤ 5MB/file, png/jpg/pdf |
| note | string | |
| createdBy | ObjectId | |
| deletedAt | Date \| null | |

Index: `{code:1}` unique · `{phone:1}` · `{fullNameSearch:1}` · `{email:1}`.

### 2.7 `counters`
`{ _id: 'student:2026', seq: number }` — `findOneAndUpdate({_id},{$inc:{seq:1}},{upsert:true,new:true})`.

### 2.8 `enrollments` (Đăng ký khóa học + xếp lớp)
| Field | Type | Ràng buộc |
|---|---|---|
| studentId | ObjectId → students | required |
| courseId | ObjectId → courses | required |
| classId | ObjectId → classes \| null | set khi ENROLLED |
| status | EnrollmentStatus | default PENDING_PLACEMENT |
| placementLevel | string \| null | |
| placementSkipped | `{ reason, by, at } \| null` | |
| levelOverride | `{ reason, by, at } \| null` | khi xếp lệch trình độ |
| waitingSince | Date \| null | set khi → WAITING_CLASS |
| enrolledAt | Date \| null | |
| confirmedAt | Date \| null | HV xác nhận lớp |
| transferredToId | ObjectId → enrollments \| null | |
| transferredFromId | ObjectId → enrollments \| null | |
| invoiceId | ObjectId → invoices \| null | |
| history | `[{ from, to, at, by, reason? }]` | append-only |

Index: `{studentId:1, courseId:1, status:1}` · `{classId:1, status:1}` · `{status:1, waitingSince:1}`.

Chuyển trạng thái hợp lệ (ngoài danh sách → `422 INVALID_STATUS_TRANSITION`):
```
PENDING_PLACEMENT → WAITING_CLASS (có kết quả / skip) | CANCELLED
WAITING_CLASS     → ENROLLED (assign) | CANCELLED
ENROLLED          → TRANSFERRED (transfer) | RESERVED | CANCELLED (withdraw) | COMPLETED (sự kiện class.finished)
RESERVED          → WAITING_CLASS (resume) | CANCELLED
```
[Quyết định] `StudentStatus` do nhân viên đặt thủ công, không tự đồng bộ theo enrollment.
Ràng buộc nghiệp vụ: một học viên không có hai enrollment **đang hoạt động** (`PENDING_PLACEMENT|WAITING_CLASS|ENROLLED`) cho cùng một khóa → `409 ENROLLMENT_EXISTS`.

### 2.9 `placement_tests`
| Field | Type |
|---|---|
| courseId | ObjectId → courses |
| startAt, endAt | Date |
| roomId | ObjectId → rooms |
| teacherId | ObjectId → users (TEACHER) |
| status | PlacementStatus |
| candidates | `[{ enrollmentId, studentId, score: number\|null (0–10, bước 0.25), level: string\|null, comment, gradedAt, gradedBy }]` |

Index: `{teacherId:1, startAt:1}` · `{roomId:1, startAt:1}`.

### 2.10 `classes`
| Field | Type | Ràng buộc |
|---|---|---|
| code | string | unique, lưu uppercase |
| name | string | required |
| courseId | ObjectId → courses | required |
| level | string | ∈ course.levels |
| teacherId | ObjectId → users | required, role TEACHER |
| assistantTeacherId | ObjectId → users \| null | |
| defaultRoomId | ObjectId → rooms \| null | |
| maxCapacity | number | int 1–100 |
| currentSize | number | int ≥ 0, ≤ maxCapacity; **chỉ thay đổi qua $inc trong enrollments service** |
| startDate, endDate | Date | endDate ≥ startDate |
| status | ClassStatus | default PLANNED |

Chuyển trạng thái lớp: **thủ công** bởi M/S (không tự động theo ngày) [Quyết định]: `PLANNED → ONGOING | INACTIVE`, `ONGOING → FINISHED | INACTIVE`, `INACTIVE → PLANNED`. Khác → `422 INVALID_STATUS_TRANSITION`. Khi → FINISHED phát `class.finished`.

Index: `{code:1}` unique · `{courseId:1, level:1, status:1}` · `{teacherId:1}`.

### 2.11 `sessions` (LichHoc — mỗi document là một buổi)
| Field | Type | Ràng buộc |
|---|---|---|
| classId | ObjectId → classes | required |
| startAt, endAt | Date | endAt > startAt, cùng ngày VN |
| roomId | ObjectId → rooms | required |
| teacherId | ObjectId → users | required |
| status | SessionStatus | default SCHEDULED |
| cancelReason | string \| null | bắt buộc khi CANCELLED |
| seriesId | ObjectId \| null | các buổi sinh cùng một lần tạo lặp |
| attendanceTakenAt | Date \| null | |
| attendanceNote | string | ghi chú buổi học |
| createdBy | ObjectId | |

Index: `{roomId:1, startAt:1, endAt:1}` · `{teacherId:1, startAt:1, endAt:1}` · `{classId:1, startAt:1}`.
Truy vấn xung đột:
```js
{ status: 'SCHEDULED', _id: { $ne: excludeId },
  $or: [{ roomId }, { teacherId }],
  startAt: { $lt: newEnd }, endAt: { $gt: newStart } }
```
Kèm kiểm tra `placement_tests` (status SCHEDULED) với cùng điều kiện phòng/GV.

### 2.12 `attendances`
| Field | Type | Ràng buộc |
|---|---|---|
| sessionId | ObjectId → sessions | |
| classId | ObjectId → classes | denormalize để lọc nhanh |
| studentId | ObjectId → students | |
| enrollmentId | ObjectId → enrollments | |
| status | AttendanceStatus | required |
| note | string | |
| recordedBy | ObjectId → users | |
| history | `[{ from, to, reason?, by, at }]` | append khi cập nhật |

Index: `{sessionId:1, studentId:1}` unique · `{studentId:1, createdAt:-1}` · `{classId:1, status:1}`.
Ghi một buổi = `bulkWrite` upsert theo `(sessionId, studentId)` trong transaction + set `sessions.attendanceTakenAt`.

### 2.13 `attendance_warnings`
`{ studentId, classId, triggeredAt, absenceRate }` · unique `{studentId, classId}`; xóa khi tỷ lệ về dưới ngưỡng (để có thể báo lại lần sau).

### 2.14 `assessments`
| Field | Type | Ràng buộc |
|---|---|---|
| classId | ObjectId → classes | |
| name | string | |
| type | AssessmentType | |
| weight | number | 0–100; tổng của lớp ≤ 100 |
| heldOn | Date | ngày VN |
| confirmedAt | Date \| null | khi GV xác nhận đủ điểm |
| unlockedUntil | Date \| null | QL mở khóa |
| createdBy | ObjectId | |

Thuộc tính suy ra: `lockedAt = heldOn + settings.gradeLockDays`; `isLocked = now > lockedAt && !(unlockedUntil > now)`.

### 2.15 `grades`
| Field | Type | Ràng buộc |
|---|---|---|
| assessmentId | ObjectId → assessments | |
| classId, studentId, enrollmentId | ObjectId | |
| score | number \| null | 0–10, bội 0.25; null = chưa nhập |
| comment | string | ≤ 1000 |
| isDraft | boolean | true đến khi assessment confirmed |
| history | `[{ fromScore, toScore, fromComment, toComment, reason, by, at }]` | |

Index: `{assessmentId:1, studentId:1}` unique · `{studentId:1}` · `{classId:1}`.

### 2.16 `invoices`
| Field | Type | Ràng buộc |
|---|---|---|
| code | string | unique `HD{YYYYMM}{0001}` |
| kind | `TUITION \| SURCHARGE` | TUITION do InvoiceCreator sinh; SURCHARGE tạo thủ công (`POST /invoices`) |
| studentId | ObjectId | required |
| enrollmentId, courseId | ObjectId \| null | bắt buộc với TUITION, tùy chọn với SURCHARGE |
| description | string | bắt buộc với SURCHARGE (ví dụ "Phí giáo trình") |
| classId | ObjectId \| null | |
| amountDue | int | = baseFee lúc tạo (snapshot) |
| discount | `{ kind: 'PERCENT'\|'AMOUNT', value, amount (int, đã quy đổi), reason, status: DiscountStatus, requestedBy, decidedBy, decidedAt } \| null` | |
| finalAmount | int | = amountDue − (discount.status==APPROVED ? discount.amount : 0), ≥ 0 |
| amountPaid | int | tổng payments VALID |
| balance | int | = finalAmount − amountPaid, ≥ 0 |
| dueDate | Date | ngày VN |
| status | InvoiceStatus | suy ra từ amountPaid/finalAmount; VOID thủ công |

Index: `{studentId:1, status:1}` · `{dueDate:1, status:1}` · `{classId:1}` · `{enrollmentId:1}` unique partial `{kind:'TUITION'}` (đảm bảo một hóa đơn học phí / enrollment).

Vòng đời hóa đơn học phí theo enrollment [Quyết định]:
- Rút lớp (`CANCELLED`): `amountPaid = 0` → hóa đơn tự `VOID` (lý do "Rút khỏi khóa"); đã đóng một phần → giữ nguyên, công nợ còn lại do QL xử lý (giảm giá hoặc void thủ công). Hoàn tiền nằm ngoài phạm vi.
- Bảo lưu (`RESERVED`): hóa đơn giữ nguyên.
- Học lại sau bảo lưu: `POST /enrollments/:id/resume` đưa **chính enrollment đó** về `WAITING_CLASS`; xếp lớp lại không sinh hóa đơn mới (idempotent theo enrollment).
Bất biến (test bắt buộc): `amountPaid ≤ finalAmount`, `balance = finalAmount − amountPaid`, `status = PAID ⇔ balance = 0 && finalAmount > 0 || finalAmount = 0`.

### 2.17 `payments`
`{ code (unique PT{YYYYMM}{0001}), invoiceId, studentId, amount (int>0), method, paidAt, note, status: PaymentStatus, voidReason, voidedBy, voidedAt, recordedBy }` · Index `{invoiceId:1}` · `{paidAt:1, status:1}`.

### 2.18 `notifications`
`{ userId, type: NotificationType, title, body, refType, refId, readAt }` · Index `{userId:1, readAt:1, createdAt:-1}`.

### 2.19 `audit_logs`
`{ actorId, actorRole, action ('create'|'update'|'delete'|'status'), entity, entityId, before, after, at }` · Index `{entity:1, entityId:1, at:-1}`. Chỉ ghi, không sửa/xóa.

### 2.20 `settings` (một document `_id: 'center'`)
`{ centerName, attendanceWarningThreshold: 0.2, gradeLockDays: 14, resultViewRequiresPaidFees: false, teacherAttendanceEditDays: 7, invoiceDueDaysAfterStart: 7 }`

### 2.21 Quan hệ (từ Class Diagram + ERD SRS, đã chuẩn hóa)
```
User(STUDENT) 1─1 Student 1─* Enrollment *─1 Course
Lead 0..1─1 Student
Enrollment *─0..1 Class *─1 Course
Class 1─* Session ; Session 1─* Attendance *─1 Student
Class 1─* Assessment 1─* Grade *─1 Student
Enrollment 1─0..1 Invoice 1─* Payment
PlacementTest 1─* candidates(Enrollment)
```
[Quyết định] SRS ghi `HocVien 1─1 HocPhi`; chuẩn hóa thành 1 hóa đơn / 1 enrollment để hỗ trợ học viên học nhiều khóa.

## 3. API

Base: `/api/v1`. JSON. Auth: `Authorization: Bearer <access>`. Refresh token ở cookie `lc_rt` (httpOnly, sameSite=lax, path=/api/v1/auth).

### 3.1 Định dạng chung
- Thành công: `{ "data": ... }`; danh sách: `{ "data": [...], "meta": { "page", "limit", "total" } }`.
- Phân trang: `?page=1&limit=20` (limit tối đa 100). Sắp xếp: `?sort=-createdAt`.
- Lỗi: `{ "error": { "code": "CLASS_FULL", "message": "Lớp đã đủ sĩ số", "details": { ... } } }`. `details.fields: { [field]: message }` cho lỗi validation.
- HTTP: 200, 201, 204, 400 (validation), 401, 403 (sai role), 404 (không có hoặc ngoài phạm vi), 409 (trùng/xung đột), 422 (vi phạm quy tắc nghiệp vụ), 423 (ACCOUNT_LOCKED), 429, 500.

### 3.2 Mã lỗi (`packages/shared/src/errors.ts`)
```
VALIDATION_FAILED, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, RATE_LIMITED,
INVALID_CREDENTIALS, ACCOUNT_LOCKED, PASSWORD_CHANGE_REQUIRED,
DUPLICATE_PERSON, LEAD_NOT_FOUND, PROFILE_EXISTS, ENROLLMENT_EXISTS,
CLASS_CODE_EXISTS, CAPACITY_BELOW_CURRENT, CLASS_HAS_DEPENDENCIES, CLASS_FULL, CLASS_NOT_OPEN,
COURSE_MISMATCH, LEVEL_MISMATCH, ENROLLMENT_INVALID_STATE,
SCHEDULE_CONFLICT, SESSION_OUTSIDE_CLASS_RANGE, SESSION_LOCKED, SESSION_NOT_CANCELLABLE,
ATTENDANCE_TOO_EARLY, ATTENDANCE_INCOMPLETE, ATTENDANCE_EDIT_WINDOW_CLOSED, SESSION_CANCELLED,
ATTENDANCE_ALREADY_TAKEN (409), STUDENT_NOT_IN_ROSTER (400), INVALID_STATUS_TRANSITION (422),
WEIGHT_EXCEEDS_100, SCORE_OUT_OF_RANGE (400), GRADES_INCOMPLETE, GRADEBOOK_LOCKED, REASON_REQUIRED (400),
ASSESSMENT_HAS_GRADES (422),
FEES_OUTSTANDING, PAYMENT_EXCEEDS_BALANCE, INVOICE_VOID, DISCOUNT_INVALID, DISCOUNT_NOT_PENDING,
FILE_TOO_LARGE, FILE_TYPE_NOT_ALLOWED
```

### 3.3 Endpoint

Cột "Quyền": M=MANAGER, S=ACADEMIC_STAFF, T=TEACHER, H=STUDENT, A=ADMIN. (scope) = lọc theo phạm vi dữ liệu.

**Auth**
| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| POST | /auth/login | public | `{username,password}` → `{accessToken, user}` + cookie |
| POST | /auth/refresh | cookie | xoay vòng refresh |
| POST | /auth/logout | auth | |
| GET | /auth/me | auth | user + `studentId`/`teacherProfile` |
| POST | /auth/change-password | auth | `{currentPassword,newPassword}` |

**Users / Courses / Rooms / Settings**
| Method | Path | Quyền |
|---|---|---|
| GET/POST | /users | A,M (lọc `role`, `q`) |
| GET/PATCH | /users/:id | A,M |
| POST | /users/:id/lock · /unlock · /reset-password | A,M |
| GET | /teachers | M,S (danh sách GV rút gọn để chọn) |
| GET/POST | /courses | GET: all auth · POST: M,S |
| GET/PATCH | /courses/:id | GET: all · PATCH: M,S |
| GET/POST | /rooms · GET/PATCH /rooms/:id | M,S |
| GET/PATCH | /settings | GET: auth · PATCH: M |

**Admissions**
| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| POST | /leads | M,S | 409 DUPLICATE_PERSON (`?force=true` để vẫn lưu lead) |
| GET | /leads | M,S | lọc status, courseId, from, to, q |
| GET/PATCH | /leads/:id | M,S | |
| POST | /leads/:id/cancel | M,S | |
| POST | /leads/:id/convert | M,S | tạo student + user + enrollment → `{student, tempPassword}`; trùng người → 409 DUPLICATE_PERSON trừ khi `?force=true` |
| GET | /students | M,S,T(scope) | `q` (mã/tên/SĐT/email), status, classId, courseId |
| GET | /students/:id | M,S,T(scope, trường rút gọn),H(chỉ mình) | kèm enrollments + tóm tắt |
| PATCH | /students/:id | M,S | audit |
| PATCH | /students/me/contact | H | phone, email, address |
| POST | /students/:id/documents | M,S | multipart |
| GET/DELETE | /students/:id/documents/:docId | M,S | |
| GET | /students/:id/audit | M,S | |

**Enrollments & Placement**
| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| POST | /enrollments | M,S,H(cho mình) | `{studentId?, courseId}` |
| GET | /enrollments | M,S | lọc status, courseId, classId, studentId |
| GET | /enrollments/waiting | M,S | WAITING_CLASS, kèm số ngày chờ |
| GET | /enrollments/me | H | |
| PATCH | /enrollments/:id/course | M,S,H(mình, khi PENDING_PLACEMENT) | đổi khóa |
| POST | /enrollments/:id/skip-placement | M,S | `{level, reason}` |
| POST | /enrollments/:id/assign | M,S | `{classId, overrideReason?}` → CLASS_FULL/LEVEL_MISMATCH/COURSE_MISMATCH/CLASS_NOT_OPEN |
| POST | /enrollments/:id/transfer | M,S | `{toClassId, reason}` |
| POST | /enrollments/:id/withdraw | M,S | `{status: 'CANCELLED'|'RESERVED', reason}` |
| POST | /enrollments/:id/confirm | H(mình) | |
| POST | /enrollments/:id/resume | M,S | RESERVED → WAITING_CLASS |
| GET/POST | /placement-tests | M,S (GET: T scope) | |
| GET/PATCH | /placement-tests/:id | M,S,T(scope) | |
| POST | /placement-tests/:id/candidates | M,S | `{enrollmentIds[]}` |
| PUT | /placement-tests/:id/results | T(được phân công) | `[{enrollmentId, score, level, comment}]` |

**Classes**
| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | /classes | M,S,T(scope),H(scope) | lọc courseId, level, status, hasSeat, teacherId, q |
| POST | /classes | M,S | |
| GET | /classes/:id | M,S,T(scope),H(scope) | |
| PATCH | /classes/:id | M,S | CAPACITY_BELOW_CURRENT |
| DELETE | /classes/:id | M,S | CLASS_HAS_DEPENDENCIES |
| POST | /classes/:id/deactivate | M,S | |
| GET | /classes/:id/students | M,S,T(scope) | kèm cờ cảnh báo vắng |

**Schedule**
| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | /sessions | all (scope) | `from`,`to` bắt buộc (tối đa 92 ngày), classId, teacherId, roomId |
| POST | /sessions | M,S | một buổi |
| POST | /sessions/bulk | M,S | `{classId, roomId, teacherId, weekdays[1-7], startTime "HH:mm", endTime, fromDate, toDate}` → tất cả hoặc không |
| POST | /sessions/check-conflicts | M,S | dry-run, trả danh sách xung đột |
| GET | /sessions/:id | all (scope) | |
| PATCH | /sessions/:id | M,S | |
| POST | /sessions/:id/cancel | M,S | `{reason}` |
| POST | /classes/:id/sessions/cancel-future | M,S | `{reason}` |

**Attendance**
| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | /sessions/:id/attendance | T(scope),S,M | roster + trạng thái hiện tại |
| PUT | /sessions/:id/attendance | T(scope),S | `{records:[{studentId,status,note?}], sessionNote?}` lần đầu, phải đủ |
| PATCH | /sessions/:id/attendance | T(scope, trong cửa sổ),S | `{records:[{studentId,status,reason?}]}` |
| GET | /attendance | all (scope) | lọc from, to, classId, studentId |
| GET | /attendance/summary | all (scope) | `groupBy=student|class` → đếm theo trạng thái + tỷ lệ |

**Grades**
| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET/POST | /classes/:id/assessments | GET: M,S,T(scope),H(scope) · POST: T(scope),S | WEIGHT_EXCEEDS_100 |
| PATCH/DELETE | /assessments/:id | T(scope),S | xóa chỉ khi chưa có điểm |
| GET | /assessments/:id/grades | M,S,T(scope) | |
| PUT | /assessments/:id/grades | T(scope) | `{grades:[{studentId,score|null,comment}], confirm:boolean}` |
| PATCH | /assessments/:id/grades/:studentId | T(scope) | `{score,comment,reason}` sau khi confirm |
| POST | /assessments/:id/unlock | M | `{until}` |
| GET | /results | M,S,T(scope),H(mình) | lọc courseId, classId, studentId → điểm từng bài, TB, xếp loại |
| GET | /results/transcript.pdf | M,S,H(mình) | `?studentId&classId` |

**Fees**
| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | /invoices | M,S,T(scope, trường rút gọn),H(mình) | lọc studentId, classId, status, overdue, from, to |
| GET | /invoices/:id | như trên | kèm payments |
| POST | /invoices | M,S | tạo thủ công `kind=SURCHARGE` (phụ thu) |
| POST | /invoices/:id/discount | M,S | S → PENDING_APPROVAL; M → APPROVED |
| POST | /invoices/:id/discount/decision | M | `{approve:boolean, note?}` |
| POST | /invoices/:id/payments | M,S | PAYMENT_EXCEEDS_BALANCE |
| POST | /payments/:id/void | M | `{reason}` |
| GET | /payments/:id/receipt.pdf | M,S,H(mình) | |
| POST | /invoices/:id/void | M | chỉ khi chưa có payment VALID |

**Reports** (M,S)
| Method | Path |
|---|---|
| GET | /reports/dashboard |
| GET | /reports/admissions?from&to&courseId |
| GET | /reports/attendance?from&to&classId&courseId |
| GET | /reports/academic?from&to&classId&courseId&teacherId |
| GET | /reports/finance?from&to&courseId&classId&groupBy=month|course|class |
| GET | /reports/:type/export?format=xlsx|pdf&... |

**Notifications** (auth, chỉ của mình)
| GET /notifications · GET /notifications/unread-count · POST /notifications/:id/read · POST /notifications/read-all |

### 3.4 Ví dụ hợp đồng (zod, `packages/shared/src/schemas/enrollments.ts`)
```ts
export const AssignClassInput = z.object({
  classId: zObjectId,
  overrideReason: z.string().trim().min(5).max(500).optional(),
});
export type AssignClassInput = z.infer<typeof AssignClassInput>;
```

## 4. Dữ liệu seed (`pnpm --filter api seed`)
- 1 ADMIN, 1 MANAGER (`manager@center.local`), 2 ACADEMIC_STAFF, 5 TEACHER, 60 STUDENT (mật khẩu chung `Password1` trong môi trường dev).
- 3 khóa (Tiếng Anh giao tiếp A1–B2, IELTS 4.0–7.0, Tiếng Nhật N5–N3), 6 phòng.
- 8 lớp với đủ trạng thái, lịch 8 tuần, điểm danh 4 tuần đã qua, 2 bài đánh giá có điểm, hóa đơn với đủ trạng thái UNPAID/PARTIAL/PAID/overdue.
- Script `seed:large` cho NFR-02.
