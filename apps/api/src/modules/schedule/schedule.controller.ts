import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  BulkCreateSessionsInput,
  CheckConflictsInput,
  CreateSessionInput,
  Role,
} from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ScheduleService } from './schedule.service';

@Controller('sessions')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
export class ScheduleController {
  constructor(private readonly svc: ScheduleService) {}

  @Post()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CreateSessionInput)) body: CreateSessionInput) {
    return { data: await this.svc.create(body, user) };
  }

  @Post('bulk')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async createBulk(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(BulkCreateSessionsInput)) body: BulkCreateSessionsInput,
  ) {
    return { data: await this.svc.createBulk(body, user) };
  }

  @Post('check-conflicts')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  @HttpCode(200)
  async checkConflicts(@Body(new ZodValidationPipe(CheckConflictsInput)) body: CheckConflictsInput) {
    return { data: await this.svc.checkConflicts(body) };
  }
}
