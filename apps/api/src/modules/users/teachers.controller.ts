import { Controller, Get } from '@nestjs/common';
import { Role } from '@lc/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { UsersService } from './users.service';

@Controller('teachers')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
export class TeachersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async list() {
    return { data: await this.svc.listTeacherOptions() };
  }
}
