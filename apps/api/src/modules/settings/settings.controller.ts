import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ALL_ROLES, Role, SettingsDto, UpdateSettingsInput } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Settings } from '../../database/schemas/settings.schema';
import { SettingsService } from '../../common/settings/settings.service';

function toSettingsDto(s: Settings & { updatedAt?: Date }): SettingsDto {
  return {
    centerName: s.centerName,
    attendanceWarningThreshold: s.attendanceWarningThreshold,
    gradeLockDays: s.gradeLockDays,
    resultViewRequiresPaidFees: s.resultViewRequiresPaidFees,
    teacherAttendanceEditDays: s.teacherAttendanceEditDays,
    invoiceDueDaysAfterStart: s.invoiceDueDaysAfterStart,
    updatedAt: s.updatedAt?.toISOString(),
  };
}

@Controller('settings')
@Roles(...ALL_ROLES)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Roles(...ALL_ROLES)
  async get() {
    return { data: toSettingsDto(await this.settings.get()) };
  }

  @Patch()
  @Roles(Role.MANAGER)
  async update(@Body(new ZodValidationPipe(UpdateSettingsInput)) body: UpdateSettingsInput, @CurrentUser() user: AuthUser) {
    return { data: toSettingsDto(await this.settings.update(body, user)) };
  }
}
