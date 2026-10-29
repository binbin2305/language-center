import { describe, expect, it } from 'vitest';
import { absenceRate, attendanceRate } from '../attendance-rate';

describe('FR-ATT-05 tỷ lệ chuyên cần / vắng', () => {
  it('absenceRate = (EXCUSED+UNEXCUSED)/tổng', () => {
    expect(absenceRate({ PRESENT: 8, EXCUSED: 1, UNEXCUSED: 1 })).toBe(0.2);
  });
  it('absenceRate = 0 khi không có bản ghi', () => {
    expect(absenceRate({})).toBe(0);
  });
  it('attendanceRate = (PRESENT+LATE)/tổng', () => {
    expect(attendanceRate({ PRESENT: 3, LATE: 1 })).toBe(1);
    expect(attendanceRate({ PRESENT: 3, UNEXCUSED: 1 })).toBe(0.75);
  });
  it('attendanceRate = null khi không có bản ghi', () => {
    expect(attendanceRate({})).toBeNull();
  });
});
