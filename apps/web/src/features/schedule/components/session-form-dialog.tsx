import { useState } from 'react';
import { Controller, useForm, useWatch, type FieldPath, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  CheckConflictsInput,
  CreateSessionInput,
  vnDateTime,
  vnDay,
  type SessionConflictDto,
  type SessionDto,
  type SessionWarning,
} from '@lc/shared';
import { ConflictList } from '@/components/common/conflict-list';
import { DatePicker } from '@/components/common/date-picker';
import { EntitySelect } from '@/components/common/entity-select';
import { FormField } from '@/components/common/form-field';
import { TimeInput } from '@/components/common/time-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCheckBulkConflicts, useCheckConflicts, useCreateBulkSessions, useCreateSession, useUpdateSession } from '../hooks';
import { countRecurrence } from '../recurrence-preview';
import {
  RecurringFormSchema,
  scheduleParseParams,
  SingleFormSchema,
  type RecurringFormValues,
  type SingleFormValues,
} from '../session-form-schema';

export interface SessionFormDefaults {
  classId?: string;
  roomId?: string;
  teacherId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface SessionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: SessionFormDefaults;
  /** Edit mode: only the single-session form, PATCH on submit. */
  session?: SessionDto;
  /** The class cannot be changed (opened from a class page or editing a session). */
  lockClass?: boolean;
}

const WEEKDAYS = [
  { value: 1, label: 'T2' }, { value: 2, label: 'T3' }, { value: 3, label: 'T4' }, { value: 4, label: 'T5' },
  { value: 5, label: 'T6' }, { value: 6, label: 'T7' }, { value: 7, label: 'CN' },
] as const;

const warningText = (w: SessionWarning) =>
  `Phòng chỉ có ${w.roomCapacity} chỗ, nhỏ hơn sĩ số tối đa của lớp (${w.classMaxCapacity}).`;

/** Order-independent identity of the values a dry-run covered (explicit field list, not object key order). */
const singleKey = (v: Partial<SingleFormValues>) =>
  [v.classId, v.roomId, v.teacherId, v.date, v.startTime, v.endTime].join('|');
const recurringKey = (v: Partial<RecurringFormValues>) =>
  [
    v.classId, v.roomId, v.teacherId, [...new Set(v.weekdays ?? [])].sort().join(','),
    v.startTime, v.endTime, v.fromDate, v.toDate,
  ].join('|');

/** Remembers the dry-run outcome for one exact set of form values; any edit makes it stale. */
function useDryRun(currentKey: string) {
  const [result, setResult] = useState<{ key: string; conflicts: SessionConflictDto[] } | null>(null);
  const fresh = result?.key === currentKey ? result.conflicts : null;
  return {
    /** Conflicts of the latest check when the form has not changed since; null otherwise. */
    fresh,
    canCreate: fresh !== null && fresh.length === 0,
    record: (key: string, conflicts: SessionConflictDto[]) => setResult({ key, conflicts }),
  };
}

function applyServerError<T extends FieldValues>(
  e: unknown,
  form: UseFormReturn<T>,
  onConflicts: (c: SessionConflictDto[]) => void,
) {
  if (e instanceof ApiError && e.code === 'SCHEDULE_CONFLICT') {
    const conflicts = (e.details as { conflicts?: SessionConflictDto[] } | undefined)?.conflicts ?? [];
    onConflicts(conflicts);
    toast.error(errorMessage(e));
    return;
  }
  if (e instanceof ApiError && e.details?.fields) {
    const known = Object.keys(form.getValues());
    const isField = (name: string): name is FieldPath<T> => known.includes(name);
    for (const [name, message] of Object.entries(e.details.fields)) {
      if (isField(name)) form.setError(name, { message });
    }
    return;
  }
  toast.error(errorMessage(e));
}

interface PickerItem {
  label: string;
  entity: 'class' | 'room' | 'teacher';
  value: string;
  onChange: (id: string) => void;
  error?: string;
  locked?: boolean;
}

