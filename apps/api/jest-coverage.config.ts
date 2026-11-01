import type { Config } from 'jest';
import unit from './jest.config';
import e2e from './jest-e2e.config';

/**
 * NOTE: the test:coverage script passes --forceExit because jest hangs after the run on open handles
 * left by the e2e project (Nest apps / mongo connections). Follow-up: find them with --detectOpenHandles.
 */
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
