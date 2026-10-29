import { z } from 'zod';
import { ApiError } from '../api';
import { applyServerFieldErrors, viParams } from '../forms';

describe('applyServerFieldErrors (RULES §4: details.fields → setError)', () => {
  it('DUPLICATE dùng thông báo riêng của ô, mã khác dùng thông báo chung', () => {
    const setError = vi.fn();
    const err = new ApiError({
      code: 'CONFLICT',
      status: 409,
      message: 'x',
      details: { fields: { code: 'DUPLICATE', name: 'INVALID' } },
    });
    expect(applyServerFieldErrors(err, setError, { code: 'Mã đã tồn tại' })).toBe(true);
    expect(setError).toHaveBeenCalledWith('code', { type: 'server', message: 'Mã đã tồn tại' });
    expect(setError).toHaveBeenCalledWith('name', { type: 'server', message: 'Giá trị chưa hợp lệ. Kiểm tra lại ô này.' });
  });

  it('lỗi không có details.fields → false, không gọi setError', () => {
    const setError = vi.fn();
    expect(applyServerFieldErrors(new Error('boom'), setError, {})).toBe(false);
    expect(applyServerFieldErrors(new ApiError({ code: 'CONFLICT', status: 409, message: 'x' }), setError, {})).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});

describe('viParams', () => {
  it('mỗi ô một thông báo tiếng Việt, ô không khai báo dùng thông báo chung', () => {
    const schema = z.object({ code: z.string().min(2), name: z.string().min(2) });
    const res = schema.safeParse({ code: '', name: '' }, viParams({ code: 'Nhập mã' }));
    expect(res.success).toBe(false);
    const byField = Object.fromEntries((res.success ? [] : res.error.issues).map((i) => [i.path[0], i.message]));
    expect(byField).toEqual({ code: 'Nhập mã', name: 'Giá trị chưa hợp lệ. Kiểm tra lại ô này.' });
  });
});
