import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { can, UpdateSettingsInput, type SettingsDto } from '@lc/shared';
import { ErrorState } from '@/components/common/error-state';
import { FormField } from '@/components/common/form-field';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/auth/use-auth';
import { errorMessage } from '@/lib/error-messages';
import { applyServerFieldErrors, schemaResolver, toNumber } from '../form-utils';
import { useSettings, useUpdateSettings } from '../hooks';

interface FormValues {
  centerName: string;
  thresholdPercent: string; // stored as a 0..1 ratio, edited as a percentage
  gradeLockDays: string;
  resultViewRequiresPaidFees: boolean;
  teacherAttendanceEditDays: string;
  invoiceDueDaysAfterStart: string;
}

const toForm = (s: SettingsDto): FormValues => ({
  centerName: s.centerName,
  thresholdPercent: String(Math.round(s.attendanceWarningThreshold * 10000) / 100),
  gradeLockDays: String(s.gradeLockDays),
  resultViewRequiresPaidFees: s.resultViewRequiresPaidFees,
  teacherAttendanceEditDays: String(s.teacherAttendanceEditDays),
  invoiceDueDaysAfterStart: String(s.invoiceDueDaysAfterStart),
});

const toInput = (v: FormValues) => ({
  centerName: v.centerName,
  attendanceWarningThreshold: toNumber(v.thresholdPercent) / 100,
  gradeLockDays: toNumber(v.gradeLockDays),
  resultViewRequiresPaidFees: v.resultViewRequiresPaidFees,
  teacherAttendanceEditDays: toNumber(v.teacherAttendanceEditDays),
  invoiceDueDaysAfterStart: toNumber(v.invoiceDueDaysAfterStart),
});

const DAYS = 'Nhập số ngày nguyên từ 0 đến 365.';
const MESSAGES = {
  centerName: 'Nhập tên trung tâm.',
  thresholdPercent: 'Nhập tỷ lệ phần trăm từ 0 đến 100.',
  gradeLockDays: DAYS,
  teacherAttendanceEditDays: DAYS,
  invoiceDueDaysAfterStart: DAYS,
};
// The schema reports attendanceWarningThreshold; the form field is thresholdPercent.
const FIELD_MAP = { attendanceWarningThreshold: 'thresholdPercent' } as const;

export default function CenterSettingsPage() {
  const { user } = useAuth();
  const editable = can(user, 'settings.update');
  const query = useSettings();
  const update = useUpdateSettings();
  const {
    register, handleSubmit, reset, setError, formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: schemaResolver<FormValues>(UpdateSettingsInput, toInput, MESSAGES, FIELD_MAP),
  });

  useEffect(() => {
    if (query.data) reset(toForm(query.data));
  }, [query.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync(UpdateSettingsInput.parse(toInput(values)));
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
            {(p) => <Input {...p} inputMode="decimal" {...register('thresholdPercent')} />}
          </FormField>
          <FormField
            label="Số ngày chốt điểm" required error={errors.gradeLockDays?.message}
            hint="Sau số ngày này kể từ khi kết thúc lớp, bảng điểm tự khóa."
          >
            {(p) => <Input {...p} inputMode="numeric" {...register('gradeLockDays')} />}
          </FormField>
          <FormField
            label="Số ngày giáo viên được sửa điểm danh" required error={errors.teacherAttendanceEditDays?.message}
            hint="Quá hạn này chỉ quản lý hoặc giáo vụ mới sửa được."
          >
            {(p) => <Input {...p} inputMode="numeric" {...register('teacherAttendanceEditDays')} />}
          </FormField>
          <FormField
            label="Hạn đóng học phí sau ngày khai giảng (ngày)" required error={errors.invoiceDueDaysAfterStart?.message}
            hint="Dùng để tính hạn thanh toán của hóa đơn mới."
          >
            {(p) => <Input {...p} inputMode="numeric" {...register('invoiceDueDaysAfterStart')} />}
          </FormField>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                id="result-requires-paid"
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...register('resultViewRequiresPaidFees')}
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
