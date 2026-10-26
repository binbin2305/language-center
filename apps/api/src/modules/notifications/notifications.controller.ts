import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ALL_ROLES, ListNotificationsQuery } from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NotificationsApiService } from './notifications-api.service';

@Controller('notifications')
@Roles(...ALL_ROLES)
export class NotificationsController {
  constructor(private readonly svc: NotificationsApiService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(ListNotificationsQuery)) q: ListNotificationsQuery) {
    return this.svc.list(user.id, q);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { data: { count: await this.svc.unreadCount(user.id) } };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() user: AuthUser) {
    await this.svc.markAllRead(user.id);
    return { data: { ok: true } };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { data: await this.svc.markRead(user.id, id) };
  }
}
