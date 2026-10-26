import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const VN_TZ = 'Asia/Ho_Chi_Minh';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseDay(day: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) throw new RangeError(`Invalid day: ${day}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== day) throw new RangeError(`Invalid day: ${day}`);
  return d;
}

/** 'YYYY-MM-DD' of the instant in Vietnam time. */
export function vnDay(d: Date): string {
  return formatInTimeZone(d, VN_TZ, 'yyyy-MM-dd');
}

export function startOfVnDay(day: string): Date {
  parseDay(day);
  return fromZonedTime(`${day}T00:00:00`, VN_TZ);
}

export function addVnDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isSameVnDay(a: Date, b: Date): boolean {
  return vnDay(a) === vnDay(b);
}

export function vnDateTime(day: string, hhmm: string): Date {
  parseDay(day);
  if (!HHMM_RE.test(hhmm)) throw new RangeError(`Invalid time: ${hhmm}`);
  return fromZonedTime(`${day}T${hhmm}:00`, VN_TZ);
}
