import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ALL_ASSESSMENT_TYPES, type AssessmentType } from '@lc/shared';
import { FormField } from '@/components/common/form-field';
import { OptionSelect } from '@/components/common/option-select';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { useCreateAssessment } from '../hooks';

const TYPE_LABELS: Record<AssessmentType, string> = {
  QUIZ: 'Kiểm tra nhanh',
  MIDTERM: 'Giữa kỳ',
  FINAL: 'Cuối kỳ',
  SKILL: 'Kỹ năng',
};

type Errors = Partial<Record<'name' | 'weight' | 'heldOn', string>>;

export function AssessmentFormDialog({
  classId, open, onOpenChange,
}: { classId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateAssessment(classId);
  const [name, setName] = useState('');
  const [type, setType] = useState<AssessmentType>('QUIZ');
  const [weight, setWeight] = useState('');
  const [heldOn, setHeldOn] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    if (open) {
      setName(''); setType('QUIZ'); setWeight(''); setHeldOn(''); setErrors({});
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weight);
    const next: Errors = {};
    if (!name.trim()) next.name = 'Nhập tên bài đánh giá.';
    if (!(w > 0 && w <= 100)) next.weight = 'Trọng số lớn hơn 0 và tối đa 100.';
    if (!heldOn) next.heldOn = 'Chọn ngày kiểm tra.';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await create.mutateAsync({ name: name.trim(), type, weight: w, heldOn });
      toast.success('Đã tạo bài đánh giá');
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WEIGHT_EXCEEDS_100') setErrors({ weight: errorMessage(err) });
      else if (err instanceof ApiError && err.details?.fields) setErrors(err.details.fields as Errors);
      else toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
          <DialogHeader>
            <DialogTitle>Thêm bài đánh giá</DialogTitle>
            <DialogDescription>Tổng trọng số các bài của lớp tối đa 100%.</DialogDescription>
          </DialogHeader>
          <FormField label="Tên bài" required error={errors.name}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
          </FormField>
          <FormField label="Loại" required>
            {(p) => (
              <OptionSelect
                {...p}
                value={type}
                onValueChange={(v) => setType(v as AssessmentType)}
                options={ALL_ASSESSMENT_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
              />
            )}
          </FormField>
          <FormField label="Trọng số (%)" required error={errors.weight}>
            {(p) => <Input {...p} type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} />}
          </FormField>
          <FormField label="Ngày kiểm tra" required error={errors.heldOn}>
            {(p) => <Input {...p} type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" disabled={create.isPending}>Lưu</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
