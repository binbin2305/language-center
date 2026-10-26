import { formatVnd, formatDate, formatDateTime, formatTime } from '../format';

describe('format', () => {
  it('formatVnd', () => expect(formatVnd(1500000)).toBe('1.500.000 ₫'));
  it('formatDate theo giờ VN', () => {
    expect(formatDate('2026-01-14T17:30:00Z')).toBe('15/01/2026');
  });
  it('formatDateTime', () => {
    expect(formatDateTime(new Date('2026-01-14T17:30:00Z'))).toBe('00:30 15/01/2026');
  });
  it('formatTime', () => expect(formatTime('2026-01-14T17:30:00Z')).toBe('00:30'));
});
