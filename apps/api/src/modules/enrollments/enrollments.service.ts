import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AuditAction, EnrollmentStatus, ErrorCode } from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { AppError } from '../../common/errors/app-error';
import { ACTIVE_ENROLLMENT_STATUSES } from '../../database/active-enrollment';
import { Models } from '../../database/models';
import { Enrollment, EnrollmentDoc } from '../../database/schemas/enrollment.schema';

const DUPLICATE_KEY = 11000;

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
  ) {}

  async createPending(
    studentId: Types.ObjectId,
    courseId: Types.ObjectId,
    actor: AuthUser,
    s?: ClientSession,
  ): Promise<EnrollmentDoc> {
    const active = await this.enrollments.exists({ studentId, courseId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } }).session(s ?? null);
    if (active) throw new AppError(ErrorCode.ENROLLMENT_EXISTS);

    let created: EnrollmentDoc;
    try {
      [created] = await this.enrollments.create(
        [
          {
            studentId,
            courseId,
            status: EnrollmentStatus.PENDING_PLACEMENT,
            history: [{ from: null, to: EnrollmentStatus.PENDING_PLACEMENT, at: this.clock.now(), by: actor.id }],
          },
        ],
        { session: s },
      );
    } catch (e) {
      // The partial unique index is the authority when two requests race past the check above.
      if ((e as { code?: number }).code === DUPLICATE_KEY) throw new AppError(ErrorCode.ENROLLMENT_EXISTS);
      throw e;
    }
    await this.audit.log(
      { actor, action: AuditAction.CREATE, entity: 'enrollment', entityId: created._id, after: created.toObject() },
      s,
    );
    return created;
  }
}
