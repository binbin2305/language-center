import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import { ErrorCode, ListNotificationsQuery, NotificationDto } from '@lc/shared';
import { ClockService } from '../../common/clock/clock.service';
import { AppError } from '../../common/errors/app-error';
import { paginate } from '../../common/pagination';
import { Models } from '../../database/models';
import { Notification } from '../../database/schemas/notification.schema';

type NotificationLean = Notification & { _id: Types.ObjectId; createdAt: Date };

const SORTS = new Set(['createdAt', '-createdAt']);

function toDto(n: NotificationLean): NotificationDto {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    body: n.body,
    refType: n.refType ?? null,
    refId: n.refId?.toString() ?? null,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

/** Read-side API for the current user's notifications (writes go through common NotificationsService). */
@Injectable()
export class NotificationsApiService {
  constructor(
    @InjectModel(Models.Notification) private readonly notifications: Model<Notification>,
    private readonly clock: ClockService,
  ) {}

  async list(userId: Types.ObjectId, q: ListNotificationsQuery) {
    const filter: FilterQuery<Notification> = { userId };
    if (q.unread === true) filter.readAt = null;
    if (q.unread === false) filter.readAt = { $ne: null };
    if (q.type) filter.type = q.type;
    const page = await paginate(this.notifications, filter, {
      page: q.page,
      limit: q.limit,
      sort: q.sort && SORTS.has(q.sort) ? q.sort : '-createdAt',
    });
    return { data: (page.data as unknown as NotificationLean[]).map(toDto), meta: page.meta };
  }

  unreadCount(userId: Types.ObjectId): Promise<number> {
    return this.notifications.countDocuments({ userId, readAt: null });
  }

  /** 404 (never 403) when the notification does not exist or belongs to someone else. */
  async markRead(userId: Types.ObjectId, id: string): Promise<NotificationDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const _id = new Types.ObjectId(id);
    await this.notifications.updateOne({ _id, userId, readAt: null }, { $set: { readAt: this.clock.now() } });
    const n = await this.notifications.findOne({ _id, userId }).lean();
    if (!n) throw new AppError(ErrorCode.NOT_FOUND);
    return toDto(n as unknown as NotificationLean);
  }

  async markAllRead(userId: Types.ObjectId): Promise<void> {
    await this.notifications.updateMany({ userId, readAt: null }, { $set: { readAt: this.clock.now() } });
  }
}
