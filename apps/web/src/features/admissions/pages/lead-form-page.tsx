import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ALL_GENDERS, DuplicatePersonDetails, type Gender } from '@lc/shared';
import { DatePicker } from '@/components/common/date-picker';
import { FormField } from '@/components/common/form-field';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { useCourseOptions } from '../course-options';
import { useCreateLead } from '../hooks';
import { DuplicateDialog } from '../components/duplicate-dialog';
import {
  LeadFormSchema, leadErrorMap, type LeadFormInput, type LeadFormOutput,
} from '../lead-form-schema';

const GENDER_LABELS: Record<Gender, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };
const FIELD_NAMES: ReadonlyArray<keyof LeadFormInput> = [
  'fullName', 'dob', 'gender', 'phone', 'email', 'address', 'interestedCourseId', 'note',
];

export default function LeadFormPage() {
  const navigate = useNavigate();
  const courses = useCourseOptions();
  const create = useCreateLead();
  const [pending, setPending] = useState<LeadFormOutput | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatePersonDetails['duplicates']>([]);

  const form = useForm<LeadFormInput, unknown, LeadFormOutput>({
    resolver: zodResolver(LeadFormSchema, { errorMap: leadErrorMap, path: [], async: false }),
    defaultValues: {
      fullName: '', dob: '', phone: '', email: '', address: '', interestedCourseId: '', note: '',
    },
  });
  const { errors } = form.formState;

  const submit = (input: LeadFormOutput, force: boolean) =>
    create.mutate(
      { input, force },
      {
        onSuccess: (lead) => {
          setPending(null);
          toast.success('Đã tiếp nhận lead');
          navigate(`/admissions/leads/${lead.id}`);
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'DUPLICATE_PERSON') {
            const parsed = DuplicatePersonDetails.safeParse(e.details);
            if (parsed.success) {
              setPending(input);
              setDuplicates(parsed.data.duplicates);
              return;
            }
          }
          setPending(null);
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
      },
    );

  return (
    <>
      <PageHeader
        title="Tiếp nhận lead"
        breadcrumb={[{ label: 'Tuyển sinh', to: '/admissions/leads' }, { label: 'Tiếp nhận mới' }]}
      />
      <form
        noValidate
        className="grid max-w-2xl gap-4"
        onSubmit={form.handleSubmit((v) => submit(v, false))}
      >
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
                  <Select value={field.value ?? ''} onValueChange={field.onChange}>
                    <SelectTrigger {...p} aria-label="Giới tính *">
                      <SelectValue placeholder="Chọn giới tính" />
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
        <FormField label="Khóa học quan tâm" required error={errors.interestedCourseId?.message}>
          {(p) => (
            <Controller
              control={form.control}
              name="interestedCourseId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger {...p} aria-label="Khóa học quan tâm *">
                    <SelectValue placeholder="Chọn khóa học" />
                  </SelectTrigger>
                  <SelectContent>
                    {(courses.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{`${c.code} - ${c.name}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>
        <FormField label="Địa chỉ" error={errors.address?.message}>
          {(p) => <Input {...p} {...form.register('address')} />}
        </FormField>
        <FormField label="Ghi chú" error={errors.note?.message}>
          {(p) => <Textarea {...p} rows={3} {...form.register('note')} />}
        </FormField>
        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending}>Lưu lead</Button>
          <Button asChild variant="outline">
            <Link to="/admissions/leads">Hủy</Link>
          </Button>
        </div>
      </form>
      <DuplicateDialog
        open={pending !== null}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        duplicates={duplicates}
        forceLabel="Vẫn lưu lead mới"
        isPending={create.isPending}
        onForce={() => { if (pending) submit(pending, true); }}
      />
    </>
  );
}
