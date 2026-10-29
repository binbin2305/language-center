import { Link } from 'react-router-dom';
import type { DuplicateMatchDto } from '@lc/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export interface DuplicateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: DuplicateMatchDto[];
  /** Label of the "save anyway" action, e.g. "Vẫn lưu lead mới". */
  forceLabel: string;
  isPending?: boolean;
  onForce: () => void;
}

const MATCHED: Record<'phone' | 'email', string> = { phone: 'SĐT', email: 'email' };

export function DuplicateDialog({ open, onOpenChange, duplicates, forceLabel, isPending, onForce }: DuplicateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Có thể đã tồn tại</DialogTitle>
          <DialogDescription>
            Đã có hồ sơ trùng số điện thoại hoặc email. Kiểm tra trước khi tiếp tục.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {duplicates.map((d) => (
            <li key={`${d.kind}-${d.id}`} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
              <div className="space-y-0.5">
                <p className="font-medium">{d.fullName}</p>
                <p className="text-muted-foreground">
                  {d.phone}
                  {d.kind === 'STUDENT' && d.code ? ` · Mã HV ${d.code}` : ' · Lead'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {`Trùng ${d.matchedOn.map((m) => MATCHED[m]).join(', ')}`}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={d.kind === 'STUDENT' ? `/students/${d.id}` : `/admissions/leads/${d.id}`}>
                  {d.kind === 'STUDENT' ? 'Xem hồ sơ' : 'Xem lead'}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Quay lại
          </Button>
          <Button type="button" disabled={isPending} onClick={onForce}>
            {forceLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
