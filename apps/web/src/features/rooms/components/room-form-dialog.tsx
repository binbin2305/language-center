import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CreateRoomInput, UpdateRoomInput, type RoomDto } from '@lc/shared';
import { FormField } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/error-messages';
import { NativeSelect } from '@/features/settings/components/native-select';
import { applyServerFieldErrors, schemaResolver, toNumber } from '@/features/settings/form-utils';
import { useCreateRoom, useUpdateRoom } from '../hooks';

interface FormValues {
  code: string;
  name: string;
  capacity: string;
  status: 'ACTIVE' | 'INACTIVE';
}

const EMPTY: FormValues = { code: '', name: '', capacity: '', status: 'ACTIVE' };

const toInput = (v: FormValues) => ({
  code: v.code,
  name: v.name,
  capacity: toNumber(v.capacity),
  status: v.status,
});
const omitCode = (input: ReturnType<typeof toInput>) =>
  Object.fromEntries(Object.entries(input).filter(([k]) => k !== 'code'));

const MESSAGES = {
  code: 'Nhập mã phòng (tối đa 30 ký tự).',
  name: 'Nhập tên phòng.',
  capacity: 'Sức chứa phải là số nguyên lớn hơn 0.',
};

export function RoomFormDialog({
  open, onOpenChange, room,
}: { open: boolean; onOpenChange: (o: boolean) => void; room: RoomDto | null }) {
  const editing = room !== null;
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const form = useForm<FormValues>({
    defaultValues: EMPTY,
    resolver: schemaResolver<FormValues>(editing ? UpdateRoomInput : CreateRoomInput, (v) => {
      const input = toInput(v);
      return editing ? omitCode(input) : input;
    }, MESSAGES),
  });
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = form;

  useEffect(() => {
    if (open) {
      reset(room ? { code: room.code, name: room.name, capacity: String(room.capacity), status: room.status } : EMPTY);
    }
  }, [open, room, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const input = toInput(values);
    try {
      if (room) {
        await update.mutateAsync({ id: room.id, input: UpdateRoomInput.parse(omitCode(input)) });
        toast.success(`Đã cập nhật phòng ${room.code}`);
      } else {
        const parsed = CreateRoomInput.parse(input);
        await create.mutateAsync(parsed);
        toast.success(`Đã tạo phòng ${parsed.code}`);
      }
      onOpenChange(false);
    } catch (e) {
      if (!applyServerFieldErrors(e, setError, { code: 'Mã phòng đã tồn tại' })) toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Sửa phòng học' : 'Thêm phòng học'}</DialogTitle>
          <DialogDescription>Mã phòng không đổi được sau khi tạo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <FormField label="Mã" required error={errors.code?.message}>
            {(p) => <Input {...p} {...register('code')} disabled={editing} />}
          </FormField>
          <FormField label="Tên phòng" required error={errors.name?.message}>
            {(p) => <Input {...p} {...register('name')} />}
          </FormField>
          <FormField label="Sức chứa" required error={errors.capacity?.message}>
            {(p) => <Input {...p} inputMode="numeric" {...register('capacity')} />}
          </FormField>
          <FormField label="Trạng thái">
            {(p) => (
              <NativeSelect {...p} {...register('status')}>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Ngừng hoạt động</option>
              </NativeSelect>
            )}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" disabled={isSubmitting}>Lưu</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
