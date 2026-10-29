// Shared react-hook-form helpers (promoted from features/settings, docs/contract-requests/L-CATALOG-2.md).
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ParseParams } from 'zod';
import { ApiError } from './api';

const FALLBACK_MESSAGE = 'Giá trị chưa hợp lệ. Kiểm tra lại ô này.';

/** zod parse params giving each form field one Vietnamese message (shared zod texts are developer-facing). */
export const viParams = (messages: Record<string, string>): ParseParams => ({
  path: [],
  async: false,
  errorMap: (issue) => ({ message: messages[String(issue.path[0] ?? '')] ?? FALLBACK_MESSAGE }),
});

/**
 * Maps server `details.fields` onto form fields. Server values are codes (e.g. DUPLICATE),
 * so DUPLICATE becomes `duplicateMessages[field]`; other codes use the generic text.
 * Returns true when at least one field error was set.
 */
export function applyServerFieldErrors<V extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<V>,
  duplicateMessages: Record<string, string>,
): boolean {
  if (!(error instanceof ApiError) || !error.details?.fields) return false;
  const entries = Object.entries(error.details.fields);
  for (const [field, code] of entries) {
    const message = code === 'DUPLICATE' ? (duplicateMessages[field] ?? FALLBACK_MESSAGE) : FALLBACK_MESSAGE;
    setError(field as Path<V>, { type: 'server', message });
  }
  return entries.length > 0;
}
