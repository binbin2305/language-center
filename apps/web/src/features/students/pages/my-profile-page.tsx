import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/error-state';
import { FormField } from '@/components/common/form-field';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { formatDate } from '@/lib/format';
import { StudentStatusBadge } from '../components/student-status-badge';
import { useMyProfile, useUpdateMyContact } from '../hooks';
import { GENDER_LABELS } from '../student-labels';
import {
  ContactFormSchema, studentErrorMap, type ContactFormInput, type ContactFormOutput,
} from '../student-form-schema';
import type { StudentDto } from '@lc/shared';

const ReadOnly = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-0.5">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="text-sm font-medium">{children}</dd>
  </div>
);

function ContactForm({ student }: { student: StudentDto }) {
  const update = useUpdateMyContact();
  const form = useForm<ContactFormInput, unknown, ContactFormOutput>({
    resolver: zodResolver(ContactFormSchema, { errorMap: studentErrorMap, path: [], async: false }),
    defaultValues: {
      phone: student.phone,
      email: student.email ?? '',
      address: student.address ?? '',
    },
  });
  const { errors } = form.formState;

  const submit = (input: ContactFormOutput) =>
    update.mutate(input, {
      onSuccess: (result) => {
        toast.success('Đã cập nhật thông tin liên hệ');
        form.reset({
          phone: result.student.phone,
          email: result.student.email ?? '',
          address: result.student.address ?? '',
        });
      },
      onError: (e) => {
        const fields = e instanceof ApiError ? e.details?.fields : undefined;
        let mapped = false;
        for (const name of ['phone', 'email', 'address'] as const) {
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
    <form noValidate className="grid max-w-xl gap-4" onSubmit={form.handleSubmit(submit)}>
      <h2 className="text-base font-semibold">Thông tin liên hệ</h2>
      <FormField label="Số điện thoại" required error={errors.phone?.message}>
        {(p) => <Input {...p} type="tel" {...form.register('phone')} />}
      </FormField>
      <FormField label="Email" error={errors.email?.message}>
        {(p) => <Input {...p} type="email" {...form.register('email')} />}
      </FormField>
      <FormField label="Địa chỉ" error={errors.address?.message}>
        {(p) => <Input {...p} {...form.register('address')} />}
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" disabled={update.isPending}>Lưu</Button>
        <Button asChild variant="outline">
          <Link to="/change-password">Đổi mật khẩu</Link>
        </Button>
      </div>
    </form>
  );
}

export default function MyProfilePage() {
  const profile = useMyProfile();
  const s = profile.data;
  return (
    <>
      <PageHeader title="Hồ sơ của tôi" />
      {profile.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : profile.isError || !s ? (
        <ErrorState onRetry={() => void profile.refetch()} />
      ) : (
        <div className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ReadOnly label="Mã học viên">{s.code}</ReadOnly>
            <ReadOnly label="Họ và tên">{s.fullName}</ReadOnly>
            <ReadOnly label="Ngày sinh">{formatDate(s.dob)}</ReadOnly>
            <ReadOnly label="Giới tính">{GENDER_LABELS[s.gender]}</ReadOnly>
            <ReadOnly label="Trạng thái">
              <StudentStatusBadge status={s.status} />
            </ReadOnly>
          </dl>
          <ContactForm student={s} />
        </div>
      )}
    </>
  );
}
