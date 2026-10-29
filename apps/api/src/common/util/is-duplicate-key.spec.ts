import { isDuplicateKey } from './is-duplicate-key';

describe('isDuplicateKey', () => {
  it('true chỉ với lỗi Mongo E11000', () => {
    expect(isDuplicateKey({ code: 11000, keyValue: { code: 'X' } })).toBe(true);
    expect(isDuplicateKey({ code: 112 })).toBe(false);
    expect(isDuplicateKey(new Error('x'))).toBe(false);
    expect(isDuplicateKey(null)).toBe(false);
    expect(isDuplicateKey('E11000')).toBe(false);
  });
});
