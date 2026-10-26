import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/** Default location: apps/api/.env (resolved from this file so it works from any cwd). */
export const DEFAULT_DOTENV_PATH = resolve(__dirname, '../../.env');

/**
 * Loads a .env file into process.env if it exists. Variables already set in the
 * environment win over the file. Returns whether a file was loaded.
 */
export function loadDotEnvFile(path: string = DEFAULT_DOTENV_PATH): boolean {
  if (!existsSync(path)) return false;
  const vars = parseEnv(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(vars)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}
