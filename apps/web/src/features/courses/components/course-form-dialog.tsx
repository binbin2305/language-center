import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CreateCourseInput, UpdateCourseInput, type CourseDto } from '@lc/shared';
import { FormField } from '@/components/common/form-field';
import { MoneyInput } from '@/components/common/money-input';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import { NativeSelect } from '@/features/settings/components/native-select';
import { applyServerFieldErrors, schemaResolver, toNumber } from '@/features/settings/form-utils';
import { useCreateCourse, useUpdateCourse } from '../hooks';

interface FormValues {
  code: string;
  name: string;
  language: string;
  levels: string; // comma separated
  totalSessions: string;
  baseFee: number | null;
  description: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

const EMPTY: FormValues = {
  code: '', name: '', language: '', levels: '', totalSessions: '', baseFee: null, description: '', status: 'ACTIVE',
};

const toForm = (c: CourseDto): FormValues => ({
  code: c.code,
  name: c.name,
  language: c.language,
  levels: c.levels.join(', '),
  totalSessions: String(c.totalSessions),
  baseFee: c.baseFee,
  description: c.description ?? '',
  status: c.status,
});

const toInput = (v: FormValues) => ({
  code: v.code,
  name: v.name,
  language: v.language,
  levels: v.levels.split(',').map((s) => s.trim()).filter(Boolean),
  totalSessions: toNumber(v.totalSessions),
  baseFee: v.baseFee ?? Number.NaN,
  description: v.description.trim() || undefined,
  status: v.status,
});

const omitCode = (input: ReturnType<typeof toInput>) =>
  Object.fromEntries(Object.entries(input).filter(([k]) => k !== 'code'));

const MESSAGES = {
  code: 'Nhập mã khóa học (tối đa 30 ký tự).',
  name: 'Nhập tên khóa học.',
  language: 'Nhập ngôn ngữ của khóa học.',
  levels: 'Nhập ít nhất một trình độ, cách nhau bằng dấu phẩy.',
  totalSessions: 'Nhập tổng số buổi là số nguyên lớn hơn 0.',
  baseFee: 'Nhập học phí hợp lệ.',
};

export function CourseFormDialog({
  open, onOpenChange, course,
}: { open: boolean; onOpenChange: (o: boolean) => void; course: CourseDto | null }) {
  const editing = course !== null;
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const form = useForm<FormValues>({
    defaultValues: EMPTY,
    // code is immutable on edit, so the update schema (no code) applies there
    resolver: schemaResolver<FormValues>(editing ? UpdateCourseInput : CreateCourseInput, (v) => {
      const input = toInput(v);
      return editing ? omitCode(input) : input;
    }, MESSAGES),
  });
  const { register, handleSubmit, setError, reset, control, formState: { errors, isSubmitting } } = form;

  useEffect(() => {
    if (open) reset(course ? toForm(course) : EMPTY);
  }, [open, course, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const input = toInput(values);
    try {
      if (course) {
        // code is immutable; the update schema is strict and rejects it
        await update.mutateAsync({ id: course.id, input: UpdateCourseInput.parse(omitCode(input)) });
        toast.success(`Đã cập nhật khóa học ${course.code}`);
      } else {
        const parsed = CreateCourseInput.parse(input);
        await create.mutateAsync(parsed);
        toast.success(`Đã tạo khóa học ${parsed.code}`);
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
          <DialogTitle>{editing ? 'Sửa khóa học' : 'Thêm khóa học'}</DialogTitle>
          <DialogDescription>Mã khóa học không đổi được sau khi tạo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <FormField label="Mã" required error={errors.code?.message}>
            {(p) => <Input {...p} {...register('code')} disabled={editing} />}
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
            {(p) => <Input {...p} inputMode="numeric" {...register('totalSessions')} />}
          </FormField>
          <FormField label="Học phí" required error={errors.baseFee?.message}>
            {(p) => (
              <Controller
                control={control}
                name="baseFee"
                render={({ field }) => <MoneyInput {...p} value={field.value} onChange={field.onChange} />}
              />
            )}
          </FormField>
          <FormField label="Mô tả" error={errors.description?.message}>
            {(p) => <Textarea {...p} {...register('description')} />}
          </FormField>
          <FormField label="Trạng thái">
            {(p) => (
              <NativeSelect {...p} {...register('status')}>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="ARCHIVED">Đã lưu trữ</option>
              </NativeSelect>
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
