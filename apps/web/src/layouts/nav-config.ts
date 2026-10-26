import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  DoorOpen,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  BarChart3,
  Award,
} from 'lucide-react';
import { Role } from '@lc/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Shown in the bottom navigation on mobile (max 5 per role). */
  mobile?: boolean;
}

const { ADMIN, MANAGER, ACADEMIC_STAFF, TEACHER, STUDENT } = Role;
const STAFF = [MANAGER, ACADEMIC_STAFF];

/**
 * Menu by role, DESIGN §3 "Menu theo vai trò". The same destination may appear several times
 * with a different label per role. Order = display order. ADMIN sees accounts + notifications.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, roles: STAFF },
  { to: '/', label: 'Hôm nay của tôi', icon: LayoutDashboard, roles: [TEACHER], mobile: true },
  { to: '/', label: 'Trang của tôi', icon: LayoutDashboard, roles: [STUDENT], mobile: true },

  { to: '/admissions/leads', label: 'Tuyển sinh', icon: UserPlus, roles: STAFF },
  { to: '/admissions/placement', label: 'Kiểm tra đầu vào', icon: ListChecks, roles: [TEACHER] },

  { to: '/students', label: 'Học viên', icon: Users, roles: STAFF },
  { to: '/students', label: 'Học viên lớp tôi', icon: Users, roles: [TEACHER] },
  { to: '/me/profile', label: 'Hồ sơ của tôi', icon: UserRound, roles: [STUDENT] },

  { to: '/classes', label: 'Lớp học', icon: GraduationCap, roles: STAFF },
  { to: '/classes', label: 'Lớp của tôi', icon: GraduationCap, roles: [TEACHER] },
  { to: '/me/classes', label: 'Lớp của tôi', icon: GraduationCap, roles: [STUDENT] },

  { to: '/enrollments/waiting', label: 'Xếp lớp', icon: ListChecks, roles: STAFF },

  { to: '/schedule', label: 'Lịch học', icon: CalendarDays, roles: [...STAFF, STUDENT], mobile: true },
  { to: '/schedule', label: 'Lịch dạy', icon: CalendarDays, roles: [TEACHER], mobile: true },

  { to: '/attendance', label: 'Điểm danh', icon: ClipboardCheck, roles: [...STAFF, TEACHER], mobile: true },
  { to: '/me/attendance', label: 'Chuyên cần của tôi', icon: ClipboardCheck, roles: [STUDENT], mobile: true },

  { to: '/results', label: 'Kết quả học tập', icon: Award, roles: [...STAFF, TEACHER], mobile: true },
  { to: '/me/results', label: 'Kết quả của tôi', icon: Award, roles: [STUDENT], mobile: true },

  { to: '/fees', label: 'Học phí', icon: Banknote, roles: STAFF },
  { to: '/fees', label: 'Tra cứu học phí', icon: Banknote, roles: [TEACHER] },
  { to: '/me/fees', label: 'Học phí của tôi', icon: Banknote, roles: [STUDENT], mobile: true },

  { to: '/reports', label: 'Báo cáo', icon: BarChart3, roles: STAFF },

  { to: '/settings/courses', label: 'Khóa học', icon: BookOpen, roles: STAFF },
  { to: '/settings/rooms', label: 'Phòng học', icon: DoorOpen, roles: STAFF },

  { to: '/settings/users', label: 'Tài khoản', icon: ShieldCheck, roles: [ADMIN, MANAGER] },
  { to: '/settings/center', label: 'Cài đặt', icon: Settings, roles: [MANAGER] },

  { to: '/notifications', label: 'Thông báo', icon: Bell, roles: [ADMIN, MANAGER, ACADEMIC_STAFF, TEACHER, STUDENT] },
];

export const navItemsFor = (role: Role) => NAV_ITEMS.filter((i) => i.roles.includes(role));
export const mobileNavItemsFor = (role: Role) => navItemsFor(role).filter((i) => i.mobile);

/** Roles that get the bottom navigation instead of a sidebar below 768px. */
export const BOTTOM_NAV_ROLES: Role[] = [TEACHER, STUDENT];

