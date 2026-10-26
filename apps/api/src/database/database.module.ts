import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Models } from './models';
import { AssessmentSchema } from './schemas/assessment.schema';
import { AttendanceSchema } from './schemas/attendance.schema';
import { AttendanceWarningSchema } from './schemas/attendance-warning.schema';
import { AuditLogSchema } from './schemas/audit-log.schema';
import { ClassSchema } from './schemas/class.schema';
import { CounterSchema } from './schemas/counter.schema';
import { CourseSchema } from './schemas/course.schema';
import { EnrollmentSchema } from './schemas/enrollment.schema';
import { GradeSchema } from './schemas/grade.schema';
import { InvoiceSchema } from './schemas/invoice.schema';
import { LeadSchema } from './schemas/lead.schema';
import { NotificationSchema } from './schemas/notification.schema';
import { PaymentSchema } from './schemas/payment.schema';
import { PlacementTestSchema } from './schemas/placement-test.schema';
import { RefreshTokenSchema } from './schemas/refresh-token.schema';
import { RoomSchema } from './schemas/room.schema';
import { SessionSchema } from './schemas/session.schema';
import { SettingsSchema } from './schemas/settings.schema';
import { StudentSchema } from './schemas/student.schema';
import { UserSchema } from './schemas/user.schema';

const features = MongooseModule.forFeature([
  { name: Models.User, schema: UserSchema },
  { name: Models.RefreshToken, schema: RefreshTokenSchema },
  { name: Models.Course, schema: CourseSchema },
  { name: Models.Room, schema: RoomSchema },
  { name: Models.Lead, schema: LeadSchema },
  { name: Models.Student, schema: StudentSchema },
  { name: Models.Counter, schema: CounterSchema },
  { name: Models.Enrollment, schema: EnrollmentSchema },
  { name: Models.PlacementTest, schema: PlacementTestSchema },
  { name: Models.Class, schema: ClassSchema },
  { name: Models.Session, schema: SessionSchema },
  { name: Models.Attendance, schema: AttendanceSchema },
  { name: Models.AttendanceWarning, schema: AttendanceWarningSchema },
  { name: Models.Assessment, schema: AssessmentSchema },
  { name: Models.Grade, schema: GradeSchema },
  { name: Models.Invoice, schema: InvoiceSchema },
  { name: Models.Payment, schema: PaymentSchema },
  { name: Models.Notification, schema: NotificationSchema },
  { name: Models.AuditLog, schema: AuditLogSchema },
  { name: Models.Settings, schema: SettingsSchema },
]);

@Global()
@Module({ imports: [features], exports: [features] })
export class DatabaseModule {}
