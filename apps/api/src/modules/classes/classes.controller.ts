import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ClassRosterQuery,
  CreateClassInput,
  ListClassesQuery,
  Role,
  UpdateClassInput,
} from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ClassesService } from './classes.service';

@Controller('classes')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
export class ClassesController {
  constructor(private readonly svc: ClassesService) {}

  @Post()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateClassInput)) input: CreateClassInput,
  ) {
    return { data: await this.svc.create(input, user) };
  }

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ListClassesQuery)) q: ListClassesQuery,
  ) {
    return this.svc.list(q, user);
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.get(id, user) };
  }

  @Get(':id/students')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER)
  roster(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(ClassRosterQuery)) q: ClassRosterQuery,
  ) {
    return this.svc.roster(id, q, user);
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateClassInput)) input: UpdateClassInput,
  ) {
    return { data: await this.svc.update(id, input, user) };
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async deactivate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.deactivate(id, user) };
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.svc.remove(id, user);
  }
}
