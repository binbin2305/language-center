import { z } from 'zod';
import { zDateTime } from './common';

export const UpdateSettingsInput = z
  .object({
    centerName: z.string().trim().min(1).max(150),
    attendanceWarningThreshold: z.number(),
    gradeLockDays: z.number().int(),
    resultViewRequiresPaidFees: z.boolean(),
    teacherAttendanceEditDays: z.number().int(),
    invoiceDueDaysAfterStart: z.number().int(),
  })
  .partial()
  .strict();
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>;

export const SettingsDto = z.object({
  centerName: z.string(),
  attendanceWarningThreshold: z.number(),
  gradeLockDays: z.number().int(),
  resultViewRequiresPaidFees: z.boolean(),
  teacherAttendanceEditDays: z.number().int(),
  invoiceDueDaysAfterStart: z.number().int(),
  updatedAt: zDateTime.optional(),
});
export type SettingsDto = z.infer<typeof SettingsDto>;
