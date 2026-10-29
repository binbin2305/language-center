import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateClassInput, Role, UpdateClassInput } from '@lc/shared';
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
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CreateClassInput)) input: CreateClassInput) {
    return { data: await this.svc.create(input, user) };
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async get(@Param('id') id: string) {
    return { data: await this.svc.get(id) };
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
}
