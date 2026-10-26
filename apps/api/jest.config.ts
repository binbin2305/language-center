import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  // Resolve @lc/shared from source so tests never depend on a built dist.
  moduleNameMapper: { '^@lc/shared$': '<rootDir>/../../packages/shared/src' },
};
export default config;
