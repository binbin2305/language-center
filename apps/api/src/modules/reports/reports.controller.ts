import { Controller, Get } from '@nestjs/common';
import { Role } from '@lc/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { DashboardService } from './dashboard.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async getDashboard() {
    return { data: await this.dashboard.get() };
  }
}
