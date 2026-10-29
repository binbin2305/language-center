import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  ALL_GENDERS,
  ALL_STUDENT_STATUSES,
  type DuplicateMatchDto,
  type StudentDto,
} from '@lc/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { DatePicker } from '@/components/common/date-picker';
import { FormField } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { useUpdateStudent } from '../hooks';
import { GENDER_LABELS, STUDENT_STATUS_LABELS } from '../student-labels';
import {
  StudentFormSchema, studentErrorMap, type StudentFormInput, type StudentFormOutput,
} from '../student-form-schema';

const FIELD_NAMES: ReadonlyArray<keyof StudentFormInput> = [
  'fullName', 'dob', 'gender', 'phone', 'email', 'address', 'status', 'note',
];
const MATCHED_LABEL = { phone: 'Số điện thoại', email: 'Email' } as const;

/** One warning line per duplicate, e.g. "Số điện thoại trùng với HV Trần Văn Nam (HV2026000002)". */
export function duplicateWarning(d: DuplicateMatchDto): string {
  const fields = d.matchedOn.map((m) => MATCHED_LABEL[m]).join(', ');
  const who = d.kind === 'STUDENT' ? `HV ${d.fullName} (${d.code ?? '—'})` : `lead ${d.fullName}`;
  return `${fields} trùng với ${who}`;
}

export interface StudentEditFormProps {
  student: StudentDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudentEditForm({ student, open, onOpenChange }: StudentEditFormProps) {
  const update = useUpdateStudent(student.id);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const form = useForm<StudentFormInput, unknown, StudentFormOutput>({
    resolver: zodResolver(StudentFormSchema, { errorMap: studentErrorMap, path: [], async: false }),
    defaultValues: {
      fullName: student.fullName,
      dob: student.dob,
      gender: student.gender,
      phone: student.phone,
      email: student.email ?? '',
      address: student.address ?? '',
      status: student.status,
      note: student.note ?? '',
    },
  });
  const { errors, isDirty } = form.formState;

  // Cancel / Esc / overlay click: ask before throwing away edits.
  const requestClose = () => {
    if (isDirty) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  const submit = (input: StudentFormOutput) =>
    update.mutate(input, {
      onSuccess: (result) => {
        toast.success('Đã cập nhật hồ sơ');
        const duplicates = result.warnings?.duplicates ?? [];
        if (duplicates.length > 0)
          toast.warning('Thông tin liên hệ bị trùng', {
            description: duplicates.map(duplicateWarning).join('\n'),
          });
        onOpenChange(false);
      },
      onError: (e) => {
        const fields = e instanceof ApiError ? e.details?.fields : undefined;
        let mapped = false;
        for (const name of FIELD_NAMES) {
          const message = fields?.[name];
          if (message) {
            form.setError(name, { message });
            mapped = true;
          }
        }
        if (!mapped) toast.error(errorMessage(e));
      },
    });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : requestClose())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sửa hồ sơ học viên</DialogTitle>
            <DialogDescription>{`Mã học viên ${student.code}`}</DialogDescription>
          </DialogHeader>
          <form noValidate className="grid gap-4" onSubmit={form.handleSubmit(submit)}>
            <FormField label="Họ và tên" required error={errors.fullName?.message}>
              {(p) => <Input {...p} autoComplete="off" {...form.register('fullName')} />}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Ngày sinh" required error={errors.dob?.message}>
                {(p) => (
                  <Controller
                    control={form.control}
                    name="dob"
                    render={({ field }) => (
                      <DatePicker {...p} value={field.value || null} onChange={(v) => field.onChange(v ?? '')} />
                    )}
                  />
                )}
              </FormField>
              <FormField label="Giới tính" required error={errors.gender?.message}>
                {(p) => (
                  <Controller
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger {...p}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_GENDERS.map((g) => (
                            <SelectItem key={g} value={g}>{GENDER_LABELS[g]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Số điện thoại" required error={errors.phone?.message}>
                {(p) => <Input {...p} type="tel" {...form.register('phone')} />}
              </FormField>
              <FormField label="Email" error={errors.email?.message}>
                {(p) => <Input {...p} type="email" {...form.register('email')} />}
              </FormField>
            </div>
            <FormField label="Địa chỉ" error={errors.address?.message}>
              {(p) => <Input {...p} {...form.register('address')} />}
            </FormField>
            <FormField label="Trạng thái" required error={errors.status?.message}>
              {(p) => (
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...p}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_STUDENT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{STUDENT_STATUS_LABELS[s].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField label="Ghi chú" error={errors.note?.message}>
              {(p) => <Textarea {...p} rows={3} {...form.register('note')} />}
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose}>Hủy</Button>
              <Button type="submit" disabled={update.isPending}>Lưu</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Bỏ thay đổi?"
        description="Các thay đổi chưa lưu sẽ bị mất."
        confirmLabel="Bỏ thay đổi"
        cancelLabel="Tiếp tục sửa"
        destructive
        onConfirm={() => {
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
