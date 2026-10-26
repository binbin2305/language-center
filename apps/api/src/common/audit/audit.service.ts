import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AuditAction } from '@lc/shared';
import { Models } from '../../database/models';
import { AuditLog } from '../../database/schemas/audit-log.schema';
import { AuthUser } from '../auth/auth-user';
import { ClockService } from '../clock/clock.service';

export interface AuditEntry {
  actor: AuthUser;
  action: AuditAction;
  entity: string;
  entityId: Types.ObjectId;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(Models.AuditLog) private readonly logs: Model<AuditLog>,
    private readonly clock: ClockService,
  ) {}

  async log(e: AuditEntry, s?: ClientSession): Promise<void> {
    await this.logs.create(
      [
        {
          actorId: e.actor.id,
          actorRole: e.actor.role,
          action: e.action,
          entity: e.entity,
          entityId: e.entityId,
          before: e.before,
          after: e.after,
          at: this.clock.now(),
        },
      ],
      { session: s },
    );
  }
}
