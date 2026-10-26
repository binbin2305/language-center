import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_NOTIFICATION_REF_TYPES, ALL_NOTIFICATION_TYPES, NotificationRefType, NotificationType } from '@lc/shared';
import { Models } from '../models';
import { clockTimestamps } from './helpers';

export interface Notification {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  refType?: NotificationRefType;
  refId?: Types.ObjectId;
  readAt: Date | null;
}

export const NotificationSchema = new Schema<Notification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: Models.User, required: true },
    type: { type: String, enum: ALL_NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    refType: { type: String, enum: ALL_NOTIFICATION_REF_TYPES },
    refId: { type: Schema.Types.ObjectId },
    readAt: { type: Date, default: null },
  },
  { timestamps: clockTimestamps, collection: 'notifications' },
);
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export type NotificationDoc = HydratedDocument<Notification>;
