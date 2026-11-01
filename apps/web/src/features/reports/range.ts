import { vnDay } from '@lc/shared';

export type Preset = 'month' | 'quarter' | 'year' | 'custom';

export const PRESETS: { value: Preset; label: string }[] = [
  { value: 'month', label: 'Tháng này' },
  { value: 'quarter', label: 'Quý này' },
  { value: 'year', label: 'Năm nay' },
  { value: 'custom', label: 'Tùy chọn' },
];

/** Preset range in VN calendar days, ending today. */
export function presetRange(preset: Exclude<Preset, 'custom'>, now: Date): { from: string; to: string } {
  const today = vnDay(now);
  const [y, m] = today.split('-');
  const firstMonth = preset === 'month' ? Number(m) : preset === 'quarter' ? Math.floor((Number(m) - 1) / 3) * 3 + 1 : 1;
  return { from: `${y}-${String(firstMonth).padStart(2, '0')}-01`, to: today };
}

