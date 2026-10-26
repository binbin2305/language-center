import { ErrorCode } from '@lc/shared';

// Tone: DESIGN.md section 6 — say what went wrong and what to do; no technical terms.
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Thông tin chưa hợp lệ. Kiểm tra các ô được đánh dấu rồi thử lại.',
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này. Liên hệ quản trị viên nếu cần.',
  NOT_FOUND: 'Không tìm thấy dữ liệu. Có thể đã bị xóa, hãy tải lại trang.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Đợi một lát rồi thử lại.',
  INVALID_CREDENTIALS: 'Tên đăng nhập hoặc mật khẩu không đúng. Kiểm tra và nhập lại.',
  ACCOUNT_LOCKED:
    'Tài khoản đang bị khóa tạm thời do nhập sai nhiều lần. Đợi vài phút rồi thử lại.',
  PASSWORD_CHANGE_REQUIRED: 'Bạn cần đổi mật khẩu trước khi tiếp tục.',
  DUPLICATE_PERSON: 'Đã có người trùng số điện thoại hoặc email. Kiểm tra lại hồ sơ hiện có.',
  LEAD_NOT_FOUND: 'Không tìm thấy khách hàng tiềm năng. Tải lại danh sách và chọn lại.',
  PROFILE_EXISTS: 'Hồ sơ này đã tồn tại. Mở hồ sơ hiện có để chỉnh sửa.',
  ENROLLMENT_EXISTS: 'Học viên đã đăng ký khóa học này. Mở đăng ký hiện có để xử lý.',
  CLASS_CODE_EXISTS: 'Mã lớp đã được dùng. Nhập mã lớp khác.',
  CAPACITY_BELOW_CURRENT:
    'Sĩ số tối đa nhỏ hơn số học viên hiện có. Nhập số lớn hơn hoặc chuyển bớt học viên.',
  CLASS_HAS_DEPENDENCIES:
    'Lớp đã có học viên hoặc buổi học nên không thể xóa. Hãy chuyển lớp sang ngừng hoạt động.',
  CLASS_FULL: 'Lớp đã đủ học viên. Chọn lớp khác hoặc tăng sĩ số tối đa.',
  CLASS_NOT_OPEN: 'Lớp chưa mở hoặc đã đóng đăng ký. Chọn lớp đang nhận học viên.',
  COURSE_MISMATCH: 'Lớp không thuộc khóa học mà học viên đã đăng ký. Chọn lớp cùng khóa học.',
  LEVEL_MISMATCH: 'Trình độ của học viên chưa phù hợp với lớp này. Chọn lớp đúng trình độ.',
  ENROLLMENT_INVALID_STATE:
    'Trạng thái đăng ký hiện tại không cho phép thao tác này. Tải lại và kiểm tra trạng thái.',
  SCHEDULE_CONFLICT:
    'Lịch bị trùng phòng hoặc giáo viên. Chọn thời gian, phòng hoặc giáo viên khác.',
  SESSION_OUTSIDE_CLASS_RANGE:
    'Buổi học nằm ngoài thời gian của lớp. Chọn ngày trong khoảng khai giảng và kết thúc.',
  SESSION_LOCKED:
    'Buổi học đã khóa nên không thể thay đổi. Liên hệ quản trị viên nếu cần chỉnh sửa.',
  SESSION_NOT_CANCELLABLE: 'Buổi học này không thể hủy. Kiểm tra trạng thái buổi học.',
  ATTENDANCE_TOO_EARLY: 'Chưa đến giờ điểm danh. Quay lại khi buổi học bắt đầu.',
  ATTENDANCE_INCOMPLETE:
    'Còn học viên chưa được điểm danh. Chọn trạng thái cho tất cả học viên rồi lưu lại.',
  ATTENDANCE_EDIT_WINDOW_CLOSED: 'Đã quá thời hạn sửa điểm danh. Nhờ quản trị viên chỉnh sửa.',
  SESSION_CANCELLED: 'Buổi học đã bị hủy nên không thể điểm danh.',
  ATTENDANCE_ALREADY_TAKEN: 'Buổi học này đã được điểm danh. Tải lại trang để xem kết quả.',
  STUDENT_NOT_IN_ROSTER: 'Học viên không thuộc danh sách lớp. Tải lại danh sách lớp.',
  INVALID_STATUS_TRANSITION:
    'Không thể chuyển sang trạng thái này từ trạng thái hiện tại. Tải lại và chọn lại.',
  WEIGHT_EXCEEDS_100: 'Tổng trọng số vượt quá 100%. Giảm trọng số của các bài đánh giá khác.',
  SCORE_OUT_OF_RANGE: 'Điểm nằm ngoài thang điểm cho phép. Nhập lại điểm hợp lệ.',
  GRADES_INCOMPLETE: 'Còn học viên chưa có điểm. Nhập đủ điểm trước khi chốt.',
  GRADEBOOK_LOCKED: 'Bảng điểm đã chốt nên không thể sửa. Liên hệ quản trị viên để mở khóa.',
  REASON_REQUIRED: 'Cần nhập lý do cho thao tác này.',
  ASSESSMENT_HAS_GRADES:
    'Bài đánh giá đã có điểm nên không thể xóa hoặc đổi trọng số. Xóa điểm trước.',
  FEES_OUTSTANDING: 'Học viên còn học phí chưa thanh toán. Thu đủ học phí rồi thử lại.',
  PAYMENT_EXCEEDS_BALANCE:
    'Số tiền vượt quá số còn nợ của hóa đơn. Nhập số tiền nhỏ hơn hoặc bằng số còn nợ.',
  INVOICE_VOID: 'Hóa đơn đã hủy nên không thể thao tác. Tạo hóa đơn mới nếu cần.',
  DISCOUNT_INVALID:
    'Mức giảm giá không hợp lệ. Nhập phần trăm từ 0 đến 100 hoặc số tiền không vượt học phí.',
  DISCOUNT_NOT_PENDING: 'Yêu cầu giảm giá này đã được xử lý. Tải lại trang để xem kết quả.',
  FILE_TOO_LARGE: 'Tệp quá lớn. Chọn tệp nhỏ hơn dung lượng cho phép.',
  FILE_TYPE_NOT_ALLOWED: 'Định dạng tệp không được hỗ trợ. Chọn tệp đúng định dạng.',
  CONFLICT: 'Dữ liệu vừa được người khác thay đổi. Tải lại trang rồi thử lại.',
  INTERNAL: 'Có lỗi xảy ra phía hệ thống. Vui lòng thử lại sau ít phút.',
};

export const GENERIC_ERROR_MESSAGE = 'Có lỗi xảy ra. Vui lòng thử lại.';

/** Vietnamese message for any thrown value; unknown values fall back to a generic text. */
export function errorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as { code: unknown }).code;
    if (typeof code === 'string' && code in ERROR_MESSAGES)
      return ERROR_MESSAGES[code as ErrorCode];
  }
  return GENERIC_ERROR_MESSAGE;
}
