import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ListResultsQuery, Role, TranscriptQuery } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ResultsService } from './results.service';

@Controller('results')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
export class ResultsController {
  constructor(private readonly svc: ResultsService) {}

  @Get()
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT)
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(ListResultsQuery)) q: ListResultsQuery) {
    return this.svc.list(q, user);
  }

  @Get('transcript.pdf')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF, Role.STUDENT)
  async transcript(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(TranscriptQuery)) q: TranscriptQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.svc.transcript(q, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }
}
