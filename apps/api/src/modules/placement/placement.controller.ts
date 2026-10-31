import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  AddCandidatesInput,
  CreatePlacementTestInput,
  ListPlacementTestsQuery,
  PutPlacementResultsInput,
  Role,
  UpdatePlacementTestInput,
} from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlacementService } from './placement.service';

@Controller('placement-tests')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
export class PlacementController {
  constructor(private readonly svc: PlacementService) {}

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER)
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(ListPlacementTestsQuery)) q: ListPlacementTestsQuery) {
    return this.svc.list(user, q);
  }

  @Post()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreatePlacementTestInput)) body: CreatePlacementTestInput,
  ) {
    return { data: await this.svc.create(user, body) };
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER)
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.get(user, id) };
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePlacementTestInput)) body: UpdatePlacementTestInput,
  ) {
    return { data: await this.svc.update(user, id, body) };
  }

  @Post(':id/candidates')
  @HttpCode(200)
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async addCandidates(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AddCandidatesInput)) body: AddCandidatesInput,
  ) {
    return { data: await this.svc.addCandidates(user, id, body) };
  }

  @Put(':id/results')
  @Roles(Role.TEACHER)
  async putResults(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PutPlacementResultsInput)) body: PutPlacementResultsInput,
  ) {
    return { data: await this.svc.putResults(user, id, body) };
  }
}
