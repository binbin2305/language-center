import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CreateUserInput, Role, type CreateUserResultDto } from '@lc/shared';
import { FormField } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/error-messages';
import { NativeSelect } from '@/features/settings/components/native-select';
import { applyServerFieldErrors, schemaResolver } from '@/features/settings/form-utils';
import { useCreateUser } from '../hooks';
import { CREATABLE_ROLES, ROLE_LABELS } from '../roles';

interface FormValues {
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  languages: string; // comma separated
  levels: string;
  specialization: string;
}

const EMPTY: FormValues = {
  fullName: '', email: '', phone: '', role: Role.TEACHER, languages: '', levels: '', specialization: '',
};

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const toInput = (v: FormValues) => ({
  email: v.email,
  fullName: v.fullName,
  phone: v.phone.trim() || undefined,
  role: v.role,
  ...(v.role === Role.TEACHER
    ? { teacherProfile: { languages: list(v.languages), levels: list(v.levels), specialization: v.specialization.trim() || undefined } }
    : {}),
});

const MESSAGES = {
  fullName: 'Nhập họ tên (ít nhất 2 ký tự).',
  email: 'Nhập email hợp lệ, ví dụ ten@trungtam.vn.',
  phone: 'Số điện thoại chưa đúng. Nhập số di động Việt Nam, ví dụ 0912345678.',
  role: 'Chọn vai trò.',
};

export function UserFormDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (r: CreateUserResultDto) => void }) {
  const create = useCreateUser();
  const form = useForm<FormValues>({
    defaultValues: EMPTY,
    resolver: schemaResolver<FormValues>(CreateUserInput, toInput, MESSAGES),
  });
  const { register, handleSubmit, setError, reset, watch, formState: { errors, isSubmitting } } = form;
  useEffect(() => {
    if (open) reset(EMPTY);
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await create.mutateAsync(CreateUserInput.parse(toInput(values)));
      onOpenChange(false);
      onCreated(result);
    } catch (e) {
      if (!applyServerFieldErrors(e, setError, { email: 'Email này đã được dùng cho tài khoản khác' })) {
        toast.error(errorMessage(e));
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thêm tài khoản</DialogTitle>
          <DialogDescription>Hệ thống tạo mật khẩu tạm và chỉ hiển thị một lần sau khi lưu.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <FormField label="Họ tên" required error={errors.fullName?.message}>
            {(p) => <Input {...p} {...register('fullName')} />}
          </FormField>
          <FormField label="Email" required error={errors.email?.message}>
            {(p) => <Input {...p} type="email" {...register('email')} />}
          </FormField>
          <FormField label="Số điện thoại" error={errors.phone?.message}>
            {(p) => <Input {...p} inputMode="tel" {...register('phone')} />}
          </FormField>
          <FormField label="Vai trò" required error={errors.role?.message}>
            {(p) => (
              <NativeSelect {...p} {...register('role')}>
                {CREATABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          {watch('role') === Role.TEACHER ? (
            <>
              <FormField label="Ngôn ngữ giảng dạy" hint="Cách nhau bằng dấu phẩy, ví dụ: Tiếng Anh, Tiếng Nhật">
                {(p) => <Input {...p} {...register('languages')} />}
              </FormField>
              <FormField label="Trình độ giảng dạy" hint="Cách nhau bằng dấu phẩy, ví dụ: A1, B1">
                {(p) => <Input {...p} {...register('levels')} />}
              </FormField>
              <FormField label="Chuyên môn">
                {(p) => <Input {...p} {...register('specialization')} />}
              </FormField>
            </>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" disabled={isSubmitting}>Tạo tài khoản</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
