import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { can, type SessionDto } from '@lc/shared';
import { useAuth } from '@/auth/use-auth';
import { EntitySelect } from '@/components/common/entity-select';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { ScheduleCalendar, type SessionFilters } from '../components/schedule-calendar';
import { SessionDetailSheet } from '../components/session-detail-sheet';
import { SessionFormDialog } from '../components/session-form-dialog';

export default function SchedulePage() {
  const { user } = useAuth();
  const manage = can(user, 'sessions.manage');
  const [params] = useSearchParams();
  const [filters, setFilters] = useState<SessionFilters>({});
  const [selected, setSelected] = useState<SessionDto | null>(null);
  const [creating, setCreating] = useState(false);
  const setFilter = (key: keyof SessionFilters) => (id: string | null) =>
    setFilters((f) => ({ ...f, [key]: id ?? undefined }));

  return (
    <div>
      <PageHeader
        title="Lịch học"
        actions={
          manage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Tạo lịch
            </Button>
          ) : null
        }
      />
      {manage ? (
        <FilterBar>
          <div className="w-48"><EntitySelect entity="class" aria-label="Lọc theo lớp" placeholder="Tất cả lớp" value={filters.classId ?? null} onChange={setFilter('classId')} /></div>
          <div className="w-48"><EntitySelect entity="teacher" aria-label="Lọc theo giáo viên" placeholder="Tất cả giáo viên" value={filters.teacherId ?? null} onChange={setFilter('teacherId')} /></div>
          <div className="w-48"><EntitySelect entity="room" aria-label="Lọc theo phòng" placeholder="Tất cả phòng" value={filters.roomId ?? null} onChange={setFilter('roomId')} /></div>
          {filters.classId || filters.teacherId || filters.roomId ? (
            <Button variant="ghost" onClick={() => setFilters({})}>Xóa lọc</Button>
          ) : null}
        </FilterBar>
      ) : null}
      <ScheduleCalendar filters={filters} initialDate={params.get('date') ?? undefined} onSelectSession={setSelected} />
      <SessionDetailSheet session={selected} onClose={() => setSelected(null)} />
      {manage ? <SessionFormDialog open={creating} onOpenChange={setCreating} /> : null}
    </div>
  );
}
