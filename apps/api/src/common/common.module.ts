import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { ClockService, SystemClock } from './clock/clock.service';
import { CounterService } from './db/counter.service';
import { NotificationsService } from './notifications/notifications.service';
import { ScopeService } from './scope/scope.service';
import { SettingsService } from './settings/settings.service';

const services = [CounterService, AuditService, NotificationsService, SettingsService, ScopeService];

@Global()
@Module({
  providers: [{ provide: ClockService, useClass: SystemClock }, ...services],
  exports: [ClockService, ...services],
})
export class CommonModule {}
