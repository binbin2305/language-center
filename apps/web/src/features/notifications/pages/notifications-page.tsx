import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/error-messages';
import { NotificationItem } from '../components/notification-item';
import { useMarkAllRead, useNotifications } from '../hooks';

const LIMIT = 20;

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const list = useNotifications({ page, limit: LIMIT, ...(unreadOnly ? { unread: true } : {}) });
  const markAll = useMarkAllRead();
  const total = list.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Thông báo</h1>
        <Button variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
          <CheckCheck className="mr-2 h-4 w-4" />
          Đánh dấu tất cả đã đọc
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="unread-only"
          checked={unreadOnly}
          onCheckedChange={(v) => {
            setUnreadOnly(v === true);
            setPage(1);
          }}
        />
        <Label htmlFor="unread-only">Chỉ hiện chưa đọc</Label>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {list.isPending && (
          <div className="space-y-3 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {list.isError && (
          <div className="space-y-2 p-6 text-center">
            <p className="text-sm">{errorMessage(list.error)}</p>
            <Button variant="outline" onClick={() => list.refetch()}>
              Thử lại
            </Button>
          </div>
        )}
        {list.data?.data.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">Chưa có thông báo nào</p>
        )}
        {list.data?.data.map((n) => <NotificationItem key={n.id} notification={n} />)}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </Button>
          <span>
            {page}/{pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}
