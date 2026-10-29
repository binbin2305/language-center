import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateRoomInput, ListRoomsQuery, Role, UpdateRoomInput } from '@lc/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RoomsService } from './rooms.service';

@Controller('rooms')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
export class RoomsController {
  constructor(private readonly svc: RoomsService) {}

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  list(@Query(new ZodValidationPipe(ListRoomsQuery)) q: ListRoomsQuery) {
    return this.svc.list(q);
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async get(@Param('id') id: string) {
    return { data: await this.svc.get(id) };
  }

  @Post()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async create(@Body(new ZodValidationPipe(CreateRoomInput)) body: CreateRoomInput) {
    return { data: await this.svc.create(body) };
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateRoomInput)) body: UpdateRoomInput) {
    return { data: await this.svc.update(id, body) };
  }
}
