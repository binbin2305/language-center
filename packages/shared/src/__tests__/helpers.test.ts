import { describe, expect, it } from 'vitest';
import {
  ALL_CLASS_STATUSES,
  ALL_ENROLLMENT_STATUSES,
  CLASS_TRANSITIONS,
  ENROLLMENT_TRANSITIONS,
  addVnDays,
  applyDiscount,
  canTransition,
  classify,
  formatVnd,
  fromDateOnly,
  isPass,
  isSameVnDay,
  isValidDiscount,
  isValidScore,
  removeVietnameseTones,
  startOfVnDay,
  toDateOnly,
  vnDateTime,
  vnDay,
  weightedAverage,
} from '../index';

describe('time', () => {
  it('vnDay theo múi giờ VN', () => {
    expect(vnDay(new Date('2026-01-14T17:30:00Z'))).toBe('2026-01-15');
    expect(vnDay(new Date('2026-01-14T16:59:59Z'))).toBe('2026-01-14');
  });
  it('vnDateTime / startOfVnDay', () => {
    expect(vnDateTime('2026-01-05', '18:00').toISOString()).toBe('2026-01-05T11:00:00.000Z');
    expect(startOfVnDay('2026-01-05').toISOString()).toBe('2026-01-04T17:00:00.000Z');
  });
  it('toDateOnly / fromDateOnly: lưu ngày thuần = 0h giờ VN, round-trip', () => {
    const stored = fromDateOnly('2026-01-05');
    expect(stored.toISOString()).toBe('2026-01-04T17:00:00.000Z');
    // toISOString().slice(0, 10) would give the previous day here.
    expect(toDateOnly(stored)).toBe('2026-01-05');
    expect(toDateOnly(new Date('2026-01-05T16:59:59Z'))).toBe('2026-01-05');
    for (const day of ['2026-01-01', '2026-02-28', '2026-12-31', '2028-02-29']) {
      expect(toDateOnly(fromDateOnly(day))).toBe(day);
    }
    expect(() => fromDateOnly('2026-02-30')).toThrow(RangeError);
  });
  it('addVnDays', () => {
    expect(addVnDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addVnDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addVnDays('2026-01-01', 0)).toBe('2026-01-01');
  });
  it('isSameVnDay', () => {
    expect(isSameVnDay(new Date('2026-01-14T16:59:00Z'), new Date('2026-01-14T17:00:00Z'))).toBe(false);
    expect(isSameVnDay(new Date('2026-01-14T17:00:00Z'), new Date('2026-01-15T16:59:00Z'))).toBe(true);
  });
  it('đầu vào sai ném RangeError', () => {
    expect(() => startOfVnDay('2026-1-5')).toThrow(RangeError);
    expect(() => addVnDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => vnDateTime('2026-01-05', '25:00')).toThrow(RangeError);
    expect(() => vnDateTime('2026-01-05', '9:00')).toThrow(RangeError);
  });
});

describe('money', () => {
  it('applyDiscount', () => {
    expect(applyDiscount(1_555_555, { kind: 'PERCENT', value: 10 })).toBe(1_399_999);
    expect(applyDiscount(1_000_000, { kind: 'PERCENT', value: 100 })).toBe(0);
    expect(applyDiscount(1_000_000, { kind: 'PERCENT', value: 0 })).toBe(1_000_000);
    expect(applyDiscount(1_000_000, { kind: 'AMOUNT', value: 200_000 })).toBe(800_000);
    expect(applyDiscount(1_000_000, { kind: 'AMOUNT', value: 1_000_000 })).toBe(0);
  });
  it('applyDiscount ném RangeError khi không hợp lệ', () => {
    expect(() => applyDiscount(1_000_000, { kind: 'AMOUNT', value: 1_000_001 })).toThrow(RangeError);
    expect(() => applyDiscount(1_000_000, { kind: 'AMOUNT', value: 1.5 })).toThrow(RangeError);
    expect(() => applyDiscount(1_000_000, { kind: 'AMOUNT', value: -1 })).toThrow(RangeError);
    expect(() => applyDiscount(1_000_000, { kind: 'PERCENT', value: 100.5 })).toThrow(RangeError);
    expect(() => applyDiscount(1_000_000, { kind: 'PERCENT', value: -1 })).toThrow(RangeError);
    expect(() => applyDiscount(-5, { kind: 'PERCENT', value: 10 })).toThrow(RangeError);
    expect(() => applyDiscount(10.5, { kind: 'PERCENT', value: 10 })).toThrow(RangeError);
  });
  it('isValidDiscount', () => {
    expect(isValidDiscount(1000, { kind: 'PERCENT', value: 50 })).toBe(true);
    expect(isValidDiscount(1000, { kind: 'PERCENT', value: 101 })).toBe(false);
    expect(isValidDiscount(1000, { kind: 'PERCENT', value: NaN })).toBe(false);
    expect(isValidDiscount(1000, { kind: 'AMOUNT', value: 1000 })).toBe(true);
    expect(isValidDiscount(1000, { kind: 'AMOUNT', value: 1001 })).toBe(false);
    expect(isValidDiscount(-1, { kind: 'AMOUNT', value: 0 })).toBe(false);
  });
  it('formatVnd', () => {
    expect(formatVnd(1_500_000)).toBe('1.500.000 ₫');
    expect(formatVnd(0)).toBe('0 ₫');
    expect(formatVnd(999)).toBe('999 ₫');
    expect(formatVnd(1000)).toBe('1.000 ₫');
    expect(formatVnd(-2_500_000)).toBe('-2.500.000 ₫');
    expect(formatVnd(1234.6)).toBe('1.235 ₫');
  });
});

