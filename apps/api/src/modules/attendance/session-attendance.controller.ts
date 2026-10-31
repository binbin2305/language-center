import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { Role, TakeAttendanceInput, UpdateAttendanceInput } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AttendanceService } from './attendance.service';

/** Only `:id/attendance` paths; the schedule module owns the rest of `sessions`. */
@Controller('sessions')
export class SessionAttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Get(':id/attendance')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.getSessionAttendance(id, user) };
  }

  @Put(':id/attendance')
  @Roles(Role.ACADEMIC_STAFF, Role.TEACHER)
  async take(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TakeAttendanceInput)) body: TakeAttendanceInput,
  ) {
    return { data: await this.svc.take(id, body, user) };
  }

  @Patch(':id/attendance')
  @Roles(Role.ACADEMIC_STAFF, Role.TEACHER)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAttendanceInput)) body: UpdateAttendanceInput,
  ) {
    return { data: await this.svc.update(id, body, user) };
  }
}
