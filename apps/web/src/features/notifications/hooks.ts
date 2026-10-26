import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type NotificationListParams } from './api';

const KEY = 'notifications';

export const useNotifications = (params: NotificationListParams, enabled = true) =>
  useQuery({
    queryKey: [KEY, 'list', params],
    queryFn: () => notificationsApi.list(params),
    enabled,
  });

export const useUnreadCount = () =>
  useQuery({
    queryKey: [KEY, 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    refetchInterval: 60_000,
    select: (d) => d.count,
  });

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
