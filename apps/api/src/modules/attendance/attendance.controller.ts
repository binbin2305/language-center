import { Controller, Get, Query } from '@nestjs/common';
import { AttendanceSummaryQuery, ListAttendanceQuery, Role } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AttendanceService } from './attendance.service';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  // `summary` is declared before any `:id` route.
  @Get('summary')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  summary(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(AttendanceSummaryQuery)) q: AttendanceSummaryQuery) {
    return this.svc.summary(q, user);
  }

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(ListAttendanceQuery)) q: ListAttendanceQuery) {
    return this.svc.list(q, user);
  }
}
