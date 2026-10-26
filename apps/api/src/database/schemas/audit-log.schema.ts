import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_ROLES, Role } from '@lc/shared';
import { Models } from '../models';

export const AuditAction = { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', STATUS: 'status' } as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditLog {
  actorId: Types.ObjectId;
  actorRole: Role;
  action: AuditAction;
  entity: string;
  entityId: Types.ObjectId;
  before?: unknown;
  after?: unknown;
  at: Date;
}

// Append-only: written, never updated or deleted.
export const AuditLogSchema = new Schema<AuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: Models.User, required: true },
    actorRole: { type: String, enum: ALL_ROLES, required: true },
    action: { type: String, enum: Object.values(AuditAction), required: true },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    at: { type: Date, required: true },
  },
  { timestamps: true, collection: 'audit_logs' },
);
AuditLogSchema.index({ entity: 1, entityId: 1, at: -1 });

export type AuditLogDoc = HydratedDocument<AuditLog>;
