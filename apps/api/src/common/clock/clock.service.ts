import { Injectable } from '@nestjs/common';

export abstract class ClockService {
  abstract now(): Date;
}

@Injectable()
export class SystemClock extends ClockService {
  now(): Date {
    return new Date();
  }
}

/** Starts at `start` and keeps running with real time: now() = start + (realNow() − bootTime). */
export class OffsetClock extends ClockService {
  private readonly bootTime: number;

  constructor(
    private readonly start: Date,
    private readonly realNow: () => number = Date.now,
  ) {
    super();
    this.bootTime = realNow();
  }

  now(): Date {
    return new Date(this.start.getTime() + (this.realNow() - this.bootTime));
  }
}
