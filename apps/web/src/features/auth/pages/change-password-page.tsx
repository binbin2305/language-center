import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChangePasswordInput, type AuthResultDto } from '@lc/shared';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ApiError, apiPost } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { useAuth } from '@/auth/use-auth';
import { PasswordInput } from '../components/password-input';

const NEW_PASSWORD_MESSAGE = 'Mật khẩu mới cần ít nhất 8 ký tự, gồm cả chữ và số';

const FormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'),
    newPassword: ChangePasswordInput.shape.newPassword,
    confirmPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.confirmPassword !== v.newPassword)
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Mật khẩu nhập lại không khớp',
      });
  });
type FormValues = z.infer<typeof FormSchema>;

export default function ChangePasswordPage() {
  const { user, applySession, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: async (values, ctx, opts) => {
      const res = await zodResolver(FormSchema)(values, ctx, opts);
      // shared zPassword messages are developer-facing; show one Vietnamese sentence instead
      if (res.errors.newPassword) res.errors.newPassword.message = NEW_PASSWORD_MESSAGE;
      return res;
    },
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const result = await apiPost<AuthResultDto>('auth/change-password', {
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      });
      applySession(result);
      toast.success('Đã đổi mật khẩu');
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS')
        form.setError('currentPassword', { message: 'Mật khẩu hiện tại không đúng' });
      else setError(errorMessage(e));
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <h1 className="text-xl font-semibold">Đổi mật khẩu</h1>
          {user?.mustChangePassword && (
            <p className="mt-1 text-sm text-muted-foreground">
              Bạn cần đặt mật khẩu mới trước khi sử dụng hệ thống.
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {(
          [
            ['currentPassword', 'Mật khẩu hiện tại', 'current-password'],
            ['newPassword', 'Mật khẩu mới', 'new-password'],
            ['confirmPassword', 'Nhập lại mật khẩu mới', 'new-password'],
          ] as const
        ).map(([name, label, autoComplete]) => (
          <FormField
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{label}</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete={autoComplete} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          Đổi mật khẩu
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => void logout()}>
          Đăng xuất
        </Button>
      </form>
    </Form>
  );
}
