import {
  CallHandler,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  NestInterceptor,
  Param,
  PayloadTooLargeException,
  Post,
  Res,
  StreamableFile,
  Type,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { ErrorCode, Role, StudentDocumentDto } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AppError } from '../../common/errors/app-error';
import { DocumentsService, MAX_DOCUMENT_BYTES, UploadedFile as UploadedFileData } from './documents.service';

// defParamCharset: browsers send UTF-8 filenames; multer would otherwise decode them as latin1.
const Base = FileInterceptor('file', {
  storage: memoryStorage(),
  defParamCharset: 'utf8',
  limits: { fileSize: MAX_DOCUMENT_BYTES + 1, files: 1, fields: 10 },
}) as Type<NestInterceptor>;

/** FileInterceptor that reports an oversize upload with our FILE_TOO_LARGE code. */
@Injectable()
class StudentFileInterceptor extends Base {
  override async intercept(ctx: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(ctx, next);
    } catch (e) {
      if (e instanceof PayloadTooLargeException) throw new AppError(ErrorCode.FILE_TOO_LARGE);
      throw e;
    }
  }
}

@Controller('students')
@Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Post(':id/documents')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  @UseInterceptors(StudentFileInterceptor)
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileData | undefined,
  ): Promise<{ data: StudentDocumentDto }> {
    return { data: await this.svc.upload(user, id, file) };
  }

  @Get(':id/documents/:docId')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async download(@Param('id') id: string, @Param('docId') docId: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.svc.open(id, docId);
    res.set({
      'Content-Type': f.mimeType,
      'Content-Length': String(f.size),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
    });
    return new StreamableFile(f.stream);
  }

  @Delete(':id/documents/:docId')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('docId') docId: string): Promise<void> {
    await this.svc.remove(user, id, docId);
  }
}
