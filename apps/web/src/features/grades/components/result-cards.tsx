import { useState } from 'react';
import { toast } from 'sonner';
import type { ResultDto } from '@lc/shared';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { useClass } from '@/features/classes/hooks';
import { gradesApi } from '../api';
import { useResults } from '../hooks';
import { ASSESSMENT_TYPE_LABELS } from '../labels';
import { GradeClassBadge, formatScore } from './grade-class-badge';

function ResultCard({ result }: { result: ResultDto }) {
  const cls = useClass(result.classId);
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const blob = await gradesApi.transcriptPdf(result.studentId, result.classId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phieu-diem-${result.classId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{cls.data?.name ?? 'Lớp học'}</h2>
        <Button variant="outline" size="sm" disabled={busy} onClick={download}>
          Tải phiếu điểm PDF
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1 font-medium">Bài đánh giá</th>
            <th className="py-1 font-medium">Loại</th>
            <th className="py-1 font-medium">Trọng số</th>
            <th className="py-1 text-right font-medium">Điểm</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((i) => (
            <tr key={i.assessmentId} className="border-b last:border-0">
              <td className="py-1">{i.name}</td>
              <td className="py-1">{ASSESSMENT_TYPE_LABELS[i.type] ?? i.type}</td>
              <td className="py-1">{i.weight}%</td>
              <td className="py-1 text-right">{formatScore(i.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-end gap-2 text-sm">
        <span className="text-muted-foreground">Trung bình</span>
        <strong>{formatScore(result.average)}</strong>
        <GradeClassBadge value={result.gradeClass} />
      </div>
    </section>
  );
}

/** Per-class result cards of one student (shared by /me/results and the student detail tab). */
export function StudentResultCards({ studentId }: { studentId: string | undefined }) {
  const q = useResults({ studentId, limit: 100 }, Boolean(studentId));
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.error instanceof ApiError && q.error.code === 'FEES_OUTSTANDING') {
    return (
      <div role="alert" className="rounded-lg border border-warning bg-warning/10 p-4 text-sm">
        <p className="font-medium">Bạn còn học phí quá hạn nên chưa thể xem kết quả học tập.</p>
        <p className="text-muted-foreground">
          Vui lòng liên hệ giáo vụ hoặc thanh toán học phí để được mở lại kết quả.
        </p>
      </div>
    );
  }
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  const rows = q.data?.data ?? [];
  if (!rows.length) return <EmptyState title="Chưa có kết quả học tập" />;
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <ResultCard key={`${r.studentId}-${r.classId}`} result={r} />
      ))}
    </div>
  );
}
