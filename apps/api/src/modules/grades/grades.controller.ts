import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Role, UpsertGradesInput } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { GradesService } from './grades.service';

@Controller('assessments')
@Roles(Role.TEACHER)
export class GradesController {
  constructor(private readonly svc: GradesService) {}

  @Get(':id/grades')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.getGrades(id, user) };
  }

  @Put(':id/grades')
  @Roles(Role.TEACHER)
  async put(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpsertGradesInput)) input: UpsertGradesInput,
  ) {
    return { data: await this.svc.upsertGrades(id, input, user) };
  }
}
