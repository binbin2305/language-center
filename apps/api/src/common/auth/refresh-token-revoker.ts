import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Models } from '../../database/models';
import { RefreshToken } from '../../database/schemas/refresh-token.schema';
import { ClockService } from '../clock/clock.service';

/**
 * Revokes every live refresh token of a user. Lives in the auth core (not AuthModule) so that
 * UsersModule can revoke on lock / reset-password without importing AuthModule, which already
 * imports UsersModule.
 */
@Injectable()
export class RefreshTokenRevoker {
  constructor(
    private readonly clock: ClockService,
    @InjectModel(Models.RefreshToken) private readonly tokens: Model<RefreshToken>,
  ) {}

  async revokeAllForUser(userId: Types.ObjectId | string, session?: ClientSession): Promise<void> {
    await this.tokens.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: null },
      { revokedAt: this.clock.now() },
      { session },
    );
  }
}
