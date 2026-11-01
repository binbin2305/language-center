/** Unique suffix for data a spec creates, so re-runs and specs never collide (each run also gets a fresh DB, D29). */
export const runId: string = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
  .toString(36)
  .padStart(2, '0')}`;

let seq = 0;

/** Vietnamese mobile number (0 + 9 digits), unique within this run. */
export const uniquePhone = (): string => {
  seq += 1;
  const n = (Date.now() * 100 + seq) % 1_000_000_00;
  return `08${String(n).padStart(8, '0')}`;
};

/** `<prefix>.<runId>.<seq>@e2e.local` */
export const uniqueEmail = (p: string): string => {
  seq += 1;
  return `${p}.${runId}.${seq}@e2e.local`;
};
