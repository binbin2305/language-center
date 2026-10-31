import { useNavigate } from 'react-router-dom';
import type { NotificationDto } from '@lc/shared';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/auth/use-auth';
import { useMarkRead } from '../hooks';
import { notificationTarget } from '../notification-target';

/** One row; click marks it read and navigates when the target is known. */
export function NotificationItem({
  notification: n,
  onNavigate,
}: {
  notification: NotificationDto;
  onNavigate?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const markRead = useMarkRead();
  const unread = n.readAt === null;

  const open = () => {
    if (unread) markRead.mutate(n.id);
    const target = user ? notificationTarget(n.refType, n.refId, user.role, n.type) : null;
    if (target) {
      onNavigate?.();
      navigate(target);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        'flex w-full gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
        unread && 'bg-primary/5',
      )}
    >
      <span
        aria-hidden
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', unread && 'font-semibold')}>{n.title}</span>
        <span className="block text-sm text-muted-foreground">{n.body}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
      </span>
      {unread && <span className="sr-only">Chưa đọc</span>}
    </button>
  );
}
