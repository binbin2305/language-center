import { describe, expect, it } from 'vitest';
import { formatVndCompact } from '../format';

describe('formatVndCompact (trục Y tab Tài chính)', () => {
  it('triệu: 160.000.000 → "160 tr", 1.500.000 → "1,5 tr"', () => {
    expect(formatVndCompact(160_000_000)).toBe('160 tr');
    expect(formatVndCompact(1_500_000)).toBe('1,5 tr');
  });
  it('tỷ: 1.500.000.000 → "1,5 tỷ"', () => {
    expect(formatVndCompact(1_500_000_000)).toBe('1,5 tỷ');
  });
  it('nhỏ hơn 1 triệu: 0 → "0", 500.000 → "500 k"', () => {
    expect(formatVndCompact(0)).toBe('0');
    expect(formatVndCompact(500_000)).toBe('500 k');
  });
});
