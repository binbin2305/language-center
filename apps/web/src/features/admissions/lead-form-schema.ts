import { z } from 'zod';
import { CreateLeadInput } from '@lc/shared';

/** Vietnamese messages for generic zod issues the shared schema leaves to the default map. */
export const leadErrorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === 'invalid_string' && issue.validation === 'email')
    return { message: 'Email không hợp lệ' };
  if (issue.code === 'too_big') return { message: 'Nội dung quá dài' };
  if (issue.code === 'invalid_enum_value' || issue.code === 'invalid_type')
    return { message: 'Vui lòng chọn một giá trị' };
  return { message: ctx.defaultError };
};

/** Blank input -> friendly "required" message, otherwise validated by the shared field schema. */
const required = <T extends z.ZodTypeAny>(message: string, field: T) =>
  z.string().trim().min(1, message).pipe(field);

const shape = CreateLeadInput.shape;

/** Form schema derived from the shared CreateLeadInput (fields are strings in the form). */
export const LeadFormSchema = z.object({
  fullName: required('Vui lòng nhập họ và tên', shape.fullName),
  dob: required('Vui lòng chọn ngày sinh', shape.dob),
  gender: shape.gender,
  phone: required('Vui lòng nhập số điện thoại', shape.phone),
  email: z
    .string()
    .trim()
    .transform((s) => (s === '' ? undefined : s))
    .pipe(shape.email),
  address: shape.address,
  interestedCourseId: required('Vui lòng chọn khóa học quan tâm', shape.interestedCourseId),
  note: shape.note,
});
export type LeadFormInput = z.input<typeof LeadFormSchema>;
export type LeadFormOutput = z.output<typeof LeadFormSchema>;