/** Sessions can only be scheduled for open classes in active rooms (the API rejects the rest). */
const PICKER_FILTERS: Partial<Record<PickerItem['entity'], Record<string, string | boolean>>> = {
  class: { open: true },
  room: { status: 'ACTIVE' },
};

function EntityPickers({ items }: { items: PickerItem[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <FormField key={it.entity} label={it.label} required error={it.error}>
          {(p) => (
            <EntitySelect
              {...p}
              entity={it.entity}
              filter={PICKER_FILTERS[it.entity]}
              value={it.value || null}
              onChange={(id) => it.onChange(id ?? '')}
              disabled={it.locked}
              selectedLabel={it.locked ? 'Lớp hiện tại' : undefined}
              placeholder={`Chọn ${it.label.toLowerCase()}`}
            />
          )}
        </FormField>
      ))}
    </div>
  );
}

function CheckPanel({
  conflicts, canCreate, checking, creating, createLabel, onCheck, onCancel,
}: {
  conflicts: SessionConflictDto[] | null;
  canCreate: boolean;
  checking: boolean;
  creating: boolean;
  createLabel: string;
  onCheck: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {conflicts && conflicts.length > 0 ? <ConflictList conflicts={conflicts} /> : null}
      {conflicts && conflicts.length === 0 ? (
        <p className="text-sm text-success" role="status">Không có xung đột lịch.</p>
      ) : null}
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel}>Đóng</Button>
        <Button type="button" variant="secondary" onClick={onCheck} disabled={checking || creating}>
          {checking ? 'Đang kiểm tra...' : 'Kiểm tra xung đột'}
        </Button>
        <Button type="submit" disabled={!canCreate || creating}>{createLabel}</Button>
      </DialogFooter>
    </>
  );
}

