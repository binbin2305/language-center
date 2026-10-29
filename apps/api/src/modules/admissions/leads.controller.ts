import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CancelLeadInput,
  CreateLeadInput,
  CreateLeadQuery,
  ListLeadsQuery,
  Role,
  UpdateLeadInput,
} from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { LeadsService } from './leads.service';

@Controller('leads')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
export class LeadsController {
  constructor(private readonly svc: LeadsService) {}

  @Post()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateLeadInput)) body: CreateLeadInput,
    @Query(new ZodValidationPipe(CreateLeadQuery)) q: CreateLeadQuery,
  ) {
    return { data: await this.svc.create(user, body, q.force) };
  }

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  list(@Query(new ZodValidationPipe(ListLeadsQuery)) q: ListLeadsQuery) {
    return this.svc.list(q);
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async get(@Param('id') id: string) {
    return { data: await this.svc.get(id) };
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateLeadInput)) body: UpdateLeadInput) {
    return { data: await this.svc.update(id, body) };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CancelLeadInput)) body: CancelLeadInput,
  ) {
    return { data: await this.svc.cancel(user, id, body) };
  }
}
