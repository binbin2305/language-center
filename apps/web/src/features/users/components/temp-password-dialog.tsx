import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export function TempPasswordDialog({
  tempPassword, accountName, onClose,
}: { tempPassword: string | null; accountName: string; onClose: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword ?? '');
      toast.success('Đã sao chép mật khẩu tạm');
    } catch {
      toast.error('Không sao chép được. Hãy chọn và sao chép mật khẩu thủ công.');
    }
  };
  return (
    <Dialog open={tempPassword !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mật khẩu tạm</DialogTitle>
          <DialogDescription>
            Mật khẩu tạm của {accountName} chỉ hiển thị một lần. Gửi cho người dùng; họ sẽ phải đổi mật khẩu khi đăng nhập.
          </DialogDescription>
        </DialogHeader>
        <p className="select-all rounded-md border bg-muted px-3 py-2 text-center font-mono text-lg tracking-wider" data-testid="temp-password">
          {tempPassword}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={copy}>
            <Copy className="mr-2 h-4 w-4" />
            Sao chép
          </Button>
          <Button type="button" onClick={onClose}>Đã lưu lại</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
