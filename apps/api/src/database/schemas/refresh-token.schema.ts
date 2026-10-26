import { HydratedDocument, Schema, Types } from 'mongoose';
import { Models } from '../models';

export interface RefreshToken {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: Types.ObjectId | null;
}

export const RefreshTokenSchema = new Schema<RefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: Models.User, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: Schema.Types.ObjectId, ref: Models.RefreshToken, default: null },
  },
  { timestamps: true, collection: 'refresh_tokens' },
);
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
RefreshTokenSchema.index({ tokenHash: 1 });
RefreshTokenSchema.index({ userId: 1 });

export type RefreshTokenDoc = HydratedDocument<RefreshToken>;
