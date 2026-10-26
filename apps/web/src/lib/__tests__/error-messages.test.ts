import { ErrorCode } from '@lc/shared';
import { ERROR_MESSAGES, errorMessage } from '../error-messages';
import { ApiError } from '../api';

describe('error messages', () => {
  it('mọi ErrorCode có thông báo không rỗng', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });
  it('không lộ thuật ngữ kỹ thuật', () => {
    for (const m of Object.values(ERROR_MESSAGES))
      expect(m).not.toMatch(/\b(4\d\d|5\d\d)\b|ObjectId/);
  });
  it('errorMessage dùng map, fallback chung', () => {
    expect(errorMessage(new ApiError({ code: 'CLASS_FULL', status: 422, message: 'x' }))).toBe(
      ERROR_MESSAGES.CLASS_FULL,
    );
    expect(errorMessage(new Error('boom'))).toMatch(/thử lại/);
    expect(errorMessage(undefined)).toMatch(/thử lại/);
  });
});
