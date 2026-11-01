import type { Config } from 'jest';
import e2e from './jest-e2e.config';

/** Security suite (H-01, NFR-01): same harness as test:e2e (MongoMemoryReplSet globalSetup), own files. */
const config: Config = {
  ...e2e,
  testMatch: ['<rootDir>/test/security/**/*.security-spec.ts'],
};
export default config;
