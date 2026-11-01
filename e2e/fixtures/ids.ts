/** Unique suffix for data a spec creates, so re-runs and specs never collide (each run also gets a fresh DB, D29). */
export const runId: string = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
  .toString(36)
  .padStart(2, '0')}`;

/** 5 digits fixed for this run (seed-demo/seed-large use 07/08/09 prefixes; e2e uses 03). */
const RUN_DIGITS = String(Number.parseInt(runId, 36) % 100_000).padStart(5, '0');
let phoneSeq = 0;
let emailSeq = 0;

/** VN mobile `03` + 5 run digits + 3-digit counter: unique within a run (max 1000 per run, then throws). */
export const uniquePhone = (): string => {
  if (phoneSeq >= 1000) throw new Error('uniquePhone: more than 1000 phones in one run');
  const n = phoneSeq++;
  return `03${RUN_DIGITS}${String(n).padStart(3, '0')}`;
};

/** `<prefix>.<runId>.<n>@e2e.local` */
export const uniqueEmail = (p: string): string => `${p}.${runId}.${++emailSeq}@e2e.local`;
