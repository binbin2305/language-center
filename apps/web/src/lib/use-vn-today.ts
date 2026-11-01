import { useEffect, useState } from 'react';
import { addVnDays, startOfVnDay, vnDay } from '@lc/shared';

/** Current Vietnam calendar day ('YYYY-MM-DD'); re-renders once when 00:00 VN passes. */
export function useVnToday(): string {
  const [today, setToday] = useState(() => vnDay(new Date()));
  useEffect(() => {
    const now = new Date();
    const current = vnDay(now);
    if (current !== today) {
      setToday(current);
      return;
    }
    const ms = startOfVnDay(addVnDays(current, 1)).getTime() - now.getTime();
    const t = setTimeout(() => setToday(vnDay(new Date())), Math.max(ms, 0) + 50);
    return () => clearTimeout(t);
  }, [today]);
  return today;
}
