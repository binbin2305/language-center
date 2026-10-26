import { describe, expect, it } from 'vitest';
import { ChangePasswordInput, zPassword } from '../index';

describe('FR-AUTH-02 zPassword', () => {
  it.each(['Password1', 'abcdefg1', '1234567a', 'A1'.repeat(50)])('chấp nhận %s', (v) => {
    expect(zPassword.safeParse(v).success).toBe(true);
  });
  it.each(['abc', 'abcdefgh', '12345678', 'Pass1', 'A1'.repeat(51), ''])('từ chối %j', (v) => {
    expect(zPassword.safeParse(v).success).toBe(false);
  });
  it('ChangePasswordInput áp dụng quy tắc chữ + số', () => {
    expect(ChangePasswordInput.safeParse({ currentPassword: 'x', newPassword: 'abcdefgh' }).success).toBe(false);
  });
});
