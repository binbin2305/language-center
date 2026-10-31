import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';

@Module({ controllers: [ReportsController], providers: [DashboardService] })
export class ReportsModule {}
