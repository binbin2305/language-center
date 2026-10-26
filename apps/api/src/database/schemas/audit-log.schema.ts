import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_AUDIT_ACTIONS, ALL_ROLES, AuditAction, Role } from '@lc/shared';
import { Models } from '../models';

export interface AuditLog {
  actorId: Types.ObjectId;
  actorRole: Role;
  action: AuditAction;
  entity: string;
  /** Exception: Settings (string _id 'center') is logged with SETTINGS_AUDIT_ID from SettingsService. */
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
    action: { type: String, enum: ALL_AUDIT_ACTIONS, required: true },
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
