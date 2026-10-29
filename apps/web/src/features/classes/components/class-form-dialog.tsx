import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { CreateClassInput, type ClassDto } from '@lc/shared';
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
import { useCourses } from '@/features/courses/hooks';
import { useRooms } from '@/features/rooms/hooks';
import { useTeachers } from '@/features/users/hooks';
import { useCreateClass, useUpdateClass } from '../hooks';

const NO_VALUE = '__none__';
const CATALOG_PARAMS = { limit: 100 };
const REQUIRED = 'Vui lòng nhập thông tin này';
const PICK = 'Vui lòng chọn một giá trị';
const PICK_DATE = 'Vui lòng chọn ngày';

/** Vietnamese texts for the shared schema's default zod issues (explicit shared messages win). */
const errorMap: z.ZodErrorMap = (issue, ctx) => {
  const field = String(issue.path[0] ?? '');
  if (field === 'maxCapacity') {
    if (issue.code === 'invalid_type')
      return { message: issue.expected === 'integer' ? 'Sĩ số phải là số nguyên' : REQUIRED };
    if (issue.code === 'too_small') return { message: 'Sĩ số tối đa phải từ 1 trở lên' };
    if (issue.code === 'too_big') return { message: 'Sĩ số tối đa không quá 100' };
  }
  if (issue.code === 'too_small' && issue.type === 'string') return { message: REQUIRED };
  if (issue.code === 'too_big' && issue.type === 'string') return { message: 'Nội dung quá dài' };
  if (issue.code === 'invalid_type') return { message: REQUIRED };
  return { message: ctx.defaultError };
};

const EMPTY_MESSAGES: Record<string, string> = {
  code: 'Vui lòng nhập mã lớp',
  name: REQUIRED,
  level: REQUIRED,
  courseId: PICK,
  teacherId: PICK,
  startDate: PICK_DATE,
  endDate: PICK_DATE,
};

/** Shared create schema + cross-field rules; the same schema serves edit (code is prefilled, never sent). */
const buildSchema = (currentSize: number) =>
  CreateClassInput.superRefine((v, ctx) => {
    if (v.maxCapacity < currentSize)
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
/** PATCH body: everything but the immutable code. */
const EditPayload = CreateClassInput.omit({ code: true });

type FormSchema = ReturnType<typeof buildSchema>;
type FormValues = z.input<FormSchema>;
type FormOutput = z.output<FormSchema>;

const emptyValues = (): FormValues => ({
  code: '',
  name: '',
  courseId: '',
  level: '',
  teacherId: '',
  assistantTeacherId: null,
  defaultRoomId: null,
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
  assistantTeacherId: c.assistantTeacherId ?? null,
  defaultRoomId: c.defaultRoomId ?? null,
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
  // Only rendered for classes.manage (M, S), who may read teachers and rooms.
  const teachers = useTeachers();
  const courses = useCourses(CATALOG_PARAMS);
  const rooms = useRooms(CATALOG_PARAMS);
  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: async (values, ctx, opts) => {
      const res = await zodResolver(buildSchema(cls?.currentSize ?? 0), { errorMap, path: [], async: false })(values, ctx, opts);
      for (const [name, message] of Object.entries(EMPTY_MESSAGES)) {
        const err = res.errors[name as keyof FormValues];
        const v = values[name as keyof FormValues];
        if (err && (v === '' || v == null)) err.message = message;
      }
      return res;
    },
    defaultValues: cls ? fromClass(cls) : emptyValues(),
  });
  const { errors } = form.formState;

  useEffect(() => {
    if (open) form.reset(cls ? fromClass(cls) : emptyValues());
  }, [open, cls, form]);

  const teacherOptions = (teachers.data ?? []).map((t) => ({ id: t.id, label: t.fullName }));
  const courseOptions = (courses.data?.data ?? []).map((c) => ({ id: c.id, label: `${c.code} - ${c.name}` }));
  const roomOptions = (rooms.data?.data ?? []).map((r) => ({ id: r.id, label: `${r.code} - ${r.name}` }));

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      if (cls) await update.mutateAsync(EditPayload.parse(v));
      else await create.mutateAsync(v);
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
                  <OptionSelect {...p} optional options={teacherOptions} value={field.value ?? ''} onChange={(v) => field.onChange(v || null)} placeholder="Không chọn" />
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
                  <OptionSelect {...p} optional options={roomOptions} value={field.value ?? ''} onChange={(v) => field.onChange(v || null)} placeholder="Không chọn" />
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
