import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { can, type StudentDocumentDto } from '@lc/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/auth/use-auth';
import { ERROR_MESSAGES, errorMessage } from '@/lib/error-messages';
import { formatDateTime } from '@/lib/format';
import { studentsApi, isFullView } from '../api';
import { useDeleteDocument, useStudent, useUploadDocument } from '../hooks';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Tab "Giấy tờ" (M, S): list, upload (png/jpeg/pdf, <= 5MB), download, delete. */
export default function StudentDocumentsTab() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const student = useStudent(id);
  const upload = useUploadDocument(id);
  const remove = useDeleteDocument(id);
  const input = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<StudentDocumentDto | null>(null);
  const canEdit = can(user, 'students.update');

  if (student.isLoading) return <Skeleton className="h-40 w-full" />;
  if (student.isError || !student.data || !isFullView(student.data))
    return <ErrorState onRetry={() => void student.refetch()} />;
  const documents = student.data.documents;

  const onPick = (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    // Validate before any request: the server enforces the same limits (FR-ADM-06).
    if (file.size > MAX_BYTES) return setFileError(ERROR_MESSAGES.FILE_TOO_LARGE + ' (tối đa 5MB)');
    if (!ALLOWED_TYPES.includes(file.type)) return setFileError(ERROR_MESSAGES.FILE_TYPE_NOT_ALLOWED + ' (PNG, JPEG hoặc PDF)');
    upload.mutate(file, {
      onSuccess: () => toast.success('Đã tải giấy tờ lên'),
      onError: (e) => setFileError(errorMessage(e)),
    });
  };

  const download = async (doc: StudentDocumentDto) => {
    try {
      const blob = await studentsApi.downloadDocument(id, doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="space-y-1.5">
          <label htmlFor="student-doc-upload" className="text-sm font-medium">
            Tải giấy tờ lên
          </label>
          <Input
            id="student-doc-upload"
            ref={input}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            disabled={upload.isPending}
            className="max-w-sm"
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              if (input.current) input.current.value = '';
            }}
          />
          <p className="text-sm text-muted-foreground">PNG, JPEG hoặc PDF, tối đa 5MB.</p>
          {fileError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {fileError}
            </p>
          ) : null}
        </div>
      ) : null}
      {documents.length === 0 ? (
        <EmptyState title="Chưa có giấy tờ" description="Tải lên CCCD, ảnh hoặc giấy tờ liên quan của học viên." />
      ) : (
        <ul className="divide-y rounded-md border">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-medium">{d.fileName}</p>
                <p className="text-muted-foreground">
                  {`${sizeLabel(d.size)} · ${formatDateTime(d.uploadedAt)}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" aria-label={`Tải xuống ${d.fileName}`} onClick={() => void download(d)}>
                  Tải xuống
                </Button>
                {canEdit ? (
                  <Button size="sm" variant="outline" aria-label={`Xóa ${d.fileName}`} onClick={() => setToDelete(d)}>
                    Xóa
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title="Xóa giấy tờ?"
        description={toDelete ? `Giấy tờ "${toDelete.fileName}" sẽ bị xóa khỏi hồ sơ.` : ''}
        confirmLabel="Xóa"
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (!toDelete) return;
          remove.mutate(toDelete.id, {
            onSuccess: () => toast.success('Đã xóa giấy tờ'),
            onError: (e) => toast.error(errorMessage(e)),
            onSettled: () => setToDelete(null),
          });
        }}
      />
    </div>
  );
}
