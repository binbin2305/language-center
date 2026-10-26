// Enums from BACKEND_SCHEMA.md section 1. Level is a free string defined by Course.levels[].

export const Role = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  ACADEMIC_STAFF: 'ACADEMIC_STAFF',
  TEACHER: 'TEACHER',
  STUDENT: 'STUDENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ALL_ROLES: Role[] = Object.values(Role);

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  DISABLED: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
export const ALL_USER_STATUSES: UserStatus[] = Object.values(UserStatus);

export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];
export const ALL_GENDERS: Gender[] = Object.values(Gender);

export const LeadStatus = {
  NEW: 'NEW',
  PROFILE_CREATED: 'PROFILE_CREATED',
  CANCELLED: 'CANCELLED',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];
export const ALL_LEAD_STATUSES: LeadStatus[] = Object.values(LeadStatus);

export const StudentStatus = {
  ACTIVE: 'ACTIVE',
  RESERVED: 'RESERVED',
  DROPPED: 'DROPPED',
  COMPLETED: 'COMPLETED',
} as const;
export type StudentStatus = (typeof StudentStatus)[keyof typeof StudentStatus];
export const ALL_STUDENT_STATUSES: StudentStatus[] = Object.values(StudentStatus);

export const CourseStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type CourseStatus = (typeof CourseStatus)[keyof typeof CourseStatus];
export const ALL_COURSE_STATUSES: CourseStatus[] = Object.values(CourseStatus);

export const ClassStatus = {
  PLANNED: 'PLANNED',
  ONGOING: 'ONGOING',
  FINISHED: 'FINISHED',
  INACTIVE: 'INACTIVE',
} as const;
export type ClassStatus = (typeof ClassStatus)[keyof typeof ClassStatus];
export const ALL_CLASS_STATUSES: ClassStatus[] = Object.values(ClassStatus);

export const EnrollmentStatus = {
  PENDING_PLACEMENT: 'PENDING_PLACEMENT',
  WAITING_CLASS: 'WAITING_CLASS',
  ENROLLED: 'ENROLLED',
  TRANSFERRED: 'TRANSFERRED',
  RESERVED: 'RESERVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];
export const ALL_ENROLLMENT_STATUSES: EnrollmentStatus[] = Object.values(EnrollmentStatus);

export const PlacementStatus = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type PlacementStatus = (typeof PlacementStatus)[keyof typeof PlacementStatus];
export const ALL_PLACEMENT_STATUSES: PlacementStatus[] = Object.values(PlacementStatus);

export const SessionStatus = {
  SCHEDULED: 'SCHEDULED',
  CANCELLED: 'CANCELLED',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];
export const ALL_SESSION_STATUSES: SessionStatus[] = Object.values(SessionStatus);

export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  EXCUSED: 'EXCUSED',
  UNEXCUSED: 'UNEXCUSED',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];
export const ALL_ATTENDANCE_STATUSES: AttendanceStatus[] = Object.values(AttendanceStatus);

export const AssessmentType = {
  QUIZ: 'QUIZ',
  MIDTERM: 'MIDTERM',
  FINAL: 'FINAL',
  SKILL: 'SKILL',
} as const;
export type AssessmentType = (typeof AssessmentType)[keyof typeof AssessmentType];
export const ALL_ASSESSMENT_TYPES: AssessmentType[] = Object.values(AssessmentType);

export const InvoiceStatus = {
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  VOID: 'VOID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
export const ALL_INVOICE_STATUSES: InvoiceStatus[] = Object.values(InvoiceStatus);

export const InvoiceKind = {
  TUITION: 'TUITION',
  SURCHARGE: 'SURCHARGE',
} as const;
export type InvoiceKind = (typeof InvoiceKind)[keyof typeof InvoiceKind];
export const ALL_INVOICE_KINDS: InvoiceKind[] = Object.values(InvoiceKind);

export const DiscountStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type DiscountStatus = (typeof DiscountStatus)[keyof typeof DiscountStatus];
export const ALL_DISCOUNT_STATUSES: DiscountStatus[] = Object.values(DiscountStatus);

export const PaymentMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CARD: 'CARD',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export const ALL_PAYMENT_METHODS: PaymentMethod[] = Object.values(PaymentMethod);

export const PaymentStatus = {
  VALID: 'VALID',
  VOIDED: 'VOIDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];
export const ALL_PAYMENT_STATUSES: PaymentStatus[] = Object.values(PaymentStatus);

export const NotificationType = {
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_UPDATED: 'SESSION_UPDATED',
  SESSION_CANCELLED: 'SESSION_CANCELLED',
  CLASS_ASSIGNED: 'CLASS_ASSIGNED',
  ATTENDANCE_WARNING: 'ATTENDANCE_WARNING',
  GRADES_PUBLISHED: 'GRADES_PUBLISHED',
  INVOICE_CREATED: 'INVOICE_CREATED',
  PAYMENT_RECORDED: 'PAYMENT_RECORDED',
  DISCOUNT_DECIDED: 'DISCOUNT_DECIDED',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
export const ALL_NOTIFICATION_TYPES: NotificationType[] = Object.values(NotificationType);

export const GradeClass = {
  EXCELLENT: 'EXCELLENT',
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  AVERAGE: 'AVERAGE',
  FAIL: 'FAIL',
} as const;
export type GradeClass = (typeof GradeClass)[keyof typeof GradeClass];
export const ALL_GRADE_CLASSES: GradeClass[] = Object.values(GradeClass);
