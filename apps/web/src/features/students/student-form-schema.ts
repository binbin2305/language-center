import { z } from 'zod';
import { UpdateStudentContactInput, UpdateStudentInput } from '@lc/shared';

/** Vietnamese messages for generic zod issues the shared schemas leave to the default map. */
export const studentErrorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === 'invalid_string' && issue.validation === 'email')
    return { message: 'Email không hợp lệ' };
  if (issue.code === 'too_small' && issue.type === 'string')
    return { message: 'Vui lòng nhập họ và tên (tối thiểu 2 ký tự)' };
  if (issue.code === 'too_big') return { message: 'Nội dung quá dài' };
  if (issue.code === 'invalid_enum_value' || issue.code === 'invalid_type')
    return { message: 'Vui lòng chọn một giá trị' };
  return { message: ctx.defaultError };
};

const blankToNull = (s: string) => (s === '' ? null : s);
const edit = UpdateStudentInput.shape;
const contact = UpdateStudentContactInput.shape;

/** Edit form schema derived from the shared UpdateStudentInput (form fields are strings). */
export const StudentFormSchema = z.object({
  fullName: edit.fullName.unwrap(),
  dob: edit.dob.unwrap(),
  gender: edit.gender.unwrap(),
  phone: edit.phone.unwrap(),
  email: z.string().trim().transform(blankToNull).pipe(edit.email.unwrap()),
  address: edit.address.unwrap(),
  status: edit.status.unwrap(),
  note: edit.note.unwrap(),
});
export type StudentFormInput = z.input<typeof StudentFormSchema>;
export type StudentFormOutput = z.output<typeof StudentFormSchema>;

/** "Hồ sơ của tôi" form: phone / email / address only (UpdateStudentContactInput). */
export const ContactFormSchema = z.object({
  phone: contact.phone.unwrap(),
  email: z.string().trim().transform(blankToNull).pipe(contact.email.unwrap()),
  address: contact.address.unwrap(),
});
export type ContactFormInput = z.input<typeof ContactFormSchema>;
export type ContactFormOutput = z.output<typeof ContactFormSchema>;
