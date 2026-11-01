import { Global, Logger, Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { ClockHolderBinder } from './clock/clock-holder';
import { createClock } from './clock/clock.factory';
import { ClockService } from './clock/clock.service';
import { CounterService } from './db/counter.service';
import { PdfService } from './pdf/pdf.service';
import { NotificationsService } from './notifications/notifications.service';
import { ScopeService } from './scope/scope.service';
import { SettingsService } from './settings/settings.service';
import { loadEnv } from '../config/env';

const services = [CounterService, AuditService, NotificationsService, SettingsService, ScopeService, PdfService];

@Global()
@Module({
  providers: [{ provide: ClockService, useFactory: () => createClock(loadEnv(), new Logger('Clock')) }, ClockHolderBinder, ...services],
  exports: [ClockService, ...services],
})
export class CommonModule {}
