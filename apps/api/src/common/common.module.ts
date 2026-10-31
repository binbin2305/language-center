import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { ClockHolderBinder } from './clock/clock-holder';
import { ClockService, SystemClock } from './clock/clock.service';
import { CounterService } from './db/counter.service';
import { PdfService } from './pdf/pdf.service';
import { NotificationsService } from './notifications/notifications.service';
import { ScopeService } from './scope/scope.service';
import { SettingsService } from './settings/settings.service';

const services = [CounterService, AuditService, NotificationsService, SettingsService, ScopeService, PdfService];

@Global()
@Module({
  providers: [{ provide: ClockService, useClass: SystemClock }, ClockHolderBinder, ...services],
  exports: [ClockService, ...services],
})
export class CommonModule {}
