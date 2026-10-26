import { compare, hash } from 'bcrypt';
import { randomInt } from 'crypto';
import { loadEnv } from '../../config/env';

let cost: number | undefined;

export function hashPassword(plain: string): Promise<string> {
  cost ??= loadEnv().BCRYPT_COST;
  return hash(plain, cost);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}

let dummyHash: Promise<string> | undefined;
/** Burns the same bcrypt time as a real check so unknown users are not distinguishable by latency. */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(plain, await dummyHash);
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const pick = (set: string) => set[randomInt(set.length)];

/** 10 characters, always at least one letter and one digit. */
export function generateTempPassword(): string {
  const chars = [pick(LETTERS), pick(DIGITS), ...Array.from({ length: 8 }, () => pick(LETTERS + DIGITS))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
