import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ListStudentsQuery, Role, StudentAuditQuery, UpdateStudentContactInput, UpdateStudentInput } from '@lc/shared';
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

  // Must be declared before ':id'.
  @Patch('me/contact')
  @Roles(Role.STUDENT)
  async updateContact(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdateStudentContactInput)) body: UpdateStudentContactInput,
  ) {
    return { data: await this.svc.updateContact(user, body) };
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStudentInput)) body: UpdateStudentInput,
  ) {
    return { data: await this.svc.update(user, id, body) };
  }

  @Get(':id/audit')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  audit(@Param('id') id: string, @Query(new ZodValidationPipe(StudentAuditQuery)) q: StudentAuditQuery) {
    return this.svc.auditTrail(id, q);
  }
}
