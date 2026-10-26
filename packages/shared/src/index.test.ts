import { describe, it, expect } from 'vitest';
import { SHARED_VERSION } from './index';

describe('shared', () => {
  it('exports placeholder', () => {
    expect(SHARED_VERSION).toBe('0.0.0');
  });
});