describe('grading', () => {
  it('isValidScore', () => {
    [0, 7.25, 10].forEach((s) => expect(isValidScore(s)).toBe(true));
    [10.25, 7.3, -1, NaN, Infinity].forEach((s) => expect(isValidScore(s)).toBe(false));
  });
  it('weightedAverage', () => {
    expect(weightedAverage([{ score: 8, weight: 30 }, { score: null, weight: 30 }, { score: 6, weight: 40 }])).toBe(6.86);
    expect(weightedAverage([{ score: null, weight: 100 }])).toBeNull();
    expect(weightedAverage([{ score: 0, weight: 30 }, { score: 6.75, weight: 70 }])).toBe(4.73);
    expect(weightedAverage([{ score: 0.25, weight: 50 }, { score: 3, weight: 50 }])).toBe(1.63);
    expect(weightedAverage([{ score: 0.25, weight: 30 }, { score: 3, weight: 70 }])).toBe(2.18);
    expect(weightedAverage([{ score: 0.25, weight: 30 }, { score: 7, weight: 70 }])).toBe(4.98);
    expect(weightedAverage([{ score: 7.3, weight: 1 }, { score: 6, weight: 1.5 }])).toBe(6.52);
    expect(weightedAverage([])).toBeNull();
    expect(weightedAverage([{ score: 5, weight: 0 }])).toBeNull();
  });
  it('classify + isPass', () => {
    const cases: [number, string][] = [
      [4.99, 'FAIL'], [5, 'AVERAGE'], [6.49, 'AVERAGE'], [6.5, 'FAIR'],
      [7.99, 'FAIR'], [8, 'GOOD'], [8.99, 'GOOD'], [9, 'EXCELLENT'], [10, 'EXCELLENT'],
    ];
    cases.forEach(([a, c]) => expect(classify(a)).toBe(c));
    expect(isPass(4.99)).toBe(false);
    expect(isPass(5)).toBe(true);
  });
});

describe('text', () => {
  it('removeVietnameseTones', () => {
    expect(removeVietnameseTones('Nguyễn Đức Ánh')).toBe('nguyen duc anh');
    expect(removeVietnameseTones('đường Đ')).toBe('duong d');
  });
});

describe('transitions', () => {
  it('ví dụ cố định', () => {
    expect(canTransition(ENROLLMENT_TRANSITIONS, 'RESERVED', 'WAITING_CLASS')).toBe(true);
    expect(canTransition(ENROLLMENT_TRANSITIONS, 'COMPLETED', 'ENROLLED')).toBe(false);
    expect(canTransition(CLASS_TRANSITIONS, 'FINISHED', 'PLANNED')).toBe(false);
  });
  it('enrollment: mọi cặp (from,to) khớp BACKEND_SCHEMA §2.8', () => {
    const expected = new Set([
      'PENDING_PLACEMENT>WAITING_CLASS', 'PENDING_PLACEMENT>CANCELLED',
      'WAITING_CLASS>ENROLLED', 'WAITING_CLASS>CANCELLED',
      'ENROLLED>TRANSFERRED', 'ENROLLED>RESERVED', 'ENROLLED>CANCELLED', 'ENROLLED>COMPLETED',
      'RESERVED>WAITING_CLASS', 'RESERVED>CANCELLED',
    ]);
    for (const from of ALL_ENROLLMENT_STATUSES) {
      for (const to of ALL_ENROLLMENT_STATUSES) {
        expect(canTransition(ENROLLMENT_TRANSITIONS, from, to), `${from}>${to}`).toBe(expected.has(`${from}>${to}`));
      }
    }
  });
  it('class: mọi cặp (from,to) khớp BACKEND_SCHEMA §2.10', () => {
    const expected = new Set([
      'PLANNED>ONGOING', 'PLANNED>INACTIVE', 'ONGOING>FINISHED', 'ONGOING>INACTIVE', 'INACTIVE>PLANNED',
    ]);
    for (const from of ALL_CLASS_STATUSES) {
      for (const to of ALL_CLASS_STATUSES) {
        expect(canTransition(CLASS_TRANSITIONS, from, to), `${from}>${to}`).toBe(expected.has(`${from}>${to}`));
      }
    }
  });
});
