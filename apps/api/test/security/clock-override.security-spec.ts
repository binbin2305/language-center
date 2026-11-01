import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { createClock } from '../../src/common/clock/clock.factory';
import { ClockService, SystemClock } from '../../src/common/clock/clock.service';
import { setupApp } from '../../src/setup-app';

const FAKE_START = '2020-01-01T00:00:00Z';

describe('NFR-01 Đồng hồ giả bị bỏ qua ở production', () => {
  it('NODE_ENV=production + APP_CLOCK_START=2020-01-01T00:00:00Z → createClock trả SystemClock, |now − Date.now()| < 1000, logger.warn được gọi một lần', () => {
    const warn = jest.fn();
    const clock = createClock({ NODE_ENV: 'production', APP_CLOCK_START: FAKE_START }, { warn });
    expect(clock).toBeInstanceOf(SystemClock);
    expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('APP_CLOCK_START ignored in production');
  });

  it.each(['staging', 'prod', 'Production'])(
    'fail-closed: NODE_ENV=%s + APP_CLOCK_START → SystemClock + cảnh báo',
    (nodeEnv) => {
      const warn = jest.fn();
      const clock = createClock({ NODE_ENV: nodeEnv, APP_CLOCK_START: FAKE_START }, { warn });
      expect(clock).toBeInstanceOf(SystemClock);
      expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1000);
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['development', 'e2e', 'test'])('NODE_ENV=%s vẫn nhận APP_CLOCK_START', (nodeEnv) => {
    const clock = createClock({ NODE_ENV: nodeEnv, APP_CLOCK_START: FAKE_START });
    expect(clock).not.toBeInstanceOf(SystemClock);
  });

  describe('NestFactory app với NODE_ENV=production + APP_CLOCK_START', () => {
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      APP_CLOCK_START: process.env.APP_CLOCK_START,
      MONGODB_URI: process.env.MONGODB_URI,
    };
    let app: NestExpressApplication;

    beforeAll(async () => {
      const base = process.env.MONGO_TEST_URI;
      if (!base) throw new Error('MONGO_TEST_URI is not set; run via jest-security.config.ts');
      process.env.MONGODB_URI = base.replace('/?', `/lc_test_${randomBytes(6).toString('hex')}?`);
      process.env.NODE_ENV = 'production';
      process.env.APP_CLOCK_START = FAKE_START;
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
      setupApp(app);
      await app.init();
    });
    afterAll(async () => {
      await app.get<Connection>(getConnectionToken()).dropDatabase();
      await app.close();
      jest.restoreAllMocks();
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    it('GET /api/v1/health 200 và ClockService là SystemClock (now ≈ giờ thật)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');
      expect(res.status).toBe(200);
      const clock = app.get(ClockService);
      expect(clock).toBeInstanceOf(SystemClock);
      expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1000);
    });
  });
});
