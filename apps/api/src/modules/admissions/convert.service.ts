import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, isValidObjectId, Model } from 'mongoose';
import { AuditAction, ConvertLeadResultDto, ErrorCode, LeadStatus, removeVietnameseTones, vnDay } from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { CounterService } from '../../common/db/counter.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { Models } from '../../database/models';
import { Lead } from '../../database/schemas/lead.schema';
import { Student } from '../../database/schemas/student.schema';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { UsersService } from '../users/users.service';
import { StudentLean, toStudentDto } from './admissions.mapper';
import { DuplicatesService } from './duplicates.service';

@Injectable()
export class ConvertService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Models.Lead) private readonly leads: Model<Lead>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    private readonly duplicates: DuplicatesService,
    private readonly counters: CounterService,
    private readonly users: UsersService,
    private readonly enrollments: EnrollmentsService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  /** Throws the precise error for a lead that cannot be converted (404 / 409 / 422). */
  private async assertConvertible(id: string): Promise<void> {
    const lead = isValidObjectId(id) ? await this.leads.findOne({ _id: id, deletedAt: null }).lean() : null;
    if (!lead) throw new AppError(ErrorCode.LEAD_NOT_FOUND);
    if (lead.status === LeadStatus.PROFILE_CREATED || lead.studentId) throw new AppError(ErrorCode.PROFILE_EXISTS);
    if (lead.status !== LeadStatus.NEW) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
  }

  async convert(user: AuthUser, id: string, force: boolean): Promise<ConvertLeadResultDto> {
    await this.assertConvertible(id);
    if (!force) {
      const lead = await this.leads.findById(id).lean();
      const duplicates = await this.duplicates.find({ phone: lead!.phone, email: lead!.email }, { leadId: lead!._id });
      if (duplicates.length) {
        // A concurrent convert of this very lead may have created the matching student: report that instead.
        await this.assertConvertible(id);
        throw new AppError(ErrorCode.DUPLICATE_PERSON, undefined, { duplicates });
      }
    }

    const result = await withTransaction(this.conn, async (s) => {
      const lead = await this.leads
        .findOneAndUpdate(
          { _id: id, deletedAt: null, status: LeadStatus.NEW, studentId: null },
          { $set: { status: LeadStatus.PROFILE_CREATED } },
          { new: true, session: s },
        )
        .lean();
      if (!lead) {
        await this.assertConvertible(id);
        throw new AppError(ErrorCode.PROFILE_EXISTS);
      }

      const year = vnDay(this.clock.now()).slice(0, 4);
      const seq = await this.counters.next(`student:${year}`, s);
      const code = this.counters.formatCode('HV', year, seq, 5);

      const [student] = await this.students.create(
        [
          {
            code,
            fullName: lead.fullName,
            fullNameSearch: removeVietnameseTones(lead.fullName).toLowerCase().trim(),
            dob: lead.dob,
            gender: lead.gender,
            phone: lead.phone,
            email: lead.email ?? null,
            address: lead.address,
            note: lead.note,
            leadId: lead._id,
            createdBy: user.id,
          },
        ],
        { session: s },
      );
      const account = await this.users.createStudentAccount(student._id, code, s);
      student.userId = account.userId;
      await student.save({ session: s });
      await this.leads.updateOne({ _id: lead._id }, { $set: { studentId: student._id } }, { session: s });
      const enrollment = await this.enrollments.createPending(student._id, lead.interestedCourseId, user, s);
      await this.audit.log(
        { actor: user, action: AuditAction.CREATE, entity: 'student', entityId: student._id, after: student.toObject() },
        s,
      );
      return { student: student.toObject() as unknown as StudentLean, tempPassword: account.tempPassword, enrollmentId: enrollment._id };
    });

    return {
      student: toStudentDto(result.student),
      tempPassword: result.tempPassword,
      enrollmentId: result.enrollmentId.toString(),
    };
  }
}
