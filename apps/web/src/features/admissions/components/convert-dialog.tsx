import { useState } from 'react';
import { toast } from 'sonner';
import { DuplicatePersonDetails, type ConvertLeadResultDto, type LeadDto } from '@lc/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { useConvertLead } from '../hooks';
import { DuplicateDialog } from './duplicate-dialog';

export interface ConvertDialogProps {
  lead: LeadDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the success dialog is dismissed. */
  onDone?: () => void;
}

export function ConvertDialog({ lead, open, onOpenChange, onDone }: ConvertDialogProps) {
  const convert = useConvertLead(lead.id);
  const [duplicates, setDuplicates] = useState<DuplicatePersonDetails['duplicates'] | null>(null);
  const [result, setResult] = useState<ConvertLeadResultDto | null>(null);

  const run = (force: boolean) =>
    convert.mutate(force, {
      onSuccess: (r) => {
        setDuplicates(null);
        onOpenChange(false);
        setResult(r);
      },
      onError: (e) => {
        const parsed = e instanceof ApiError && e.code === 'DUPLICATE_PERSON'
          ? DuplicatePersonDetails.safeParse(e.details)
          : null;
        if (parsed?.success) {
          onOpenChange(false);
          setDuplicates(parsed.data.duplicates);
        } else {
          toast.error(errorMessage(e));
        }
      },
    });

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.tempPassword);
      toast.success('Đã sao chép mật khẩu');
    } catch {
      toast.error('Không sao chép được. Hãy chọn và sao chép thủ công.');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo hồ sơ học viên</DialogTitle>
            <DialogDescription>
              {`Tạo hồ sơ và tài khoản học viên cho ${lead.fullName} (${lead.phone}) từ thông tin đã tiếp nhận.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="button" disabled={convert.isPending} onClick={() => run(false)}>
              Tạo hồ sơ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DuplicateDialog
        open={duplicates !== null}
        onOpenChange={(o) => { if (!o) setDuplicates(null); }}
        duplicates={duplicates ?? []}
        forceLabel="Vẫn tạo hồ sơ"
        isPending={convert.isPending}
        onForce={() => run(true)}
      />

      <Dialog
        open={result !== null}
        onOpenChange={(o) => {
          if (!o) {
            setResult(null);
            onDone?.();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đã tạo hồ sơ học viên</DialogTitle>
            <DialogDescription>Gửi thông tin đăng nhập này cho học viên.</DialogDescription>
          </DialogHeader>
          {result ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Mã học viên</dt>
                <dd className="font-medium">{result.student.code}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Mật khẩu tạm</dt>
                <dd className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1">{result.tempPassword}</code>
                  <Button type="button" variant="outline" size="sm" aria-label="Sao chép mật khẩu" onClick={copy}>
                    Sao chép
                  </Button>
                </dd>
              </div>
            </dl>
          ) : null}
          <p role="note" className="rounded-md bg-warning/15 px-3 py-2 text-sm text-warning">
            Mật khẩu chỉ hiển thị một lần. Hãy sao chép trước khi đóng.
          </p>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                setResult(null);
                onDone?.();
              }}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
