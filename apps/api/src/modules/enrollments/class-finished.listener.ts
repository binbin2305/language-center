import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { ClassFinishedPayload, DomainEvent, EnrollmentStatus } from '@lc/shared';
import { ClockService } from '../../common/clock/clock.service';
import { withTransaction } from '../../common/db/transaction';
import { Models } from '../../database/models';
import { Enrollment } from '../../database/schemas/enrollment.schema';

/** FR-CLS-10: finishing a class completes its ENROLLED students; currentSize is kept as the final headcount. */
@Injectable()
export class ClassFinishedListener {
  private readonly logger = new Logger(ClassFinishedListener.name);

  constructor(
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectConnection() private readonly conn: Connection,
    private readonly clock: ClockService,
  ) {}

  @OnEvent(DomainEvent.ClassFinished)
  async onClassFinished(p: ClassFinishedPayload): Promise<void> {
    try {
      await withTransaction(this.conn, (s) =>
        this.enrollments.updateMany(
          { classId: new Types.ObjectId(p.classId), status: EnrollmentStatus.ENROLLED },
          {
            $set: { status: EnrollmentStatus.COMPLETED },
            $push: {
              history: {
                from: EnrollmentStatus.ENROLLED,
                to: EnrollmentStatus.COMPLETED,
                at: p.at ?? this.clock.now(),
                by: new Types.ObjectId(p.actorId),
              },
            },
          },
          { session: s },
        ),
      );
    } catch (e) {
      this.logger.error(`class.finished handling failed for ${p.classId}`, e instanceof Error ? e.stack : String(e));
    }
  }
}
