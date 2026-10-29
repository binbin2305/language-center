import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateUserInput, ListUsersQuery, Role, UpdateUserInput } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@Controller('users')
@Roles(Role.ADMIN, Role.MANAGER)
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  list(@Query(new ZodValidationPipe(ListUsersQuery)) q: ListUsersQuery) {
    return this.svc.list(q);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  async get(@Param('id') id: string) {
    return { data: await this.svc.get(id) };
  }

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  async create(@Body(new ZodValidationPipe(CreateUserInput)) body: CreateUserInput, @CurrentUser() actor: AuthUser) {
    return { data: await this.svc.createAccount(body, actor) };
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserInput)) body: UpdateUserInput,
    @CurrentUser() actor: AuthUser,
  ) {
    return { data: await this.svc.update(id, body, actor) };
  }

  @Post(':id/lock')
  @Roles(Role.ADMIN, Role.MANAGER)
  async lock(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return { data: await this.svc.lock(id, actor) };
  }

  @Post(':id/unlock')
  @Roles(Role.ADMIN, Role.MANAGER)
  async unlock(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return { data: await this.svc.unlock(id, actor) };
  }

  @Post(':id/reset-password')
  @Roles(Role.ADMIN, Role.MANAGER)
  async resetPassword(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return { data: await this.svc.resetPassword(id, actor) };
  }
}
