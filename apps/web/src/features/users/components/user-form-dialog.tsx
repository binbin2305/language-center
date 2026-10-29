import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { CreateUserInput, TeacherProfile, type CreateUserResultDto } from '@lc/shared';
import { FormField } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/error-messages';
import { OptionSelect } from '@/components/common/option-select';
import { applyServerFieldErrors, viParams } from '@/lib/forms';
import { useCreateUser } from '../hooks';
import { CREATABLE_ROLES, hasTeacherProfile, ROLE_LABELS } from '../roles';

const csv = (shape: z.ZodTypeAny) =>
  z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).pipe(shape);

// Teacher profile fields are edited as flat text and re-assembled on submit.
const FormSchema = CreateUserInput.omit({ teacherProfile: true }).extend({
  phone: CreateUserInput.shape.phone.or(z.literal('')),
  languages: csv(TeacherProfile.shape.languages),
  levels: csv(TeacherProfile.shape.levels),
  specialization: z.string().trim().max(200),
});
type FormInput = z.input<typeof FormSchema>;
type FormOutput = z.output<typeof FormSchema>;

const MESSAGES = {
  fullName: 'Nhập họ tên (ít nhất 2 ký tự).',
  email: 'Nhập email hợp lệ, ví dụ ten@trungtam.vn.',
  phone: 'Số điện thoại chưa đúng. Nhập số di động Việt Nam, ví dụ 0912345678.',
  role: 'Chọn vai trò.',
  specialization: 'Chuyên môn quá dài (tối đa 200 ký tự).',
};
const ROLE_OPTIONS = CREATABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
const EMPTY: Partial<FormInput> = {
  fullName: '', email: '', phone: '', role: CREATABLE_ROLES[0], languages: '', levels: '', specialization: '',
};

export function UserFormDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (r: CreateUserResultDto) => void }) {
  const create = useCreateUser();
  const { register, control, handleSubmit, setError, reset, watch, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormOutput>({
    defaultValues: EMPTY,
    resolver: zodResolver(FormSchema, viParams(MESSAGES)),
  });
  useEffect(() => {
    if (open) reset(EMPTY);
  }, [open, reset]);

  const onSubmit = handleSubmit(async ({ languages, levels, specialization, phone, ...base }) => {
    try {
      const result = await create.mutateAsync({
        ...base,
        phone: phone || undefined,
        ...(hasTeacherProfile(base.role)
          ? { teacherProfile: { languages, levels, specialization: specialization || undefined } }
          : {}),
      });
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
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <OptionSelect {...p} options={ROLE_OPTIONS} value={field.value ?? ''} onValueChange={field.onChange} />
                )}
              />
            )}
          </FormField>
          {hasTeacherProfile(watch('role')) ? (
            <>
              <FormField label="Ngôn ngữ giảng dạy" hint="Cách nhau bằng dấu phẩy, ví dụ: Tiếng Anh, Tiếng Nhật">
                {(p) => <Input {...p} {...register('languages')} />}
              </FormField>
              <FormField label="Trình độ giảng dạy" hint="Cách nhau bằng dấu phẩy, ví dụ: A1, B1">
                {(p) => <Input {...p} {...register('levels')} />}
              </FormField>
              <FormField label="Chuyên môn" error={errors.specialization?.message}>
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
