import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import type { ClassDto } from '@lc/shared';
import { DatePicker } from '@/components/common/date-picker';
import { FormField } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import {
  useCourseOptions, useCreateClass, useRoomOptions, useTeacherOptions, useUpdateClass,
} from '../hooks';

const NO_VALUE = '__none__';
const REQUIRED = 'Vui lòng nhập thông tin này';
const PICK = 'Vui lòng chọn một giá trị';

const buildSchema = (currentSize: number) =>
  z
    .object({
      code: z.string().trim().max(30),
      name: z.string().trim().min(1, REQUIRED).max(150),
      courseId: z.string().min(1, PICK),
      level: z.string().trim().min(1, REQUIRED).max(50),
      teacherId: z.string().min(1, PICK),
      assistantTeacherId: z.string(),
      defaultRoomId: z.string(),
      maxCapacity: z
        .number({ invalid_type_error: REQUIRED })
        .int('Sĩ số phải là số nguyên')
        .min(1, 'Sĩ số tối đa phải từ 1 trở lên')
        .max(100, 'Sĩ số tối đa không quá 100'),
      startDate: z.string().min(1, PICK),
      endDate: z.string().min(1, PICK),
    })
    .superRefine((v, ctx) => {
      if (Number.isFinite(v.maxCapacity) && v.maxCapacity < currentSize)
        ctx.addIssue({
          code: 'custom',
          path: ['maxCapacity'],
          message: `Sĩ số tối đa không được nhỏ hơn sĩ số hiện tại (${currentSize})`,
        });
      if (v.startDate && v.endDate && v.endDate < v.startDate)
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'Ngày kết thúc phải sau hoặc cùng ngày khai giảng',
        });
    });
type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const emptyValues = (): FormValues => ({
  code: '',
  name: '',
  courseId: '',
  level: '',
  teacherId: '',
  assistantTeacherId: '',
  defaultRoomId: '',
  maxCapacity: 20,
  startDate: '',
  endDate: '',
});

const fromClass = (c: ClassDto): FormValues => ({
  code: c.code,
  name: c.name,
  courseId: c.courseId,
  level: c.level,
  teacherId: c.teacherId,
  assistantTeacherId: c.assistantTeacherId ?? '',
  defaultRoomId: c.defaultRoomId ?? '',
  maxCapacity: c.maxCapacity,
  startDate: c.startDate,
  endDate: c.endDate,
});

interface Option {
  id: string;
  label: string;
}

