import 'reflect-metadata';
import { connect, Connection, connection, disconnect } from 'mongoose';
import { Role } from '@lc/shared';
import { loadEnv } from '../src/config/env';
import { Models } from '../src/database/models';
import { UserSchema } from '../src/database/schemas/user.schema';
import { hashPassword } from '../src/modules/auth/password';

export type SeedResult = 'created' | 'exists' | 'skipped';

/** Creates the first ADMIN if no user with that email exists. Empty/unset values mean "skip". */
export async function seedAdmin(
  conn: Connection,
  input: { email?: string; password?: string },
): Promise<SeedResult> {
  const email = input.email?.trim().toLowerCase();
  const password = input.password;
  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set; skipping admin seed.');
    return 'skipped';
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters with a letter and a digit.');
  }
  const User = conn.models[Models.User] ?? conn.model(Models.User, UserSchema);
  if (await User.exists({ $or: [{ username: email }, { email }] })) {
    console.log(`Admin ${email} already exists; nothing to do.`);
    return 'exists';
  }
  await User.create({
    email,
    username: email,
    passwordHash: await hashPassword(password),
    fullName: 'System Admin',
    role: Role.ADMIN,
    mustChangePassword: true,
  });
  console.log(`Created admin ${email} (must change password on first login).`);
  return 'created';
}

async function main(): Promise<void> {
  const env = loadEnv();
  await connect(env.MONGODB_URI);
  try {
    await seedAdmin(connection, { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
