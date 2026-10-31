import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { ALL_ASSESSMENT_TYPES, CreateAssessmentInput } from '@lc/shared';
import { FormField } from '@/components/common/form-field';
import { OptionSelect } from '@/components/common/option-select';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { useCreateAssessment } from '../hooks';
import { ASSESSMENT_TYPE_LABELS } from '../labels';

// Shared schema + the service rule 0 < weight <= 100 (client-side mirror).
const FormSchema = CreateAssessmentInput.superRefine((v, ctx) => {
  if (!(v.weight > 0 && v.weight <= 100))
    ctx.addIssue({ code: 'custom', path: ['weight'], message: 'Trọng số lớn hơn 0 và tối đa 100.' });
});
type FormValues = z.input<typeof FormSchema>;

const MESSAGES: Record<string, string> = {
  name: 'Nhập tên bài đánh giá.',
  weight: 'Nhập trọng số hợp lệ.',
  heldOn: 'Chọn ngày kiểm tra.',
};
const errorMap: z.ZodErrorMap = (issue, ctx) => ({
  message: issue.code === 'custom' ? (issue.message ?? ctx.defaultError) : (MESSAGES[String(issue.path[0])] ?? ctx.defaultError),
});

const emptyValues = (): FormValues => ({ name: '', type: 'QUIZ', weight: NaN, heldOn: '' });

export function AssessmentFormDialog({
  classId, open, onOpenChange,
}: { classId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateAssessment(classId);
  const form = useForm<FormValues, unknown, CreateAssessmentInput>({
    resolver: zodResolver(FormSchema, { errorMap, path: [], async: false }),
    defaultValues: emptyValues(),
  });
  const { errors } = form.formState;
  useEffect(() => {
    if (open) form.reset(emptyValues());
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await create.mutateAsync(v);
      toast.success('Đã tạo bài đánh giá');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'WEIGHT_EXCEEDS_100') form.setError('weight', { message: errorMessage(e) });
      else if (e instanceof ApiError && e.details?.fields) {
        for (const [name, message] of Object.entries(e.details.fields)) form.setError(name as keyof FormValues, { message });
      } else toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)} noValidate>
          <DialogHeader>
            <DialogTitle>Thêm bài đánh giá</DialogTitle>
            <DialogDescription>Tổng trọng số các bài của lớp tối đa 100%.</DialogDescription>
          </DialogHeader>
          <FormField label="Tên bài" required error={errors.name?.message}>
            {(p) => <Input {...p} {...form.register('name')} />}
          </FormField>
          <FormField label="Loại" required>
            {(p) => (
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <OptionSelect
                    {...p}
                    value={field.value}
                    onValueChange={field.onChange}
                    options={ALL_ASSESSMENT_TYPES.map((t) => ({ value: t, label: ASSESSMENT_TYPE_LABELS[t] }))}
                  />
                )}
              />
            )}
          </FormField>
          <FormField label="Trọng số (%)" required error={errors.weight?.message}>
            {(p) => <Input {...p} type="number" min={0} max={100} {...form.register('weight', { valueAsNumber: true })} />}
          </FormField>
          <FormField label="Ngày kiểm tra" required error={errors.heldOn?.message}>
            {(p) => <Input {...p} type="date" {...form.register('heldOn')} />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" disabled={create.isPending}>Lưu</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
