import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListStudentsQuery, Role } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StudentsService } from './students.service';

@Controller('students')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER)
export class StudentsController {
  constructor(private readonly svc: StudentsService) {}

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER)
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(ListStudentsQuery)) q: ListStudentsQuery) {
    return this.svc.list(user, q);
  }

  // Must be declared before ':id'.
  @Get('me')
  @Roles(Role.STUDENT)
  async me(@CurrentUser() user: AuthUser) {
    return { data: await this.svc.me(user) };
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.get(user, id) };
  }
}
