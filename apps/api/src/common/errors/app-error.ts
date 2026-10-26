import { ERROR_HTTP_STATUS, type ErrorCode } from '@lc/shared';

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    status?: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'AppError';
    this.status = status ?? ERROR_HTTP_STATUS[code];
  }
}
