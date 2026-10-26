import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotifications, useUnreadCount } from '../hooks';
import { NotificationItem } from './notification-item';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: count = 0 } = useUnreadCount();
  const list = useNotifications({ page: 1, limit: 10 }, open);
  const label = count > 0 ? `Thông báo, ${count} chưa đọc` : 'Thông báo';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className="relative">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">Thông báo</div>
        <div className="max-h-96 overflow-y-auto">
          {list.isPending && (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {list.isError && (
            <div className="p-4 text-sm">
              Không tải được thông báo.{' '}
              <button className="underline" onClick={() => list.refetch()}>
                Thử lại
              </button>
            </div>
          )}
          {list.data?.data.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Chưa có thông báo nào</p>
          )}
          {list.data?.data.map((n) => (
            <NotificationItem key={n.id} notification={n} onNavigate={() => setOpen(false)} />
          ))}
        </div>
        <div className="border-t p-2 text-center">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Xem tất cả
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
