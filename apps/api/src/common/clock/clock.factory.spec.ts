import { loadEnv } from '../../config/env';
import { createClock } from './clock.factory';
import { OffsetClock, SystemClock } from './clock.service';

const BASE_ENV = { MONGODB_URI: 'mongodb://x/y', JWT_ACCESS_SECRET: 'x'.repeat(32) };

describe('createClock (D30 APP_CLOCK_START)', () => {
  it('không có APP_CLOCK_START → SystemClock', () => {
    const clock = createClock({ NODE_ENV: 'e2e', APP_CLOCK_START: undefined });
    expect(clock).toBeInstanceOf(SystemClock);
    expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it('APP_CLOCK_START=2026-11-02T13:00:00Z, NODE_ENV=e2e → now() = start + thời gian đã trôi (realNow giả +5000ms → 13:00:05Z)', () => {
    let real = 1_000_000;
    const clock = new OffsetClock(new Date('2026-11-02T13:00:00Z'), () => real);
    expect(clock.now().toISOString()).toBe('2026-11-02T13:00:00.000Z');
    real += 5000;
    expect(clock.now().toISOString()).toBe('2026-11-02T13:00:05.000Z');

    const fromEnv = createClock({ NODE_ENV: 'e2e', APP_CLOCK_START: '2026-11-02T13:00:00Z' });
    expect(fromEnv).toBeInstanceOf(OffsetClock);
    expect(Math.abs(fromEnv.now().getTime() - Date.parse('2026-11-02T13:00:00Z'))).toBeLessThan(
      1000,
    );
  });

  it('APP_CLOCK_START có offset +07:00 được chấp nhận', () => {
    const env = loadEnv({ ...BASE_ENV, APP_CLOCK_START: '2026-11-02T20:00:00+07:00' });
    expect(env.APP_CLOCK_START).toBe('2026-11-02T20:00:00+07:00');
    expect(
      Math.abs(createClock(env).now().getTime() - Date.parse('2026-11-02T13:00:00Z')),
    ).toBeLessThan(1000);
  });

  it('giá trị không phải ISO → loadEnv ném lỗi nêu APP_CLOCK_START', () => {
    expect(() => loadEnv({ ...BASE_ENV, APP_CLOCK_START: 'tomorrow 8am' })).toThrow(
      /APP_CLOCK_START/,
    );
    expect(() => loadEnv({ ...BASE_ENV, APP_CLOCK_START: '2026-11-02' })).toThrow(
      /APP_CLOCK_START/,
    );
  });
});
