import { escapeRegex } from './escape-regex';

describe('escapeRegex', () => {
  it('khớp nguyên văn mọi ký tự đặc biệt của RegExp', () => {
    const raw = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o';
    expect(new RegExp(`^${escapeRegex(raw)}$`).test(raw)).toBe(true);
    expect(new RegExp(escapeRegex('a.b')).test('axb')).toBe(false);
  });
});
