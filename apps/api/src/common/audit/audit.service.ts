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

const SECRET_KEYS = new Set(['passwordHash', 'tokenHash']);

/** Deep copy without secret keys; leaves non-plain values (ObjectId, Date) untouched. */
function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !SECRET_KEYS.has(k))
        .map(([k, x]) => [k, redact(x)]),
    );
  }
  return v;
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
          before: redact(e.before),
          after: redact(e.after),
          at: this.clock.now(),
        },
      ],
      { session: s },
    );
  }
}
