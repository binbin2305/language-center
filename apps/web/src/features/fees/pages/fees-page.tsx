import { useState } from 'react';
import { Link } from 'react-router-dom';
import { can, ALL_INVOICE_STATUSES } from '@lc/shared';
import { EntitySelect } from '@/components/common/entity-select';
import { FilterBar } from '@/components/common/filter-bar';
import { DateRangePicker, type DateRangeValue } from '@/components/common/date-range-picker';
import { OptionSelect } from '@/components/common/option-select';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/auth/use-auth';
import { statusLabel } from '@/lib/status';
import type { InvoiceListParams } from '../api';
import { InvoiceTable } from '../components/invoice-table';

export default function FeesPage() {
  const { user } = useAuth();
  // Student/class/date filters are staff tools; teachers only get status + overdue.
  const staff = can(user, 'fees.update');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [range, setRange] = useState<DateRangeValue>({ from: null, to: null });
  const filters: InvoiceListParams = {
    studentId: studentId ?? undefined,
    classId: classId ?? undefined,
    status: (status || undefined) as InvoiceListParams['status'],
    overdue: overdue || undefined,
    from: range.from ?? undefined,
    to: range.to ?? undefined,
  };
  const key = JSON.stringify(filters);

  return (
    <div>
      <PageHeader
        title="Học phí"
        actions={
          can(user, 'discounts.decide') ? (
            <Button asChild variant="outline"><Link to="/fees/discounts">Duyệt giảm giá</Link></Button>
          ) : null
        }
      />
      <FilterBar>
        {staff ? (
          <>
            <div className="w-56"><EntitySelect entity="student" value={studentId} onChange={setStudentId} placeholder="Học viên" aria-label="Lọc theo học viên" /></div>
            <div className="w-56"><EntitySelect entity="class" value={classId} onChange={setClassId} placeholder="Lớp" aria-label="Lọc theo lớp" /></div>
            <DateRangePicker value={range} onChange={setRange} aria-label="Khoảng thời gian" />
          </>
        ) : null}
        <OptionSelect
          value={status}
          onValueChange={setStatus}
          allLabel="Tất cả trạng thái"
          aria-label="Lọc theo trạng thái"
          className="w-52"
          options={ALL_INVOICE_STATUSES.map((s) => ({ value: s, label: statusLabel('invoice', s) }))}
        />
        <div className="flex items-center gap-2">
          <Checkbox id="f-overdue" checked={overdue} onCheckedChange={(v) => setOverdue(v === true)} />
          <Label htmlFor="f-overdue">Quá hạn</Label>
        </div>
      </FilterBar>
      <InvoiceTable key={key} filters={filters} />
    </div>
  );
}
