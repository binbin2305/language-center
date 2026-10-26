import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <ShieldAlert className="h-10 w-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">Bạn không có quyền truy cập trang này</h1>
      <p className="text-sm text-muted-foreground">
        Liên hệ quản trị viên nếu bạn cần quyền xem nội dung này.
      </p>
      <Button asChild>
        <Link to="/">Về trang chủ</Link>
      </Button>
    </div>
  );
}
