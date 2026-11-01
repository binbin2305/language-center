import { expect, test } from '@playwright/test';
import { formatVnd } from '../money';

/** e2e/fixtures/money.ts must format exactly like formatVnd of @lc/shared (X-06 compares UI text with it). */
test('fixtures formatVnd = @lc/shared formatVnd (dấu chấm nghìn, " ₫", số âm, làm tròn)', () => {
  expect(formatVnd(1_350_000)).toBe('1.350.000 ₫');
  expect(formatVnd(0)).toBe('0 ₫');
  expect(formatVnd(999)).toBe('999 ₫');
  expect(formatVnd(-2_500_000)).toBe('-2.500.000 ₫');
  expect(formatVnd(1234.6)).toBe('1.235 ₫');
});
