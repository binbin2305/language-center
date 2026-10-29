import { z } from 'zod';
import { zObjectId } from './common';

/** One existing lead/student that matches a new person by phone and/or email (D3). */
export const DuplicateMatchDto = z.object({
  kind: z.enum(['LEAD', 'STUDENT']),
  id: zObjectId,
  fullName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  code: z.string().optional(), // student code
  status: z.string(),
  matchedOn: z.array(z.enum(['phone', 'email'])).min(1),
});
export type DuplicateMatchDto = z.infer<typeof DuplicateMatchDto>;

/** AppError details of DUPLICATE_PERSON. */
export const DuplicatePersonDetails = z.object({ duplicates: z.array(DuplicateMatchDto) });
export type DuplicatePersonDetails = z.infer<typeof DuplicatePersonDetails>;
