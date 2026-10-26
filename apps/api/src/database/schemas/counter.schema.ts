import { HydratedDocument, Schema } from 'mongoose';
import { clockTimestamps } from './helpers';

export interface Counter {
  _id: string;
  seq: number;
}

export const CounterSchema = new Schema<Counter>(
  { _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
  { timestamps: clockTimestamps, collection: 'counters' },
);

export type CounterDoc = HydratedDocument<Counter>;
