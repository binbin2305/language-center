import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationRefType, NotificationType } from '@lc/shared';
import { Models } from '../../database/models';
import { Notification } from '../../database/schemas/notification.schema';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  refType?: NotificationRefType;
  refId?: Types.ObjectId;
}

@Injectable()
export class NotificationsService {
  constructor(@InjectModel(Models.Notification) private readonly notifications: Model<Notification>) {}

  async notify(userIds: Types.ObjectId[], n: NotificationInput): Promise<void> {
    const unique = [...new Set(userIds.map(String))].map((id) => new Types.ObjectId(id));
    if (unique.length === 0) return;
    await this.notifications.insertMany(unique.map((userId) => ({ ...n, userId, readAt: null })));
  }
}
