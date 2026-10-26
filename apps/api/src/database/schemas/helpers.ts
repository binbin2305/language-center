import { Schema, SchemaTypeOptions, Types } from 'mongoose';

export const VN_PHONE_REGEX = /^(0|\+84)\d{9,10}$/;

const isInt = (v: number | null | undefined): boolean => v == null || Number.isInteger(v);

/** Integer VND amount, >= 0. */
export function money(options: SchemaTypeOptions<number> = {}): SchemaTypeOptions<number> {
  return {
    type: Number,
    min: 0,
    validate: { validator: isInt, message: '{PATH} must be an integer' },
    ...options,
  };
}

/** Score 0-10 in steps of 0.25; null means not entered. */
export const scoreField: SchemaTypeOptions<number | null> = {
  type: Number,
  min: 0,
  max: 10,
  default: null,
  validate: {
    validator: (v: number | null | undefined) => v == null || Number.isInteger(v * 4),
    message: '{PATH} must be a multiple of 0.25',
  },
};

/** Optional reference, stored as null when absent. */
export function nullableRef(model: string): SchemaTypeOptions<Types.ObjectId | null> {
  return { type: Schema.Types.ObjectId, ref: model, default: null };
}
