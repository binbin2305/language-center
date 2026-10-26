import type { ListNotificationsQuery, NotificationDto, UnreadCountDto } from '@lc/shared';
import { apiGet, apiGetPage, apiPost } from '@/lib/api';

export type NotificationListParams = Partial<Pick<ListNotificationsQuery, 'page' | 'limit' | 'type'>> & {
  unread?: boolean;
};

export const notificationsApi = {
  list: (params: NotificationListParams) =>
    apiGetPage<NotificationDto>('notifications', params),
  unreadCount: () => apiGet<UnreadCountDto>('notifications/unread-count'),
  markRead: (id: string) => apiPost<NotificationDto>(`notifications/${id}/read`),
  markAllRead: () => apiPost<{ ok: boolean }>('notifications/read-all'),
};
