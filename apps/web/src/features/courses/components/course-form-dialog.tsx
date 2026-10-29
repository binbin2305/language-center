import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { CourseStatus, CreateCourseInput, type CourseDto } from '@lc/shared';
import { FormField } from '@/components/common/form-field';
import { MoneyInput } from '@/components/common/money-input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import {
  applyServerFieldErrors, catalogStatusLabel, OptionSelect, viParams,
} from '@/features/settings/catalog-shared';
import { useCreateCourse, useUpdateCourse } from '../hooks';

// The form edits levels as comma separated text; the shared schema receives the array.
const FormSchema = CreateCourseInput.extend({
  levels: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(CreateCourseInput.shape.levels),
});
type FormInput = z.input<typeof FormSchema>;
type FormOutput = z.output<typeof FormSchema>;

const MESSAGES = {
  code: 'Nhập mã khóa học (tối đa 30 ký tự).',
  name: 'Nhập tên khóa học.',
  language: 'Nhập ngôn ngữ của khóa học.',
  levels: 'Nhập ít nhất một trình độ, cách nhau bằng dấu phẩy.',
  totalSessions: 'Nhập tổng số buổi là số nguyên lớn hơn 0.',
  baseFee: 'Nhập học phí hợp lệ.',
  description: 'Mô tả quá dài (tối đa 2000 ký tự).',
};
const STATUS_OPTIONS = [CourseStatus.ACTIVE, CourseStatus.ARCHIVED].map((s) => ({ value: s, label: catalogStatusLabel(s) }));

const EMPTY: Partial<FormInput> = { code: '', name: '', language: '', levels: '', description: '', status: CourseStatus.ACTIVE };

const toForm = (c: CourseDto): FormInput => ({
  code: c.code,
  name: c.name,
  language: c.language,
  levels: c.levels.join(', '),
  totalSessions: c.totalSessions,
  baseFee: c.baseFee,
  description: c.description ?? '',
  status: c.status,
});

export function CourseFormDialog({
  open, onOpenChange, course,
}: { open: boolean; onOpenChange: (o: boolean) => void; course: CourseDto | null }) {
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const { register, control, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormOutput>({
    defaultValues: EMPTY,
    resolver: zodResolver(FormSchema, viParams(MESSAGES)),
  });

  useEffect(() => {
    if (open) reset(course ? toForm(course) : EMPTY);
  }, [open, course, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (course) {
        // code is immutable: the strict update schema on the server rejects it
        const { code, ...rest } = values;
        void code;
        await update.mutateAsync({ id: course.id, input: rest });
        toast.success(`Đã cập nhật khóa học ${course.code}`);
      } else {
        await create.mutateAsync(values);
        toast.success(`Đã tạo khóa học ${values.code}`);
      }
      onOpenChange(false);
    } catch (e) {
      if (!applyServerFieldErrors(e, setError, { code: 'Mã khóa học đã tồn tại' })) toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{course ? 'Sửa khóa học' : 'Thêm khóa học'}</DialogTitle>
          <DialogDescription>Mã khóa học không đổi được sau khi tạo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <FormField label="Mã" required error={errors.code?.message}>
            {(p) => <Input {...p} {...register('code')} readOnly={course !== null} />}
          </FormField>
          <FormField label="Tên khóa học" required error={errors.name?.message}>
            {(p) => <Input {...p} {...register('name')} />}
          </FormField>
          <FormField label="Ngôn ngữ" required error={errors.language?.message}>
            {(p) => <Input {...p} {...register('language')} />}
          </FormField>
          <FormField label="Trình độ" required hint="Cách nhau bằng dấu phẩy, ví dụ: A1, A2, B1" error={errors.levels?.message}>
            {(p) => <Input {...p} {...register('levels')} />}
          </FormField>
          <FormField label="Tổng số buổi" required error={errors.totalSessions?.message}>
            {(p) => <Input {...p} inputMode="numeric" {...register('totalSessions', { valueAsNumber: true })} />}
          </FormField>
          <FormField label="Học phí" required error={errors.baseFee?.message}>
            {(p) => (
              <Controller
                control={control}
                name="baseFee"
                render={({ field }) => <MoneyInput {...p} value={field.value ?? null} onChange={field.onChange} />}
              />
            )}
          </FormField>
          <FormField label="Mô tả" error={errors.description?.message}>
            {(p) => <Textarea {...p} {...register('description')} />}
          </FormField>
          <FormField label="Trạng thái">
            {(p) => (
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <OptionSelect {...p} options={STATUS_OPTIONS} value={field.value ?? CourseStatus.ACTIVE} onValueChange={field.onChange} />
                )}
              />
            )}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" disabled={isSubmitting}>Lưu</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
