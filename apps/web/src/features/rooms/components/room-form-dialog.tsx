import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { z } from 'zod';
import { CreateRoomInput, RoomStatus, type RoomDto } from '@lc/shared';
import { FormField } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/error-messages';
import {
  applyServerFieldErrors, catalogStatusLabel, OptionSelect, viParams,
} from '@/features/settings/catalog-shared';
import { useCreateRoom, useUpdateRoom } from '../hooks';

type FormInput = z.input<typeof CreateRoomInput>;
type FormOutput = z.output<typeof CreateRoomInput>;

const MESSAGES = {
  code: 'Nhập mã phòng (tối đa 30 ký tự).',
  name: 'Nhập tên phòng.',
  capacity: 'Sức chứa phải là số nguyên lớn hơn 0.',
};
const STATUS_OPTIONS = [RoomStatus.ACTIVE, RoomStatus.INACTIVE].map((s) => ({ value: s, label: catalogStatusLabel(s) }));
const EMPTY: Partial<FormInput> = { code: '', name: '', status: RoomStatus.ACTIVE };

export function RoomFormDialog({
  open, onOpenChange, room,
}: { open: boolean; onOpenChange: (o: boolean) => void; room: RoomDto | null }) {
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const { register, control, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormOutput>({
    defaultValues: EMPTY,
    resolver: zodResolver(CreateRoomInput, viParams(MESSAGES)),
  });

  useEffect(() => {
    if (open) reset(room ? { code: room.code, name: room.name, capacity: room.capacity, status: room.status } : EMPTY);
  }, [open, room, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (room) {
        // code is immutable: the strict update schema on the server rejects it
        const { code, ...rest } = values;
        void code;
        await update.mutateAsync({ id: room.id, input: rest });
        toast.success(`Đã cập nhật phòng ${room.code}`);
      } else {
        await create.mutateAsync(values);
        toast.success(`Đã tạo phòng ${values.code}`);
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
          <DialogTitle>{room ? 'Sửa phòng học' : 'Thêm phòng học'}</DialogTitle>
          <DialogDescription>Mã phòng không đổi được sau khi tạo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <FormField label="Mã" required error={errors.code?.message}>
            {(p) => <Input {...p} {...register('code')} readOnly={room !== null} />}
          </FormField>
          <FormField label="Tên phòng" required error={errors.name?.message}>
            {(p) => <Input {...p} {...register('name')} />}
          </FormField>
          <FormField label="Sức chứa" required error={errors.capacity?.message}>
            {(p) => <Input {...p} inputMode="numeric" {...register('capacity', { valueAsNumber: true })} />}
          </FormField>
          <FormField label="Trạng thái">
            {(p) => (
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <OptionSelect {...p} options={STATUS_OPTIONS} value={field.value ?? RoomStatus.ACTIVE} onValueChange={field.onChange} />
                )}
              />
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
