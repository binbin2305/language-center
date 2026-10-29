import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  BulkCreateSessionsInput,
  CancelSessionInput,
  CheckConflictsInput,
  CreateSessionInput,
  ListSessionsQuery,
  Role,
  UpdateSessionInput,
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

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  async list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(ListSessionsQuery)) query: ListSessionsQuery) {
    return { data: await this.svc.list(query, user) };
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  async getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.getOne(id, user) };
  }

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

  @Post('bulk/check-conflicts')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  @HttpCode(200)
  async checkBulkConflicts(@Body(new ZodValidationPipe(BulkCreateSessionsInput)) body: BulkCreateSessionsInput) {
    return { data: await this.svc.checkBulkConflicts(body) };
  }

  @Post('check-conflicts')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  @HttpCode(200)
  async checkConflicts(@Body(new ZodValidationPipe(CheckConflictsInput)) body: CheckConflictsInput) {
    return { data: await this.svc.checkConflicts(body) };
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSessionInput)) body: UpdateSessionInput,
  ) {
    return { data: await this.svc.update(id, body, user) };
  }

  @Post(':id/cancel')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  @HttpCode(200)
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelSessionInput)) body: CancelSessionInput,
  ) {
    return { data: await this.svc.cancel(id, body.reason, user) };
  }
}