function OptionSelect({
  options, value, onChange, optional, placeholder, ...aria
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  placeholder: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}) {
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === NO_VALUE ? '' : v)}>
      <SelectTrigger {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {optional ? <SelectItem value={NO_VALUE}>Không chọn</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface ClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing. */
  cls?: ClassDto;
}

export function ClassFormDialog({ open, onOpenChange, cls }: ClassFormDialogProps) {
  const editing = Boolean(cls);
  const create = useCreateClass();
  const update = useUpdateClass(cls?.id ?? '');
  const teachers = useTeacherOptions();
  const courses = useCourseOptions();
  const rooms = useRoomOptions();
  const form = useForm<FormValues>({
    resolver: zodResolver(buildSchema(cls?.currentSize ?? 0)),
    defaultValues: cls ? fromClass(cls) : emptyValues(),
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) form.reset(cls ? fromClass(cls) : emptyValues());
  }, [open, cls, form]);

  const teacherOptions = (teachers.data ?? []).map((t) => ({ id: t.id, label: t.fullName }));
  const courseOptions = (courses.data ?? []).map((c) => ({ id: c.id, label: `${c.code} - ${c.name}` }));
  const roomOptions = (rooms.data ?? []).map((r) => ({ id: r.id, label: `${r.code} - ${r.name}` }));

  const onSubmit = form.handleSubmit(async (v) => {
    const common = {
      name: v.name,
      courseId: v.courseId,
      level: v.level,
      teacherId: v.teacherId,
      assistantTeacherId: v.assistantTeacherId || null,
      defaultRoomId: v.defaultRoomId || null,
      maxCapacity: v.maxCapacity,
      startDate: v.startDate,
      endDate: v.endDate,
    };
    try {
      if (cls) await update.mutateAsync(common);
      else await create.mutateAsync({ ...common, code: v.code });
      toast.success(cls ? 'Đã cập nhật lớp học' : 'Đã tạo lớp học');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.details?.fields) {
        for (const [name, message] of Object.entries(e.details.fields))
          form.setError(name as keyof FormValues, { message });
      } else if (e instanceof ApiError && e.code === 'CLASS_CODE_EXISTS') {
        form.setError('code', { message: errorMessage(e) });
      } else if (e instanceof ApiError && e.code === 'CAPACITY_BELOW_CURRENT') {
        form.setError('maxCapacity', { message: errorMessage(e) });
      } else {
        toast.error(errorMessage(e));
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Sửa lớp học' : 'Thêm lớp học'}</DialogTitle>
          <DialogDescription>Nhập thông tin lớp học. Các ô có dấu * là bắt buộc.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mã lớp" required error={errors.code?.message} hint={editing ? 'Không thể đổi mã lớp' : undefined}>
            {(p) => <Input {...p} disabled={editing} {...form.register('code')} />}
          </FormField>
          <FormField label="Tên lớp" required error={errors.name?.message}>
            {(p) => <Input {...p} {...form.register('name')} />}
          </FormField>
          <FormField label="Khóa học" required error={errors.courseId?.message}>
            {(p) => (
              <Controller
                control={form.control}
                name="courseId"
                render={({ field }) => (
                  <OptionSelect {...p} options={courseOptions} value={field.value} onChange={field.onChange} placeholder="Chọn khóa học" />
                )}
              />
            )}
          </FormField>
          <FormField label="Trình độ" required error={errors.level?.message}>
            {(p) => <Input {...p} {...form.register('level')} />}
          </FormField>
          <FormField label="Giáo viên" required error={errors.teacherId?.message}>
            {(p) => (
              <Controller
                control={form.control}
                name="teacherId"
                render={({ field }) => (
                  <OptionSelect {...p} options={teacherOptions} value={field.value} onChange={field.onChange} placeholder="Chọn giáo viên" />
                )}
              />
            )}
          </FormField>
          <FormField label="Trợ giảng" error={errors.assistantTeacherId?.message}>
            {(p) => (
              <Controller
                control={form.control}
                name="assistantTeacherId"
                render={({ field }) => (
                  <OptionSelect {...p} optional options={teacherOptions} value={field.value} onChange={field.onChange} placeholder="Không chọn" />
                )}
              />
            )}
          </FormField>
          <FormField label="Phòng mặc định" error={errors.defaultRoomId?.message}>
            {(p) => (
              <Controller
                control={form.control}
                name="defaultRoomId"
                render={({ field }) => (
                  <OptionSelect {...p} optional options={roomOptions} value={field.value} onChange={field.onChange} placeholder="Không chọn" />
                )}
              />
            )}
          </FormField>
          <FormField label="Sĩ số tối đa" required error={errors.maxCapacity?.message}>
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                {...form.register('maxCapacity', { valueAsNumber: true })}
              />
            )}
          </FormField>
          <FormField label="Ngày khai giảng" required error={errors.startDate?.message}>
            {(p) => (
              <Controller
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <DatePicker {...p} value={field.value || null} onChange={(d) => field.onChange(d ?? '')} />
                )}
              />
            )}
          </FormField>
          <FormField label="Ngày kết thúc" required error={errors.endDate?.message}>
            {(p) => (
              <Controller
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <DatePicker {...p} value={field.value || null} onChange={(d) => field.onChange(d ?? '')} />
                )}
              />
            )}
          </FormField>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
