import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginInput } from '@lc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { formatTime } from '@/lib/format';
import { useAuth } from '@/auth/use-auth';
import { PasswordInput } from '../components/password-input';

function loginErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'INVALID_CREDENTIALS') return 'Sai thông tin đăng nhập';
    const until = e.details?.lockedUntil;
    if (e.code === 'ACCOUNT_LOCKED' && typeof until === 'string')
      return `Tài khoản tạm khóa đến ${formatTime(until)}`;
  }
  return errorMessage(e);
}

export default function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(LoginInput),
    defaultValues: { username: '', password: '' },
  });

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={user.mustChangePassword ? '/change-password' : (from ?? '/')} replace />;
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values);
    } catch (e) {
      setError(loginErrorMessage(e));
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <h1 className="text-xl font-semibold">Đăng nhập</h1>
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email hoặc mã học viên</FormLabel>
              <FormControl>
                <Input
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mật khẩu</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          Đăng nhập
        </Button>
      </form>
    </Form>
  );
}
