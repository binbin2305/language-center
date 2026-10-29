import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ALL_ROLES, can, type UserDto } from '@lc/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/use-auth';
import { errorMessage } from '@/lib/error-messages';
import { NativeSelect } from '@/features/settings/components/native-select';
import { TempPasswordDialog } from '../components/temp-password-dialog';
import { UserFormDialog } from '../components/user-form-dialog';
import { useLockUser, useResetPassword, useUnlockUser, useUsers } from '../hooks';
import { ROLE_LABELS, USER_STATUS_LABELS } from '../roles';

const LIMIT = 20;
type Action = { kind: 'lock' | 'unlock' | 'reset'; user: UserDto };

const STATUS_CLASS: Record<UserDto['status'], string> = {
  ACTIVE: 'border-transparent bg-success/15 text-success',
  LOCKED: 'border-transparent bg-destructive/15 text-destructive',
  DISABLED: 'border-transparent bg-muted text-muted-foreground',
};

const COPY = {
  lock: { title: 'Khóa tài khoản', confirm: 'Khóa tài khoản', destructive: true,
    text: (u: UserDto) => `${u.fullName} sẽ không đăng nhập được cho đến khi bạn mở khóa.` },
  unlock: { title: 'Mở khóa tài khoản', confirm: 'Mở khóa', destructive: false,
    text: (u: UserDto) => `${u.fullName} sẽ đăng nhập lại được bình thường.` },
  reset: { title: 'Đặt lại mật khẩu', confirm: 'Đặt lại mật khẩu', destructive: false,
    text: (u: UserDto) => `Tạo mật khẩu tạm mới cho ${u.fullName}. Mật khẩu cũ không dùng được nữa.` },
} as const;

export default function UsersPage() {
  const { user: me } = useAuth();
  const canManage = can(me, 'users.manage');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [temp, setTemp] = useState<{ password: string; name: string } | null>(null);
  const list = useUsers({
    page, limit: LIMIT, q: q || undefined,
    role: (role || undefined) as UserDto['role'] | undefined,
    status: (status || undefined) as UserDto['status'] | undefined,
  });
  const lock = useLockUser();
  const unlock = useUnlockUser();
  const reset = useResetPassword();
  const pending = lock.isPending || unlock.isPending || reset.isPending;

  // Self actions are rejected by the API; a manager cannot act on an admin account.
  const actionable = (u: UserDto) =>
    canManage && u.id !== me?.id && !(me?.role === 'MANAGER' && u.role === 'ADMIN');

  const run = async () => {
    if (!action) return;
    const { kind, user } = action;
    try {
      if (kind === 'lock') {
        await lock.mutateAsync(user.id);
        toast.success(`Đã khóa tài khoản ${user.fullName}`);
      } else if (kind === 'unlock') {
        await unlock.mutateAsync(user.id);
        toast.success(`Đã mở khóa tài khoản ${user.fullName}`);
      } else {
        const r = await reset.mutateAsync(user.id);
        setTemp({ password: r.tempPassword, name: user.fullName });
      }
      setAction(null);
    } catch (e) {
      toast.error(errorMessage(e));
      setAction(null);
    }
  };

  const columns = useMemo<ColumnDef<UserDto>[]>(
    () => [
      { accessorKey: 'fullName', header: 'Họ tên' },
      { id: 'email', header: 'Email', meta: { hideOnMobile: true }, cell: ({ row }) => row.original.email ?? row.original.username },
      { id: 'role', header: 'Vai trò', cell: ({ row }) => ROLE_LABELS[row.original.role] },
      {
        id: 'status', header: 'Trạng thái',
        cell: ({ row }) => (
          <Badge variant="outline" className={STATUS_CLASS[row.original.status]}>
            {USER_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Thao tác</span>,
        cell: ({ row }) => {
          const u = row.original;
          if (!actionable(u)) return null;
          return (
            <div className="flex flex-wrap justify-end gap-1">
              {u.status === 'ACTIVE' ? (
                <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'lock', user: u })}>Khóa</Button>
              ) : null}
              {u.status === 'LOCKED' ? (
                <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'unlock', user: u })}>Mở khóa</Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'reset', user: u })}>Đặt lại mật khẩu</Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, me?.id, me?.role],
  );

  return (
    <div>
      <PageHeader
        title="Tài khoản"
        description="Quản lý tài khoản nhân sự: tạo mới, khóa/mở khóa và đặt lại mật khẩu."
        actions={canManage ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Thêm tài khoản
          </Button>
        ) : undefined}
      />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Tìm theo tên hoặc email" aria-label="Tìm tài khoản" className="w-64" />
        <NativeSelect aria-label="Lọc theo vai trò" className="w-44" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">Mọi vai trò</option>
          {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Lọc theo trạng thái" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Mọi trạng thái</option>
          {(Object.keys(USER_STATUS_LABELS) as UserDto['status'][]).map((s) => (
            <option key={s} value={s}>{USER_STATUS_LABELS[s]}</option>
          ))}
        </NativeSelect>
      </FilterBar>
      <DataTable
        columns={columns}
        data={list.data?.data ?? []}
        total={list.data?.meta.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        isLoading={list.isPending}
        isError={list.isError}
        onRetry={() => list.refetch()}
        getRowId={(u) => u.id}
        empty={{ title: 'Chưa có tài khoản nào', description: 'Thử đổi bộ lọc hoặc thêm tài khoản mới.' }}
      />
      <UserFormDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(r) => setTemp({ password: r.tempPassword, name: r.user.fullName })}
      />
      {action ? (
        <ConfirmDialog
          open
          onOpenChange={(o) => { if (!o) setAction(null); }}
          title={COPY[action.kind].title}
          description={COPY[action.kind].text(action.user)}
          confirmLabel={COPY[action.kind].confirm}
          destructive={COPY[action.kind].destructive}
          isPending={pending}
          onConfirm={run}
        />
      ) : null}
      <TempPasswordDialog tempPassword={temp?.password ?? null} accountName={temp?.name ?? ''} onClose={() => setTemp(null)} />
    </div>
  );
}
