import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { isValidScore, PutPlacementResultsInput } from '@lc/shared';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/error-messages';
import { usePlacementTest, usePutResults } from '@/features/placement/hooks';

const toNumber = (s: string) => Number(s.trim().replace(',', '.'));

/** Form rows keep raw text; the payload is built from the shared PlacementResultItem shape on submit. */
const GradeForm = z.object({
  rows: z.array(
    z.object({
      enrollmentId: z.string(),
      studentName: z.string(),
      score: z.string().refine((s) => s.trim() === '' || isValidScore(toNumber(s)), 'Điểm từ 0 đến 10, bước 0.25'),
      level: z.string().trim(),
      comment: z.string().trim(),
    }),
  ),
});
type GradeForm = z.infer<typeof GradeForm>;

export default function PlacementGradePage() {
  const { id = '' } = useParams();
  const q = usePlacementTest(id);
  const put = usePutResults(id);
  const form = useForm<GradeForm>({
    resolver: zodResolver(GradeForm),
    mode: 'onChange',
    defaultValues: { rows: [] },
  });
  const { isDirty } = form.formState;
  const { fields } = useFieldArray({ control: form.control, name: 'rows' });

  useEffect(() => {
    if (!q.data || isDirty) return;
    form.reset({
      rows: q.data.candidates.map((c) => ({
        enrollmentId: c.enrollmentId,
        studentName: c.studentName ?? c.enrollmentId,
        score: c.score === null ? '' : String(c.score),
        level: c.level ?? '',
        comment: c.comment ?? '',
      })),
    });
  }, [q.data, form, isDirty]);

  const editable = q.data?.status === 'SCHEDULED';
  const rows = form.watch('rows');
  const touched = rows.some((r) => r.score.trim() !== '' || r.level !== '');

  const submit = form.handleSubmit(async (v) => {
    const body = v.rows
      .filter((r) => r.score.trim() !== '' || r.level !== '')
      .map((r) => ({
        enrollmentId: r.enrollmentId,
        score: r.score.trim() === '' ? null : toNumber(r.score),
        level: r.level === '' ? null : r.level,
        ...(r.comment ? { comment: r.comment } : {}),
      }));
    const parsed = PutPlacementResultsInput.safeParse(body);
    if (!parsed.success) {
      toast.error('Kết quả chưa hợp lệ. Kiểm tra điểm, trình độ và nhận xét.');
      return;
    }
    try {
      await put.mutateAsync(parsed.data);
      toast.success('Đã lưu kết quả');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  if (q.isLoading || q.isError || !q.data) {
    return (
      <div>
        <PageHeader title="Chấm kiểm tra" />
        {q.isLoading ? <Skeleton className="h-40 w-full" /> : <ErrorState onRetry={() => void q.refetch()} />}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Chấm kiểm tra"
        breadcrumb={[
          { label: 'Kiểm tra đầu vào', to: '/admissions/placement' },
          { label: q.data.courseName ?? 'Đợt kiểm tra', to: `/admissions/placement/${id}` },
          { label: 'Chấm điểm' },
        ]}
      />
      {fields.length === 0 ? (
        <EmptyState title="Chưa có thí sinh" description="Đợt này chưa có thí sinh để chấm." />
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <ul className="space-y-3">
            {fields.map((f, i) => {
              const err = form.formState.errors.rows?.[i]?.score;
              return (
                <li key={f.id} className="grid items-start gap-2 sm:grid-cols-[1fr_8rem_10rem_1fr]">
                  <span className="pt-2 text-sm font-medium">{f.studentName}</span>
                  <div>
                    <Input
                      inputMode="decimal"
                      placeholder="Điểm"
                      aria-label={`Điểm ${f.studentName}`}
                      aria-invalid={err ? true : undefined}
                      className={err ? 'border-destructive' : undefined}
                      disabled={!editable}
                      {...form.register(`rows.${i}.score`)}
                    />
                    {err ? <p className="mt-1 text-xs text-destructive">{err.message}</p> : null}
                  </div>
                  <Input placeholder="Trình độ" aria-label={`Trình độ ${f.studentName}`} disabled={!editable} {...form.register(`rows.${i}.level`)} />
                  <Input placeholder="Nhận xét" aria-label={`Nhận xét ${f.studentName}`} disabled={!editable} {...form.register(`rows.${i}.comment`)} />
                </li>
              );
            })}
          </ul>
          <Button type="submit" disabled={!editable || !form.formState.isValid || !touched || put.isPending}>
            Lưu
          </Button>
        </form>
      )}
    </div>
  );
}
