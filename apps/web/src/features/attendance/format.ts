import { formatInTimeZone } from 'date-fns-tz';
import { VN_TZ } from '@lc/shared';

const WEEKDAYS = ['', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

/** "18:05 14/01" in Vietnam time. */
export const formatShortDateTime = (iso: string) => formatInTimeZone(new Date(iso), VN_TZ, 'HH:mm dd/MM');

/** "Thứ 3 14/01 18:00" in Vietnam time. */
export const formatSessionStart = (iso: string) => {
  const d = new Date(iso);
  return `${WEEKDAYS[Number(formatInTimeZone(d, VN_TZ, 'i'))]} ${formatInTimeZone(d, VN_TZ, 'dd/MM HH:mm')}`;
};
