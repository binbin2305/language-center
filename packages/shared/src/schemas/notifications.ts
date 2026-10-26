import { z } from 'zod';
import { NotificationType } from '../enums';
import { zBoolQuery, zDateTime, zObjectId, zPagination } from './common';

export const ListNotificationsQuery = zPagination.extend({
  unread: zBoolQuery.optional(),
  type: z.nativeEnum(NotificationType).optional(),
});
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuery>;

export const NotificationDto = z.object({
  id: zObjectId,
  type: z.nativeEnum(NotificationType),
  title: z.string(),
  body: z.string(),
  refType: z.string().nullish(),
  refId: zObjectId.nullish(),
  readAt: zDateTime.nullable(),
  createdAt: zDateTime,
});
export type NotificationDto = z.infer<typeof NotificationDto>;

export const UnreadCountDto = z.object({ count: z.number().int().nonnegative() });
export type UnreadCountDto = z.infer<typeof UnreadCountDto>;
