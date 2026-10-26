import { formatInTimeZone } from 'date-fns-tz';
import { VN_TZ } from '@lc/shared';

export { formatVnd } from '@lc/shared';

type DateInput = Date | string;

const fmt = (d: DateInput, pattern: string) =>
  formatInTimeZone(typeof d === 'string' ? new Date(d) : d, VN_TZ, pattern);

/** dd/MM/yyyy in Vietnam time. */
export const formatDate = (d: DateInput) => fmt(d, 'dd/MM/yyyy');
/** HH:mm dd/MM/yyyy in Vietnam time. */
export const formatDateTime = (d: DateInput) => fmt(d, 'HH:mm dd/MM/yyyy');
/** HH:mm in Vietnam time. */
export const formatTime = (d: DateInput) => fmt(d, 'HH:mm');
