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
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/use-auth';
import { errorMessage } from '@/lib/error-messages';
import { CatalogStatusBadge, catalogStatusLabel, OptionSelect } from '@/features/settings/catalog-shared';
import { TempPasswordDialog } from '../components/temp-password-dialog';
import { UserFormDialog } from '../components/user-form-dialog';
import { useLockUser, useResetPassword, useUnlockUser, useUsers } from '../hooks';
import { canActOnUser } from '../can-act-on-user';
import { ROLE_LABELS } from '../roles';

const LIMIT = 20;
type Action = { kind: 'lock' | 'unlock' | 'reset'; user: UserDto };

const STATUS_OPTIONS = (['ACTIVE', 'LOCKED', 'DISABLED'] as const).map((s) => ({ value: s, label: catalogStatusLabel(s) }));
const ROLE_OPTIONS = ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

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
        cell: ({ row }) => <CatalogStatusBadge value={row.original.status} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Thao tác</span>,
        cell: ({ row }) => {
          const u = row.original;
          if (!canActOnUser(me, u)) return null;
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
    [me],
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
        <OptionSelect aria-label="Lọc theo vai trò" className="w-44" allLabel="Mọi vai trò" options={ROLE_OPTIONS} value={role} onValueChange={(v) => { setRole(v); setPage(1); }} />
        <OptionSelect aria-label="Lọc theo trạng thái" className="w-44" allLabel="Mọi trạng thái" options={STATUS_OPTIONS} value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} />
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
