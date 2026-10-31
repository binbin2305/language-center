import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CreateAssessmentInput, Role, UpdateAssessmentInput } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { GradesService } from './grades.service';

/** Full paths on the handlers: it serves both `classes/:id/assessments` and `assessments/:id`. */
@Controller()
@Roles(Role.ACADEMIC_STAFF)
export class AssessmentsController {
  constructor(private readonly svc: GradesService) {}

  @Get('classes/:id/assessments')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  async list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.list(id, user) };
  }

  @Post('classes/:id/assessments')
  @Roles(Role.TEACHER, Role.ACADEMIC_STAFF)
  async create(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateAssessmentInput)) input: CreateAssessmentInput,
  ) {
    return { data: await this.svc.create(id, input, user) };
  }

  @Patch('assessments/:id')
  @Roles(Role.TEACHER, Role.ACADEMIC_STAFF)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateAssessmentInput)) input: UpdateAssessmentInput,
  ) {
    return { data: await this.svc.update(id, input, user) };
  }

  @Delete('assessments/:id')
  @Roles(Role.TEACHER, Role.ACADEMIC_STAFF)
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.svc.remove(id, user);
  }
}
