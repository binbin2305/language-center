import { format } from 'date-fns';

/** `YYYY-MM-DD` -> local Date at midnight (undefined when empty/invalid). */
export function parseYmd(s?: string | null): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
export const toYmd = (d: Date) => format(d, 'yyyy-MM-dd');
export const displayYmd = (s?: string | null) => {
  const d = parseYmd(s);
  return d ? format(d, 'dd/MM/yyyy') : '';
};
