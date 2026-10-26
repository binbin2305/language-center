import { Injectable } from '@nestjs/common';
import { ClockService, SystemClock } from './clock.service';

let current: ClockService = new SystemClock();

/**
 * Process-wide handle on the active ClockService for code outside DI (Mongoose `timestamps`).
 * Bound by ClockHolderBinder whenever the app's ClockService is instantiated, so a FakeClock
 * override in tests drives createdAt/updatedAt too. Services keep injecting ClockService.
 */
export const clockHolder = {
  now: (): Date => current.now(),
  use(clock: ClockService): void {
    current = clock;
  },
};

@Injectable()
export class ClockHolderBinder {
  constructor(clock: ClockService) {
    clockHolder.use(clock);
  }
}
