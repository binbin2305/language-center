import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { CancelFutureSessionsInput, Role } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ScheduleService } from './schedule.service';

@Controller('classes')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
export class ClassSessionsController {
  constructor(private readonly svc: ScheduleService) {}

  @Post(':id/sessions/cancel-future')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  @HttpCode(200)
  async cancelFuture(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelFutureSessionsInput)) body: CancelFutureSessionsInput,
  ) {
    return { data: await this.svc.cancelFuture(id, body.reason, user) };
  }
}
