import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AssignClassInput, ChangeEnrollmentCourseInput, CreateEnrollmentInput, ListEnrollmentsQuery, ListWaitingEnrollmentsQuery, Role, SkipPlacementInput, TransferEnrollmentInput, WithdrawEnrollmentInput } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AssignmentService } from './assignment.service';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
export class EnrollmentsController {
  constructor(
    private readonly svc: EnrollmentsService,
    private readonly assignment: AssignmentService,
  ) {}

  @Post()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.STUDENT)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateEnrollmentInput)) body: CreateEnrollmentInput,
  ) {
    return { data: await this.svc.create(user, body) };
  }

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  list(@Query(new ZodValidationPipe(ListEnrollmentsQuery)) q: ListEnrollmentsQuery) {
    return this.svc.list(q);
  }

  // Must be declared before ':id' routes.
  @Get('waiting')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  waiting(@Query(new ZodValidationPipe(ListWaitingEnrollmentsQuery)) q: ListWaitingEnrollmentsQuery) {
    return this.svc.waiting(q);
  }

  @Get('me')
  @Roles(Role.STUDENT)
  async me(@CurrentUser() user: AuthUser) {
    return { data: await this.svc.me(user) };
  }

  @Patch(':id/course')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.STUDENT)
  async changeCourse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ChangeEnrollmentCourseInput)) body: ChangeEnrollmentCourseInput,
  ) {
    return { data: await this.svc.changeCourse(user, id, body) };
  }

  @Post(':id/skip-placement')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async skipPlacement(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SkipPlacementInput)) body: SkipPlacementInput,
  ) {
    return { data: await this.svc.toDto(await this.svc.skipPlacement(id, body, user)) };
  }

  @Post(':id/assign')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AssignClassInput)) body: AssignClassInput,
  ) {
    return { data: await this.assignment.assign(id, body, user) };
  }

  @Post(':id/transfer')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async transfer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(TransferEnrollmentInput)) body: TransferEnrollmentInput,
  ) {
    return { data: await this.assignment.transfer(id, body, user) };
  }

  @Post(':id/withdraw')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async withdraw(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(WithdrawEnrollmentInput)) body: WithdrawEnrollmentInput,
  ) {
    return { data: await this.svc.withdraw(id, body, user) };
  }

  @Post(':id/resume')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async resume(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.resume(id, user) };
  }

  @Post(':id/confirm')
  @Roles(Role.STUDENT)
  async confirm(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.confirm(user, id) };
  }
}
