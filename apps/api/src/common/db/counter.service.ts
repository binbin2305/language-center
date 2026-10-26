import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { Models } from '../../database/models';
import { Counter } from '../../database/schemas/counter.schema';

const DUPLICATE_KEY = 11000;

@Injectable()
export class CounterService {
  constructor(@InjectModel(Models.Counter) private readonly counters: Model<Counter>) {}

  /** Atomically increments and returns the next sequence number for key (starts at 1). */
  async next(key: string, s?: ClientSession): Promise<number> {
    for (let attempt = 0; ; attempt++) {
      try {
        const doc = await this.counters
          .findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true, session: s })
          .lean();
        return doc.seq;
      } catch (e) {
        // Concurrent first upserts can race on the _id; the loser simply retries as an update.
        const code = (e as { code?: number }).code;
        if (code !== DUPLICATE_KEY || attempt >= 5 || s) throw e;
      }
    }
  }

  formatCode(prefix: string, period: string, seq: number, pad: number): string {
    return `${prefix}${period}${String(seq).padStart(pad, '0')}`;
  }
}
