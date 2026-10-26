import { z } from 'zod';

/** 24-hex Mongo ObjectId string. */
export const zObjectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ObjectId không hợp lệ');

/** VN phone: accepts 0xxxxxxxxx or +84xxxxxxxxx (spaces/dots/dashes stripped); output normalised to 0xxxxxxxxx. */
export const zVnPhone = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s.-]/g, ''))
  .refine((s) => /^(0|\+84)\d{9,10}$/.test(s), 'Số điện thoại không hợp lệ')
  .transform((s) => (s.startsWith('+84') ? `0${s.slice(3)}` : s));

/** Integer VND >= 0. */
export const zMoney = z.number().int().nonnegative();

/** Score shape only (number | null). Scale 0-10 step 0.25 is checked in services (isValidScore). */
export const zScoreShape = z.number().nullable();

/** YYYY-MM-DD, must be a real calendar date. */
export const zDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Ngày không hợp lệ');

/** HH:mm 24h. */
export const zTimeHHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:mm');

/** ISO-8601 instant (UTC `Z` or with offset). */
export const zDateTime = z.string().datetime({ offset: true });

export const zEmail = z.string().trim().toLowerCase().email();

/** Weekday ISO: 1=Monday .. 7=Sunday. */
export const zWeekday = z.number().int().min(1).max(7);

/** Boolean from query string ('true'|'false'|'1'|'0'); z.coerce.boolean would treat "false" as true. */
export const zBoolQuery = z.preprocess(
  (v) => (v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : v),
  z.boolean(),
);

/** Free-text reason shape. Required-ness by context (REASON_REQUIRED) is a service rule. */
export const zReason = z.string().trim().max(500);

/** ?page=1&limit=20&sort=-createdAt */
export const zPagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().trim().min(1).max(50).optional(),
});
export type Pagination = z.infer<typeof zPagination>;

export const PageMeta = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
});
export type PageMeta = z.infer<typeof PageMeta>;

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** Envelope schema for list responses: `{ data: T[], meta }`. */
export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ data: z.array(item), meta: PageMeta });

/** Envelope schema for single responses: `{ data: T }`. */
export const envelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item });

/** Common DTO base fields. */
export const zDtoBase = {
  id: zObjectId,
  createdAt: zDateTime,
  updatedAt: zDateTime,
};

export const IdParam = z.object({ id: zObjectId });
export type IdParam = z.infer<typeof IdParam>;
