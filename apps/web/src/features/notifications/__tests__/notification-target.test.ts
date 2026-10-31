import { NotificationRefType, Role } from '@lc/shared';
import { notificationTarget } from '../notification-target';

const id = '65000000000000000000000a';

describe('notificationTarget Wave 2', () => {
  it('ENROLLMENT: HV về /me/classes, vai khác null', () => {
    expect(notificationTarget(NotificationRefType.ENROLLMENT, id, Role.STUDENT)).toBe('/me/classes');
    expect(notificationTarget(NotificationRefType.ENROLLMENT, id, Role.MANAGER)).toBeNull();
  });
  it('PLACEMENT_TEST: GV vào trang chấm, M/S vào chi tiết', () => {
    expect(notificationTarget(NotificationRefType.PLACEMENT_TEST, id, Role.TEACHER)).toBe(`/admissions/placement/${id}/grade`);
    expect(notificationTarget(NotificationRefType.PLACEMENT_TEST, id, Role.MANAGER)).toBe(`/admissions/placement/${id}`);
    expect(notificationTarget(NotificationRefType.PLACEMENT_TEST, id, Role.ACADEMIC_STAFF)).toBe(`/admissions/placement/${id}`);
  });
});
