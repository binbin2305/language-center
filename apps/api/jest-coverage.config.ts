import type { Config } from 'jest';
import unit from './jest.config';
import e2e from './jest-e2e.config';

/** NFR-07 / D34: api line coverage over src/modules/** measured across the unit and e2e projects. */
const config: Config = {
  rootDir: '.',
  testTimeout: 120000, // root-level: per-project testTimeout is ignored under jest projects
  projects: [
    { ...unit, displayName: 'unit' },
    { ...e2e, displayName: 'e2e' },
  ],
  collectCoverageFrom: ['src/modules/**/*.ts', '!**/*.spec.ts', '!**/*.d.ts'],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'json-summary', 'lcov', 'text'],
  coverageThreshold: { global: { lines: 85 } },
};
export default config;
