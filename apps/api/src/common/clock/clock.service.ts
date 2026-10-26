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
