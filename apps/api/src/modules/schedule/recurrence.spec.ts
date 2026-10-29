import { expandWeekly } from './recurrence';

const base = { startTime: '18:00', endTime: '19:30' };

describe('FR-SCH-02 Mở rộng lịch lặp hằng tuần', () => {
  it('T2/T4/T6 18:00-19:30 từ 05/01 đến 30/01/2026 -> 12 buổi, đúng giờ UTC', () => {
    const r = expandWeekly({ ...base, weekdays: [1, 3, 5], fromDate: '2026-01-05', toDate: '2026-01-30' });
    expect(r).toHaveLength(12);
    expect(r[0].startAt.toISOString()).toBe('2026-01-05T11:00:00.000Z');
    expect(r[0].endAt.toISOString()).toBe('2026-01-05T12:30:00.000Z');
    expect(r[11].startAt.toISOString()).toBe('2026-01-30T11:00:00.000Z');
  });

  it('weekdays [1,1,3] tháng 1/2026 (05-31) -> 8 buổi không trùng', () => {
    const r = expandWeekly({ ...base, weekdays: [1, 1, 3], fromDate: '2026-01-05', toDate: '2026-01-31' });
    expect(r).toHaveLength(8);
    expect(new Set(r.map((x) => x.startAt.getTime())).size).toBe(8);
  });

  it('kết quả sắp xếp tăng dần theo thời gian dù weekdays không theo thứ tự', () => {
    const r = expandWeekly({ ...base, weekdays: [5, 1], fromDate: '2026-01-05', toDate: '2026-01-11' });
    expect(r.map((x) => x.startAt.toISOString())).toEqual(['2026-01-05T11:00:00.000Z', '2026-01-09T11:00:00.000Z']);
  });

  it('qua ranh giới tháng/năm vẫn đúng', () => {
    const r = expandWeekly({ ...base, weekdays: [7], fromDate: '2026-12-28', toDate: '2027-01-04' });
    expect(r.map((x) => x.startAt.toISOString())).toEqual(['2027-01-03T11:00:00.000Z']);
  });

  it('endTime <= startTime -> throw', () => {
    expect(() => expandWeekly({ weekdays: [1], startTime: '19:30', endTime: '19:30', fromDate: '2026-01-05', toDate: '2026-01-31' })).toThrow();
    expect(() => expandWeekly({ weekdays: [1], startTime: '19:30', endTime: '18:00', fromDate: '2026-01-05', toDate: '2026-01-31' })).toThrow();
  });

  it('fromDate > toDate -> []', () => {
    expect(expandWeekly({ ...base, weekdays: [1], fromDate: '2026-02-01', toDate: '2026-01-01' })).toEqual([]);
  });
});
