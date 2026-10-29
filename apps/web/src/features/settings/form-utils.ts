import type { FieldValues, Path, Resolver, UseFormSetError } from 'react-hook-form';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '@/lib/api';

const FALLBACK_MESSAGE = 'Giá trị chưa hợp lệ. Kiểm tra lại ô này.';

/**
 * Resolver that validates the payload built from raw form text with a shared zod schema.
 * Shared zod messages are developer-facing, so each field gets a Vietnamese message instead.
 */
export function schemaResolver<V extends FieldValues>(
  schema: ZodTypeAny,
  toInput: (values: V) => unknown,
  messages: Partial<Record<keyof V & string, string>>,
  /** Schema field name -> form field name, when they differ. */
  fieldMap: Record<string, keyof V & string> = {},
): Resolver<V> {
  return async (values) => {
    const parsed = schema.safeParse(toInput(values));
    if (parsed.success) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of parsed.error.issues) {
      const schemaField = String(issue.path[0] ?? '');
      const field = fieldMap[schemaField] ?? schemaField;
      if (!field || errors[field]) continue;
      errors[field] = { type: 'validation', message: messages[field as keyof V & string] ?? FALLBACK_MESSAGE };
    }
    return { values: {}, errors } as ReturnType<Resolver<V>> extends Promise<infer R> ? R : never;
  };
}

/**
 * Maps server `details.fields` onto form fields. Server values are codes (e.g. DUPLICATE),
 * so DUPLICATE becomes `duplicateMessages[field]`; other codes use the generic text.
 * Returns true when at least one field error was set.
 */
export function applyServerFieldErrors<V extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<V>,
  duplicateMessages: Partial<Record<keyof V & string, string>>,
): boolean {
  if (!(error instanceof ApiError) || !error.details?.fields) return false;
  let any = false;
  for (const [field, code] of Object.entries(error.details.fields)) {
    const message =
      code === 'DUPLICATE'
        ? (duplicateMessages[field as keyof V & string] ?? FALLBACK_MESSAGE)
        : FALLBACK_MESSAGE;
    setError(field as Path<V>, { type: 'server', message });
    any = true;
  }
  return any;
}

/** Parses a numeric text input; empty or non-numeric text becomes NaN so validation rejects it. */
export const toNumber = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text));
