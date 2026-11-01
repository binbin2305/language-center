/** Demo accounts created by `pnpm --filter api seed:demo --reset` (apps/api/scripts/seed-demo.ts). */
export interface Account {
  username: string;
  password: string;
}

const DEMO_PASSWORD = 'Password1';
const acc = (username: string): Account => ({ username, password: DEMO_PASSWORD });

export const ACCOUNTS = {
  manager: acc('manager@center.local'),
  staff1: acc('staff1@center.local'),
  staff2: acc('staff2@center.local'),
  teacher1: acc('teacher1@center.local'),
  teacher2: acc('teacher2@center.local'),
  teacher3: acc('teacher3@center.local'),
  teacher4: acc('teacher4@center.local'),
  teacher5: acc('teacher5@center.local'),
  admin: acc('admin@center.local'),
} as const satisfies Record<string, Account>;

/** D30: api APP_CLOCK_START and the browser clock (20:00 VN, Monday — every seeded session today has started). */
export const CLOCK_START = '2026-11-02T13:00:00Z';
/** seed-demo DEMO_TODAY (VN date of CLOCK_START). */
export const DEMO_TODAY = '2026-11-02';
