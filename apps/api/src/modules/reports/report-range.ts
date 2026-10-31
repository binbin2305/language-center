import { addVnDays, ErrorCode, startOfVnDay } from '@lc/shared';
import { AppError } from '../../common/errors/app-error';

/** [startOfVnDay(from), startOfVnDay(to + 1 day)) — half-open, so the whole `to` day is included. */
export function vnRange(from: string, to: string): { start: Date; end: Date } {
  if (to < from) throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { to: 'to must not be before from' } });
  return { start: startOfVnDay(from), end: startOfVnDay(addVnDays(to, 1)) };
}
