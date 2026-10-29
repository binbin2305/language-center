import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { can, UpdateSettingsInput, type SettingsDto } from '@lc/shared';
import { ErrorState } from '@/components/common/error-state';
import { FormField } from '@/components/common/form-field';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/auth/use-auth';
import { errorMessage } from '@/lib/error-messages';
import { applyServerFieldErrors, viParams } from '../catalog-shared';
import { useSettings, useUpdateSettings } from '../hooks';

// The threshold is stored as a 0..1 ratio but edited as a percentage; converted on submit.
const FormSchema = UpdateSettingsInput.omit({ attendanceWarningThreshold: true })
  .required()
  .extend({ thresholdPercent: z.number().min(0).max(100) });
type FormInput = z.input<typeof FormSchema>;
type FormOutput = z.output<typeof FormSchema>;

const DAYS = 'Nhập số ngày nguyên từ 0 đến 365.';
const MESSAGES = {
  centerName: 'Nhập tên trung tâm.',
  thresholdPercent: 'Nhập tỷ lệ phần trăm từ 0 đến 100.',
  gradeLockDays: DAYS,
  teacherAttendanceEditDays: DAYS,
  invoiceDueDaysAfterStart: DAYS,
};

const toForm = (s: SettingsDto): FormInput => ({
  centerName: s.centerName,
  thresholdPercent: Math.round(s.attendanceWarningThreshold * 10000) / 100,
  gradeLockDays: s.gradeLockDays,
  resultViewRequiresPaidFees: s.resultViewRequiresPaidFees,
  teacherAttendanceEditDays: s.teacherAttendanceEditDays,
  invoiceDueDaysAfterStart: s.invoiceDueDaysAfterStart,
});

export default function CenterSettingsPage() {
  const { user } = useAuth();
  const editable = can(user, 'settings.update');
  const query = useSettings();
  const update = useUpdateSettings();
  const { register, control, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(FormSchema, viParams(MESSAGES)),
  });

  useEffect(() => {
    if (query.data) reset(toForm(query.data));
  }, [query.data, reset]);

  const onSubmit = handleSubmit(async ({ thresholdPercent, ...rest }) => {
    try {
      const saved = await update.mutateAsync({
        ...rest,
        attendanceWarningThreshold: Number((thresholdPercent / 100).toFixed(4)),
      });
      reset(toForm(saved));
      toast.success('Đã lưu cài đặt');
    } catch (e) {
      if (!applyServerFieldErrors(e, setError, {})) toast.error(errorMessage(e));
    }
  });

  if (query.isPending) {
    return (
      <div>
        <PageHeader title="Cài đặt" />
        <div className="max-w-xl space-y-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div>
        <PageHeader title="Cài đặt" />
        <ErrorState onRetry={() => query.refetch()} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Cài đặt" description="Các tham số vận hành của trung tâm." />
      <form onSubmit={onSubmit} className="max-w-xl space-y-4" noValidate>
        <fieldset disabled={!editable} className="space-y-4">
          <FormField label="Tên trung tâm" required error={errors.centerName?.message}>
            {(p) => <Input {...p} {...register('centerName')} />}
          </FormField>
          <FormField
            label="Ngưỡng cảnh báo vắng (%)" required error={errors.thresholdPercent?.message}
            hint="Học viên vắng vượt tỷ lệ này trong một lớp sẽ bị cảnh báo. Ví dụ: 20."
          >
            {(p) => <Input {...p} inputMode="decimal" {...register('thresholdPercent', { valueAsNumber: true })} />}
          </FormField>
          <FormField
            label="Số ngày chốt điểm" required error={errors.gradeLockDays?.message}
            hint="Sau số ngày này kể từ khi kết thúc lớp, bảng điểm tự khóa."
          >
            {(p) => <Input {...p} inputMode="numeric" {...register('gradeLockDays', { valueAsNumber: true })} />}
          </FormField>
          <FormField
            label="Số ngày giáo viên được sửa điểm danh" required error={errors.teacherAttendanceEditDays?.message}
            hint="Quá hạn này chỉ quản lý hoặc giáo vụ mới sửa được."
          >
            {(p) => <Input {...p} inputMode="numeric" {...register('teacherAttendanceEditDays', { valueAsNumber: true })} />}
          </FormField>
          <FormField
            label="Hạn đóng học phí sau ngày khai giảng (ngày)" required error={errors.invoiceDueDaysAfterStart?.message}
            hint="Dùng để tính hạn thanh toán của hóa đơn mới."
          >
            {(p) => <Input {...p} inputMode="numeric" {...register('invoiceDueDaysAfterStart', { valueAsNumber: true })} />}
          </FormField>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Controller
                control={control}
                name="resultViewRequiresPaidFees"
                render={({ field }) => (
                  <Checkbox id="result-requires-paid" checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true)} />
                )}
              />
              <Label htmlFor="result-requires-paid">Chỉ cho xem kết quả khi đã đóng đủ học phí</Label>
            </div>
            <p className="text-sm text-muted-foreground">Học viên còn nợ học phí sẽ không xem được điểm và nhận xét.</p>
          </div>
        </fieldset>
        {editable ? (
          <Button type="submit" disabled={isSubmitting}>Lưu cài đặt</Button>
        ) : (
          <p className="text-sm text-muted-foreground">Chỉ Quản lý mới chỉnh sửa được cài đặt.</p>
        )}
      </form>
    </div>
  );
}
