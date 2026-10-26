import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  // Resolve @lc/shared from source so tests never depend on a built dist.
  moduleNameMapper: { '^@lc/shared$': '<rootDir>/../../packages/shared/src' },
  testTimeout: 120000,
  globalSetup: '<rootDir>/test/helpers/global-setup.ts',
  globalTeardown: '<rootDir>/test/helpers/global-teardown.ts',
  setupFiles: ['<rootDir>/test/helpers/setup-env.ts'],
};
export default config;
