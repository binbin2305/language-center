import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  BulkCreateSessionsInput,
  CreatePlacementTestInput,
  vnDateTime,
  type SessionConflictDto,
} from '@lc/shared';
import { DatePicker } from '@/components/common/date-picker';
import { FormField } from '@/components/common/form-field';
import { OptionSelect } from '@/components/common/option-select';
import { TimeInput } from '@/components/common/time-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { formatDate, formatTime } from '@/lib/format';
import { viParams } from '@/lib/forms';
import { useCourses } from '@/features/courses/hooks';
import { useRooms } from '@/features/rooms/hooks';
import { useTeachers } from '@/features/users/hooks';
import { useCreatePlacementTest } from '../hooks';

const FormSchema = CreatePlacementTestInput.pick({ courseId: true, roomId: true, teacherId: true })
  .extend({
    date: BulkCreateSessionsInput.shape.fromDate,
    startTime: BulkCreateSessionsInput.shape.startTime,
    endTime: BulkCreateSessionsInput.shape.endTime,
  })
  .superRefine((v, ctx) => {
    if (v.endTime <= v.startTime)
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Giờ kết thúc phải sau giờ bắt đầu' });
  });
type FormValues = z.infer<typeof FormSchema>;

const MESSAGES: Record<string, string> = {
  courseId: 'Chọn khóa học',
  roomId: 'Chọn phòng thi',
  teacherId: 'Chọn giáo viên chấm',
  date: 'Chọn ngày thi',
  startTime: 'Nhập giờ bắt đầu',
  endTime: 'Nhập giờ kết thúc',
};

const KIND_LABEL = { ROOM: 'Trùng phòng', TEACHER: 'Trùng giáo viên' } as const;
const CATALOG = { limit: 100 };

function ConflictRows({ conflicts }: { conflicts: SessionConflictDto[] }) {
  return (
    <ul className="space-y-2" aria-label="Danh sách xung đột lịch">
      {conflicts.map((c, i) => (
        <li
          key={`${c.sessionId ?? c.placementTestId ?? i}-${c.kind}`}
          className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <span className="font-medium tabular-nums">{formatDate(c.startAt)}</span>
          <span className="tabular-nums">{`${formatTime(c.startAt)} - ${formatTime(c.endAt)}`}</span>
          <span className="font-medium">{KIND_LABEL[c.kind]}</span>
          <span>{c.classCode ? `Lớp ${c.classCode}` : 'Đợt kiểm tra khác'}</span>
        </li>
      ))}
    </ul>
  );
}

export function PlacementFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [conflicts, setConflicts] = useState<SessionConflictDto[]>([]);
  const create = useCreatePlacementTest();
  const courses = useCourses(CATALOG, open);
  const rooms = useRooms({ ...CATALOG, status: 'ACTIVE' }, open);
  const teachers = useTeachers(open);
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema, viParams(MESSAGES)),
    defaultValues: { courseId: '', roomId: '', teacherId: '', date: '', startTime: '', endTime: '' },
  });
  const errs = form.formState.errors;

  const submit = form.handleSubmit(async (v) => {
    setConflicts([]);
    try {
      await create.mutateAsync({
        courseId: v.courseId,
        roomId: v.roomId,
        teacherId: v.teacherId,
        startAt: vnDateTime(v.date, v.startTime).toISOString(),
        endAt: vnDateTime(v.date, v.endTime).toISOString(),
      });
      toast.success('Đã tạo đợt kiểm tra');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SCHEDULE_CONFLICT') {
        setConflicts((e.details as { conflicts?: SessionConflictDto[] } | undefined)?.conflicts ?? []);
      }
      toast.error(errorMessage(e));
    }
  });

  const options = {
    course: (courses.data?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    room: (rooms.data?.data ?? []).map((r) => ({ value: r.id, label: `${r.code} - ${r.name}` })),
    teacher: (teachers.data ?? []).map((t) => ({ value: t.id, label: t.fullName })),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tạo đợt kiểm tra</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['courseId', 'Khóa học', options.course],
                ['roomId', 'Phòng thi', options.room],
                ['teacherId', 'Giáo viên chấm', options.teacher],
              ] as const
            ).map(([name, label, opts]) => (
              <FormField key={name} label={label} required error={errs[name]?.message}>
                {(p) => (
                  <Controller
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <OptionSelect {...p} aria-label={label} options={opts} value={field.value} onValueChange={field.onChange} />
                    )}
                  />
                )}
              </FormField>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Ngày thi" required error={errs.date?.message}>
              {(p) => (
                <Controller
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <DatePicker {...p} value={field.value || null} onChange={(d) => field.onChange(d ?? '')} />
                  )}
                />
              )}
            </FormField>
            <FormField label="Giờ bắt đầu" required error={errs.startTime?.message}>
              {(p) => (
                <Controller
                  control={form.control}
                  name="startTime"
                  render={({ field }) => <TimeInput {...p} value={field.value} onChange={field.onChange} />}
                />
              )}
            </FormField>
            <FormField label="Giờ kết thúc" required error={errs.endTime?.message}>
              {(p) => (
                <Controller
                  control={form.control}
                  name="endTime"
                  render={({ field }) => <TimeInput {...p} value={field.value} onChange={field.onChange} />}
                />
              )}
            </FormField>
          </div>
          {conflicts.length > 0 ? <ConflictRows conflicts={conflicts} /> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Tạo đợt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
