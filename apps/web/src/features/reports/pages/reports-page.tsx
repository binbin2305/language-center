import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { can, type ReportTypeParam } from '@lc/shared';
import { toast } from 'sonner';
import { useAuth } from '@/auth/use-auth';
import { EntitySelect } from '@/components/common/entity-select';
import { FilterBar } from '@/components/common/filter-bar';
import { OptionSelect } from '@/components/common/option-select';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/error-messages';
import { reportsApi, type ReportParams } from '../api';
import { AcademicContent, AdmissionsContent, AttendanceContent, FinanceContent } from '../components/tabs-content';
import { useAcademicReport, useAdmissionsReport, useAttendanceReport, useFinanceReport } from '../hooks';
import { PRESETS, presetRange, type Preset } from '../range';

const TABS: { value: ReportTypeParam; label: string; course: boolean; cls: boolean; teacher?: boolean }[] = [
  { value: 'admissions', label: 'Tuyển sinh', course: true, cls: false },
  { value: 'attendance', label: 'Chuyên cần', course: true, cls: true },
  { value: 'academic', label: 'Học tập', course: true, cls: true, teacher: true },
  { value: 'finance', label: 'Tài chính', course: true, cls: true },
];

async function save(type: ReportTypeParam, format: 'xlsx' | 'pdf', p: ReportParams) {
  try {
    const blob = await reportsApi.download(type, format, p);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bao-cao-${type}-${p.from}_${p.to}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

export default function ReportsPage() {
  const { user } = useAuth();
  const allowed = can(user, 'reports.view');
  const [tab, setTab] = useState<ReportTypeParam>('admissions');
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [courseId, setCourseId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<'month' | 'course' | 'class'>('month');

  const range = preset === 'custom' ? custom : presetRange(preset, new Date());
  const rangeFilled = Boolean(range.from && range.to);
  const rangeInvalid = rangeFilled && range.to < range.from;
  const ready = rangeFilled && !rangeInvalid;
  const cfg = TABS.find((t) => t.value === tab)!;
  const params: ReportParams = {
    from: range.from,
    to: range.to,
    courseId: courseId ?? undefined,
    classId: cfg.cls ? classId ?? undefined : undefined,
    teacherId: cfg.teacher ? teacherId ?? undefined : undefined,
    groupBy: tab === 'finance' ? groupBy : undefined,
  };
  const on = allowed && ready;
  const admissions = useAdmissionsReport(params, on && tab === 'admissions');
  const attendance = useAttendanceReport(params, on && tab === 'attendance');
  const academic = useAcademicReport(params, on && tab === 'academic');
  const finance = useFinanceReport(params, on && tab === 'finance');

  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div>
      <PageHeader
        title="Báo cáo"
        actions={
          <>
            <Button variant="outline" disabled={!ready} onClick={() => void save(tab, 'xlsx', params)}>Xuất Excel</Button>
            <Button variant="outline" disabled={!ready} onClick={() => void save(tab, 'pdf', params)}>Xuất PDF</Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTypeParam)}>
        <TabsList className="h-auto flex-wrap">
          {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>
        <FilterBar>
          <div role="group" aria-label="Khoảng thời gian" className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <Button key={p.value} size="sm" variant={preset === p.value ? 'default' : 'outline'} aria-pressed={preset === p.value} onClick={() => setPreset(p.value)}>
                {p.label}
              </Button>
            ))}
          </div>
          {preset === 'custom' ? (
            <>
              <Input type="date" aria-label="Từ ngày" className="w-40" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              <Input type="date" aria-label="Đến ngày" className="w-40" aria-invalid={rangeInvalid ? true : undefined} aria-describedby={rangeInvalid ? 'range-error' : undefined} value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              {rangeInvalid ? <p id="range-error" className="w-full text-sm text-destructive">Ngày kết thúc phải sau hoặc bằng ngày bắt đầu</p> : null}
            </>
          ) : null}
          <div className="w-56"><EntitySelect entity="course" value={courseId} onChange={setCourseId} placeholder="Khóa học" aria-label="Lọc theo khóa học" /></div>
          {cfg.cls ? (
            <div className="w-56"><EntitySelect entity="class" value={classId} onChange={setClassId} placeholder="Lớp" aria-label="Lọc theo lớp" /></div>
          ) : null}
          {cfg.teacher ? (
            <div className="w-56"><EntitySelect entity="teacher" value={teacherId} onChange={setTeacherId} placeholder="Giáo viên" aria-label="Lọc theo giáo viên" /></div>
          ) : null}
          {tab === 'finance' ? (
            <OptionSelect
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as typeof groupBy)}
              aria-label="Nhóm theo"
              className="w-40"
              options={[{ value: 'month', label: 'Theo tháng' }, { value: 'course', label: 'Theo khóa' }, { value: 'class', label: 'Theo lớp' }]}
            />
          ) : null}
        </FilterBar>
        <TabsContent value={tab} className="mt-4">
          {!ready && !rangeInvalid ? <p className="text-sm text-muted-foreground">Chọn khoảng thời gian hợp lệ.</p> : null}
          {ready && tab === 'admissions' ? <AdmissionsContent q={admissions} /> : null}
          {ready && tab === 'attendance' ? <AttendanceContent q={attendance} /> : null}
          {ready && tab === 'academic' ? <AcademicContent q={academic} /> : null}
          {ready && tab === 'finance' ? <FinanceContent q={finance} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
