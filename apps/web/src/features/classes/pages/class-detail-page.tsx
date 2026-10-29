import { lazy, Suspense, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { can } from '@lc/shared';
import { CapacityBar } from '@/components/common/capacity-bar';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ErrorState } from '@/components/common/error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/auth/use-auth';
import { TabbedDetail } from '@/layouts/tabbed-detail';
import { CLASS_TABS } from '@/layouts/tab-slots';
import { errorMessage } from '@/lib/error-messages';
import { formatDate } from '@/lib/format';
import { toast } from 'sonner';
import { DeleteClassDialog } from '../components/delete-class-dialog';
import { useClass, useDeactivateClass, useRoomOptions } from '../hooks';

const ClassFormDialog = lazy(() =>
  import('../components/class-form-dialog').then((m) => ({ default: m.ClassFormDialog })),
);

type Dialog = 'edit' | 'deactivate' | 'delete' | null;

export default function ClassDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);
  const cls = useClass(id);
  const rooms = useRoomOptions();
  const deactivate = useDeactivateClass();
  const manage = can(user, 'classes.manage');
  const c = cls.data;

  const room = c?.defaultRoomId ? rooms.data?.find((r) => r.id === c.defaultRoomId) : undefined;

  const header = cls.isError ? (
    <ErrorState description={errorMessage(cls.error)} onRetry={() => void cls.refetch()} />
  ) : !c ? (
    <Skeleton className="mt-2 h-12 w-full" />
  ) : (
    <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Mã lớp</dt>
          <dd className="font-medium">{c.code}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Giáo viên</dt>
          <dd>{c.teacherName ?? ''}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Phòng</dt>
          <dd>{room ? `${room.code} - ${room.name}` : 'Chưa chọn'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Thời gian</dt>
          <dd>{`${formatDate(c.startDate)} - ${formatDate(c.endDate)}`}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sĩ số</dt>
          <dd>
            <CapacityBar current={c.currentSize} max={c.maxCapacity} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Trạng thái</dt>
          <dd>
            <StatusBadge group="class" value={c.status} />
          </dd>
        </div>
      </dl>
      {manage ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Tùy chọn lớp">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDialog('edit')}>Sửa</DropdownMenuItem>
            {c.status !== 'INACTIVE' ? (
              <DropdownMenuItem onSelect={() => setDialog('deactivate')}>Ngừng hoạt động</DropdownMenuItem>
            ) : null}
            <DropdownMenuItem className="text-destructive" onSelect={() => setDialog('delete')}>
              Xóa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );

  return (
    <>
      <TabbedDetail title={c?.name ?? 'Chi tiết lớp'} header={header} tabs={CLASS_TABS} />
      {c && dialog === 'edit' ? (
        <Suspense fallback={null}>
          <ClassFormDialog open onOpenChange={(o) => !o && setDialog(null)} cls={c} />
        </Suspense>
      ) : null}
      {c ? (
        <>
          <ConfirmDialog
            open={dialog === 'deactivate'}
            onOpenChange={(o) => !o && setDialog(null)}
            title="Ngừng hoạt động lớp"
            description={`Lớp ${c.name} sẽ chuyển sang Ngừng hoạt động. Lịch sử học viên được giữ nguyên.`}
            confirmLabel="Ngừng hoạt động"
            isPending={deactivate.isPending}
            onConfirm={() =>
              deactivate.mutate(c.id, {
                onSuccess: () => {
                  toast.success('Đã chuyển lớp sang Ngừng hoạt động');
                  setDialog(null);
                },
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          />
          <DeleteClassDialog
            classId={c.id}
            className={c.name}
            open={dialog === 'delete'}
            onOpenChange={(o) => !o && setDialog(null)}
            onDeleted={() => navigate('/classes', { replace: true })}
          />
        </>
      ) : null}
    </>
  );
}
