import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Không tải được dữ liệu',
  description = 'Có lỗi xảy ra. Kiểm tra kết nối rồi thử lại.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <p className="text-base font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-2" onClick={onRetry}>
          Thử lại
        </Button>
      ) : null}
    </div>
  );
}
