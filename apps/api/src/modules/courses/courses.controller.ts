import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ALL_ROLES, CreateCourseInput, ListCoursesQuery, Role, UpdateCourseInput } from '@lc/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CoursesService } from './courses.service';

@Controller('courses')
@Roles(...ALL_ROLES)
export class CoursesController {
  constructor(private readonly svc: CoursesService) {}

  @Get()
  @Roles(...ALL_ROLES)
  list(@Query(new ZodValidationPipe(ListCoursesQuery)) q: ListCoursesQuery) {
    return this.svc.list(q);
  }

  @Get(':id')
  @Roles(...ALL_ROLES)
  async get(@Param('id') id: string) {
    return { data: await this.svc.get(id) };
  }

  @Post()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async create(@Body(new ZodValidationPipe(CreateCourseInput)) body: CreateCourseInput) {
    return { data: await this.svc.create(body) };
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateCourseInput)) body: UpdateCourseInput) {
    return { data: await this.svc.update(id, body) };
  }
}
