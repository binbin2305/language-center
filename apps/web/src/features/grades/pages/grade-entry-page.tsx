import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { can } from '@lc/shared';
import { useAuth } from '@/auth/use-auth';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { ReasonDialog } from '@/components/common/reason-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/error-messages';
import { assessmentStatus } from '../components/class-assessments-tab';
import {
  GradeGrid, parseScore, scoreInvalid, type CellValue, type GradeRow,
} from '../components/grade-grid';
import { useAmendGrade, useAssessmentGrades, useSaveGrades } from '../hooks';

const initial = (r: GradeRow): CellValue => ({ score: r.score == null ? '' : String(r.score), comment: r.comment ?? '' });

export default function GradeEntryPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const q = useAssessmentGrades(id);
  const save = useSaveGrades(id);
  const amend = useAmendGrade(id);
  const [values, setValues] = useState<Record<string, CellValue>>({});
  const [confirmMissing, setConfirmMissing] = useState(false);
  const [amending, setAmending] = useState<GradeRow | null>(null);

  const data = q.data;
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    // Never overwrite what the user is typing when a background refetch lands.
    if (data && !dirty) setValues(Object.fromEntries(data.rows.map((r) => [r.studentId, initial(r)])));
  }, [data, dirty]);

  if (q.isLoading || q.isError || !data)
    return (
      <div className="space-y-4">
        <PageHeader title="Nhập điểm" />
        {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : <Skeleton className="h-64 w-full" />}
      </div>
    );

  const { assessment, rows } = data;
  const canEnter = can(user, 'grades.enter');
  const locked = assessment.isLocked;
  const confirmed = assessment.confirmedAt !== null;
  const active = rows.filter((r) => !r.left);
  const anyInvalid = active.some((r) => scoreInvalid(values[r.studentId]?.score ?? ''));
  const missing = active.filter((r) => parseScore(values[r.studentId]?.score ?? '') === null).length;
  const isDirty = (r: GradeRow) => {
    const v = values[r.studentId];
    const o = initial(r);
    return !!v && (v.score !== o.score || v.comment !== o.comment);
  };

  const payload = (confirm: boolean) => ({
    confirm,
    grades: active.map((r) => {
      const v = values[r.studentId] ?? { score: '', comment: '' };
      const comment = v.comment.trim();
      return { studentId: r.studentId, score: parseScore(v.score), ...(comment ? { comment } : {}) };
    }),
  });

  const submit = async (confirm: boolean) => {
    if (anyInvalid) {
      toast.error('Có điểm không hợp lệ. Điểm từ 0 đến 10, bước 0.25.');
      return;
    }
    try {
      await save.mutateAsync(payload(confirm));
      setDirty(false);
      toast.success(confirm ? 'Đã xác nhận kết quả' : 'Đã lưu nháp');
      setConfirmMissing(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onConfirm = () => {
    if (anyInvalid) return void submit(true);
    if (missing > 0) setConfirmMissing(true);
    else void submit(true);
  };

  const doAmend = async (reason: string) => {
    if (!amending) return;
    const v = values[amending.studentId];
    const comment = v?.comment.trim();
    try {
      setDirty(false);
      await amend.mutateAsync({
        studentId: amending.studentId,
        score: parseScore(v?.score ?? ''),
        ...(comment ? { comment } : {}),
        reason,
      });
      toast.success('Đã sửa điểm');
      setAmending(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Nhập điểm: ${assessment.name}`}
        description={`Trọng số ${assessment.weight}%`}
        breadcrumb={[
          { label: 'Lớp học', to: `/classes/${assessment.classId}?tab=assessments` },
          { label: assessment.name },
        ]}
        actions={<StatusBadge group="assessment" value={assessmentStatus(assessment)} />}
      />
      {locked ? (
        <div role="alert" className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm">
          Bảng điểm đã đóng, không thể chỉnh sửa
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="Lớp chưa có học viên" />
      ) : (
        <GradeGrid
          rows={rows}
          values={values}
          onChange={(sid, patch) => { setDirty(true); setValues((p) => ({ ...p, [sid]: { ...(p[sid] ?? { score: '', comment: '' }), ...patch } })); }}
          readOnly={!canEnter}
          locked={locked}
          amend={confirmed}
          isDirty={isDirty}
          onAmend={setAmending}
        />
      )}
      {canEnter && !locked && !confirmed && rows.length > 0 ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={save.isPending} onClick={() => void submit(false)}>
            Lưu nháp
          </Button>
          <Button disabled={save.isPending} onClick={onConfirm}>
            Xác nhận kết quả
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmMissing}
        onOpenChange={setConfirmMissing}
        title="Chưa đủ điểm"
        description={`Còn ${missing} học viên chưa có điểm. Lưu nháp?`}
        confirmLabel="Lưu nháp"
        isPending={save.isPending}
        onConfirm={() => void submit(false)}
      />
      <ReasonDialog
        open={amending !== null}
        onOpenChange={(o) => !o && setAmending(null)}
        title="Sửa điểm đã xác nhận"
        description="Nhập lý do sửa điểm (tối thiểu 5 ký tự)."
        isPending={amend.isPending}
        onSubmit={(reason) => void doAmend(reason)}
      />
    </div>
  );
}