function RecurringForm({ defaults, lockClass, onDone }: { defaults?: SessionFormDefaults; lockClass?: boolean; onDone: () => void }) {
  const form = useForm<RecurringFormValues>({
    resolver: zodResolver(RecurringFormSchema, scheduleParseParams),
    defaultValues: {
      classId: defaults?.classId ?? '', roomId: defaults?.roomId ?? '', teacherId: defaults?.teacherId ?? '',
      weekdays: [], startTime: '', endTime: '', fromDate: defaults?.fromDate ?? '', toDate: defaults?.toDate ?? '',
    },
  });
  const { control, formState: { errors } } = form;
  const watched = useWatch({ control });
  const setPicker = (name: 'classId' | 'roomId' | 'teacherId') => (id: string) =>
    form.setValue(name, id, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  const dry = useDryRun(recurringKey(watched));
  const [checking, setChecking] = useState(false);
  const create = useCreateBulkSessions();
  const checkBulk = useCheckBulkConflicts();

  const count = countRecurrence({
    weekdays: watched.weekdays ?? [], fromDate: watched.fromDate ?? '', toDate: watched.toDate ?? '',
  });
  const canPreview = (watched.weekdays?.length ?? 0) > 0 && count > 0;

  const check = form.handleSubmit(async (v) => {
    setChecking(true);
    try {
      const res = await checkBulk.mutateAsync(v);
      dry.record(recurringKey(v), res.conflicts);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setChecking(false);
    }
  });

  const submit = form.handleSubmit(async (v) => {
    if (!dry.canCreate) return;
    try {
      const res = await create.mutateAsync({ ...v, weekdays: [...new Set(v.weekdays)].sort() });
      toast.success(`Đã tạo ${res.sessions.length} buổi học`);
      res.warnings.forEach((w) => toast.warning(warningText(w)));
      onDone();
    } catch (e) {
      applyServerError(e, form, (c) => dry.record(recurringKey(v), c));
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <EntityPickers
        items={[
          { label: 'Lớp học', entity: 'class', value: watched.classId ?? '', onChange: setPicker('classId'), error: errors.classId?.message, locked: lockClass },
          { label: 'Phòng học', entity: 'room', value: watched.roomId ?? '', onChange: setPicker('roomId'), error: errors.roomId?.message },
          { label: 'Giáo viên', entity: 'teacher', value: watched.teacherId ?? '', onChange: setPicker('teacherId'), error: errors.teacherId?.message },
        ]}
      />
      <FormField label="Thứ trong tuần" required error={errors.weekdays?.message}>
        {(p) => (
          <Controller
            control={control}
            name="weekdays"
            render={({ field }) => (
              <div role="group" aria-label="Thứ trong tuần" className="flex flex-wrap gap-2" id={p.id}>
                {WEEKDAYS.map((d) => {
                  const on = field.value.includes(d.value);
                  return (
                    <Button
                      key={d.value}
                      type="button"
                      size="sm"
                      variant={on ? 'default' : 'outline'}
                      aria-pressed={on}
                      className={cn('min-w-11')}
                      onClick={() => field.onChange(on ? field.value.filter((x) => x !== d.value) : [...field.value, d.value])}
                    >
                      {d.label}
                    </Button>
                  );
                })}
              </div>
            )}
          />
        )}
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Giờ bắt đầu" required error={errors.startTime?.message}>
          {(p) => (
            <Controller control={control} name="startTime" render={({ field }) => <TimeInput {...p} value={field.value} onChange={field.onChange} />} />
          )}
        </FormField>
        <FormField label="Giờ kết thúc" required error={errors.endTime?.message}>
          {(p) => (
            <Controller control={control} name="endTime" render={({ field }) => <TimeInput {...p} value={field.value} onChange={field.onChange} />} />
          )}
        </FormField>
        <FormField label="Từ ngày" required error={errors.fromDate?.message}>
          {(p) => (
            <Controller control={control} name="fromDate" render={({ field }) => <DatePicker {...p} value={field.value || null} onChange={(v) => field.onChange(v ?? '')} />} />
          )}
        </FormField>
        <FormField label="Đến ngày" required error={errors.toDate?.message}>
          {(p) => (
            <Controller control={control} name="toDate" render={({ field }) => <DatePicker {...p} value={field.value || null} onChange={(v) => field.onChange(v ?? '')} />} />
          )}
        </FormField>
      </div>
      {canPreview ? <p className="text-sm font-medium">{`Sẽ tạo ${count} buổi`}</p> : null}
      <CheckPanel
        conflicts={dry.fresh}
        canCreate={dry.canCreate}
        checking={checking}
        creating={create.isPending}
        createLabel="Tạo"
        onCheck={() => void check()}
        onCancel={onDone}
      />
    </form>
  );
}

function SingleForm({
  defaults, lockClass, session, onDone,
}: { defaults?: SessionFormDefaults; lockClass?: boolean; session?: SessionDto; onDone: () => void }) {
  const form = useForm<SingleFormValues>({
    resolver: zodResolver(SingleFormSchema, scheduleParseParams),
    defaultValues: session
      ? {
          classId: session.classId, roomId: session.roomId, teacherId: session.teacherId,
          date: vnDay(new Date(session.startAt)), startTime: formatTime(session.startAt), endTime: formatTime(session.endAt),
        }
      : {
          classId: defaults?.classId ?? '', roomId: defaults?.roomId ?? '', teacherId: defaults?.teacherId ?? '',
          date: defaults?.fromDate ?? '', startTime: '', endTime: '',
        },
  });
  const { control, formState: { errors } } = form;
  const watched = useWatch({ control });
  const setPicker = (name: 'classId' | 'roomId' | 'teacherId') => (id: string) =>
    form.setValue(name, id, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  const dry = useDryRun(singleKey(watched));
  const checkOne = useCheckConflicts();
  const [checking, setChecking] = useState(false);
  const create = useCreateSession();
  const update = useUpdateSession();

  const instants = (v: SingleFormValues) => ({
    startAt: vnDateTime(v.date, v.startTime).toISOString(),
    endAt: vnDateTime(v.date, v.endTime).toISOString(),
  });

  const check = form.handleSubmit(async (v) => {
    setChecking(true);
    try {
      const res = await checkOne.mutateAsync(
        CheckConflictsInput.parse({
          ...instants(v), classId: v.classId, roomId: v.roomId, teacherId: v.teacherId, excludeSessionId: session?.id,
        }),
      );
      dry.record(singleKey(v), res.conflicts);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setChecking(false);
    }
  });

  const submit = form.handleSubmit(async (v) => {
    if (!dry.canCreate) return;
    try {
      const res = session
        ? await update.mutateAsync({ id: session.id, body: { roomId: v.roomId, teacherId: v.teacherId, ...instants(v) } })
        : await create.mutateAsync(CreateSessionInput.parse({ classId: v.classId, roomId: v.roomId, teacherId: v.teacherId, ...instants(v) }));
      toast.success(session ? 'Đã cập nhật buổi học' : 'Đã tạo buổi học');
      res.warnings.forEach((w) => toast.warning(warningText(w)));
      onDone();
    } catch (e) {
      applyServerError(e, form, (c) => dry.record(singleKey(v), c));
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <EntityPickers
        items={[
          { label: 'Lớp học', entity: 'class', value: watched.classId ?? '', onChange: setPicker('classId'), error: errors.classId?.message, locked: lockClass || !!session },
          { label: 'Phòng học', entity: 'room', value: watched.roomId ?? '', onChange: setPicker('roomId'), error: errors.roomId?.message },
          { label: 'Giáo viên', entity: 'teacher', value: watched.teacherId ?? '', onChange: setPicker('teacherId'), error: errors.teacherId?.message },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Ngày" required error={errors.date?.message}>
          {(p) => (
            <Controller control={control} name="date" render={({ field }) => <DatePicker {...p} value={field.value || null} onChange={(v) => field.onChange(v ?? '')} />} />
          )}
        </FormField>
        <FormField label="Giờ bắt đầu" required error={errors.startTime?.message}>
          {(p) => (
            <Controller control={control} name="startTime" render={({ field }) => <TimeInput {...p} value={field.value} onChange={field.onChange} />} />
          )}
        </FormField>
        <FormField label="Giờ kết thúc" required error={errors.endTime?.message}>
          {(p) => (
            <Controller control={control} name="endTime" render={({ field }) => <TimeInput {...p} value={field.value} onChange={field.onChange} />} />
          )}
        </FormField>
      </div>
      <CheckPanel
        conflicts={dry.fresh}
        canCreate={dry.canCreate}
        checking={checking}
        creating={create.isPending || update.isPending}
        createLabel={session ? 'Lưu' : 'Tạo'}
        onCheck={() => void check()}
        onCancel={onDone}
      />
    </form>
  );
}

export function SessionFormDialog({ open, onOpenChange, defaults, session, lockClass }: SessionFormDialogProps) {
  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{session ? 'Sửa buổi học' : 'Tạo lịch học'}</DialogTitle>
          <DialogDescription>Kiểm tra xung đột phòng và giáo viên trước khi tạo.</DialogDescription>
        </DialogHeader>
        {session ? (
          <SingleForm defaults={defaults} session={session} lockClass onDone={close} />
        ) : (
          <Tabs defaultValue="single">
            <TabsList>
              <TabsTrigger value="single">Một buổi</TabsTrigger>
              <TabsTrigger value="recurring">Lặp lại</TabsTrigger>
            </TabsList>
            <TabsContent value="single" className="mt-4">
              <SingleForm defaults={defaults} lockClass={lockClass} onDone={close} />
            </TabsContent>
            <TabsContent value="recurring" className="mt-4">
              <RecurringForm defaults={defaults} lockClass={lockClass} onDone={close} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
