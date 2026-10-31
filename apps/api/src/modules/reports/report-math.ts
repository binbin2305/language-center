/** Shared rounding for report ratios and averages (D26). */
export const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;
export const round2 = (x: number): number => Math.round(x * 100) / 100;
/** num / den rounded to 4 decimals; 0 when den is 0 (never NaN). */
export const rate = (num: number, den: number): number => (den === 0 ? 0 : round4(num / den));
