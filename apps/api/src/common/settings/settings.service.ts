import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Models } from '../../database/models';
import { Settings, SETTINGS_ID } from '../../database/schemas/settings.schema';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';

/** AuditLog.entityId is an ObjectId but the settings _id is the string 'center': use a fixed stand-in. */
export const SETTINGS_AUDIT_ID = new Types.ObjectId(Buffer.from('settings_ctr'));

export type SettingsPatch = Partial<Omit<Settings, '_id'>>;

@Injectable()
export class SettingsService {
  private cache: Settings | null = null;
  /** Bumped by every update; a get() whose read began under an older version must not cache. */
  private cacheVersion = 0;

  constructor(
    @InjectModel(Models.Settings) private readonly settings: Model<Settings>,
    private readonly audit: AuditService,
  ) {}

  /** Returns the single settings document, creating it with defaults on first use. */
  async get(): Promise<Settings> {
    if (this.cache) return { ...this.cache };
    const version = this.cacheVersion;
    const doc = await this.settings
      .findOneAndUpdate({ _id: SETTINGS_ID }, { $setOnInsert: { _id: SETTINGS_ID } }, { upsert: true, new: true, setDefaultsOnInsert: true })
      .lean()
      .catch(async (e: unknown) => {
        // Concurrent first upserts can lose the race with E11000; the document then exists.
        if ((e as { code?: number }).code !== 11000) throw e;
        return this.settings.findById(SETTINGS_ID).lean();
      });
    if (!doc) throw new Error('settings document missing');
    if (version === this.cacheVersion) this.cache = doc;
    return { ...doc };
  }

  async update(patch: SettingsPatch, actor: AuthUser): Promise<Settings> {
    const before = await this.get();
    const after = await this.settings
      .findOneAndUpdate({ _id: SETTINGS_ID }, { $set: patch }, { new: true, runValidators: true })
      .lean();
    if (!after) throw new Error('settings document missing');
    // Bump the version first so any get() read started before this write cannot re-cache stale data.
    this.cacheVersion++;
    this.cache = after;
    await this.audit.log({ actor, action: 'update', entity: 'Settings', entityId: SETTINGS_AUDIT_ID, before, after });
    return { ...after };
  }
}
