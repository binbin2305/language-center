import { z } from 'zod';
import { BulkCreateSessionsInput } from '@lc/shared';

const REQUIRED: Record<string, string> = {
  classId: 'Chọn lớp học',
  roomId: 'Chọn phòng học',
  teacherId: 'Chọn giáo viên',
  date: 'Chọn ngày học',
  fromDate: 'Chọn ngày bắt đầu',
  toDate: 'Chọn ngày kết thúc',
  startTime: 'Nhập giờ bắt đầu',
  endTime: 'Nhập giờ kết thúc',
};

/** Vietnamese messages for empty required fields; other issues keep the shared schema's message. */
export const scheduleErrorMap: z.ZodErrorMap = (issue, ctx) => {
  const field = String(issue.path[0] ?? '');
  const empty = ctx.data === '' || ctx.data === undefined || ctx.data === null;
  if (empty && REQUIRED[field]) return { message: REQUIRED[field] };
  if (issue.code === 'too_small' && issue.type === 'array') return { message: 'Chọn ít nhất một thứ trong tuần' };
  return { message: ctx.defaultError };
};

/** zodResolver's schemaOptions type (ParseParams) wants all three keys. */
export const scheduleParseParams = { errorMap: scheduleErrorMap, path: [] as (string | number)[], async: false };

const timeOrder = (v: { startTime: string; endTime: string }, ctx: z.RefinementCtx) => {
  if (v.endTime <= v.startTime)
    ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Giờ kết thúc phải sau giờ bắt đầu' });
};

/** "Lặp lại" tab — the shared bulk input plus cross-field rules. */
export const RecurringFormSchema = BulkCreateSessionsInput.superRefine((v, ctx) => {
  timeOrder(v, ctx);
  if (v.toDate < v.fromDate)
    ctx.addIssue({ code: 'custom', path: ['toDate'], message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu' });
});
export type RecurringFormValues = z.infer<typeof RecurringFormSchema>;

/** "Một buổi" tab — date + times instead of the shared instants; composed into CreateSessionInput on submit. */
export const SingleFormSchema = BulkCreateSessionsInput.pick({
  classId: true, roomId: true, teacherId: true, startTime: true, endTime: true,
})
  .extend({ date: BulkCreateSessionsInput.shape.fromDate })
  .superRefine(timeOrder);
export type SingleFormValues = z.infer<typeof SingleFormSchema>;
