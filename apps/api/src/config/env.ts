import { z } from 'zod';

/** Express `trust proxy`: 'true'/'false', a hop count, or an address/subnet list. Default false. */
const TrustProxy = z
  .string()
  .optional()
  .transform((v): boolean | number | string => {
    const t = v?.trim() ?? '';
    if (t === '' || t === 'false') return false;
    if (t === 'true') return true;
    return /^\d+$/.test(t) ? Number(t) : t;
  });

const EnvSchema = z.object({
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  // Reserved, unused: refresh tokens are opaque random values stored as sha256.
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  TRUST_PROXY: TrustProxy,
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  /** D30: ISO-8601 instant with offset (e.g. 2026-11-02T13:00:00Z); ignored when NODE_ENV=production. */
  APP_CLOCK_START: z.preprocess((v) => (v === '' ? undefined : v), z.string().datetime({ offset: true }).optional()),
});
export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const names = Object.keys(parsed.error.flatten().fieldErrors).join(', ');
    throw new Error(`Invalid environment configuration: ${names}`);
  }
  return parsed.data;
}
