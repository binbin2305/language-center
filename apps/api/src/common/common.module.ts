import { Global, Module } from '@nestjs/common';
import { ClockService, SystemClock } from './clock/clock.service';

@Global()
@Module({
  providers: [{ provide: ClockService, useClass: SystemClock }],
  exports: [ClockService],
})
export class CommonModule {}
