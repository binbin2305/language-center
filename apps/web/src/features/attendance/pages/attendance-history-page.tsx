import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { EntitySelect } from '@/components/common/entity-select';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QueryFrame } from '../components/summary-view';
import { RecordsList } from '../components/records-list';
import { SummaryTable } from '../components/summary-table';
import { useAttendanceRecords, useAttendanceSummary } from '../hooks';

export default function AttendanceHistoryPage() {
  const [classId, setClassId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<{ key: string; label: string } | null>(null);
  const filters = { ...(classId ? { classId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const summary = useAttendanceSummary({ groupBy: 'student', ...filters });
  const records = useAttendanceRecords({ ...filters, studentId: selected?.key }, Boolean(selected));

  return (
    <>
      <PageHeader title="Lịch sử điểm danh" />
      <FilterBar>
        <div className="w-64">
          <EntitySelect
            entity="class"
            aria-label="Lớp"
            placeholder="Tất cả lớp"
            value={classId}
            onChange={(id) => {
              setClassId(id);
              setSelected(null);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="att-from">Từ ngày</Label>
          <Input id="att-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="att-to">Đến ngày</Label>
          <Input id="att-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </FilterBar>
      <QueryFrame query={summary} isEmpty={summary.data?.length === 0}>
        <SummaryTable
          labelHeader="Học viên"
          rows={summary.data ?? []}
          selectedKey={selected?.key}
          onSelect={(r) => setSelected({ key: r.key, label: r.label })}
        />
      </QueryFrame>
      {selected ? (
        <section className="mt-6 space-y-2">
          <h2 className="text-lg font-semibold">{`Các buổi của ${selected.label}`}</h2>
          {records.data?.length === 0 ? (
            <EmptyState title="Chưa có dữ liệu điểm danh" />
          ) : (
            <RecordsList label={`Các buổi của ${selected.label}`} records={records.data ?? []} />
          )}
        </section>
      ) : null}
    </>
  );
}
