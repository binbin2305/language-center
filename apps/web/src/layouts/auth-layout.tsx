import { Outlet } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';

/** Centered card layout for login and forced password change (no navigation). */
export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2 text-primary">
          <GraduationCap className="h-7 w-7" aria-hidden />
          <span className="text-lg font-semibold">Trung tâm Ngoại ngữ ABC</span>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
