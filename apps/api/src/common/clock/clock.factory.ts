import type { Logger } from '@nestjs/common';
import type { Env } from '../../config/env';
import { ClockService, OffsetClock, SystemClock } from './clock.service';

/**
 * D30: APP_CLOCK_START (ISO-8601 with offset) starts a running OffsetClock for e2e/demo runs.
 * Never honoured in production (NFR-01): the override is ignored with a warning.
 */
export function createClock(
  env: Pick<Env, 'NODE_ENV' | 'APP_CLOCK_START'>,
  logger?: Pick<Logger, 'warn'>,
): ClockService {
  if (!env.APP_CLOCK_START) return new SystemClock();
  if (env.NODE_ENV === 'production') {
    logger?.warn('APP_CLOCK_START ignored in production');
    return new SystemClock();
  }
  return new OffsetClock(new Date(env.APP_CLOCK_START));
}
