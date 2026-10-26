import { Body, Controller, HttpException, Get, INestApplication, Param, Post, Query } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { z } from 'zod';
import { CreateLeadInput } from '@lc/shared';
import { Public } from '../../src/common/auth/public.decorator';
import { AppError } from '../../src/common/errors/app-error';
import { ZodValidationPipe } from '../../src/common/pipes/zod-validation.pipe';
import { ClockService } from '../../src/common/clock/clock.service';
import { Models } from '../../src/database/models';
import { createTestApp, TestApp } from '../helpers/test-app';

@Public()
@Controller('t')
class TestController {
  constructor(@InjectConnection() private readonly conn: Connection) {}

  @Post('lead')
  lead(@Body(new ZodValidationPipe(CreateLeadInput)) body: CreateLeadInput) {
    return { data: body };
  }
  @Get('query')
  query(@Query(new ZodValidationPipe(z.object({ n: z.coerce.number().int() }))) q: { n: number }) {
    return { data: q };
  }
  @Get('param/:id')
  param(@Param('id', new ZodValidationPipe(z.string().regex(/^\d+$/))) id: string) {
    return { data: id };
  }
  @Get('app-error')
  appError() {
    throw new AppError('CLASS_FULL');
  }
  @Get('http413')
  http413() {
    throw new HttpException('x', 413);
  }
  @Post('root')
  root(@Body(new ZodValidationPipe(z.string())) b: string) {
    return { data: b };
  }
  @Get('boom')
  boom() {
    throw new Error('x-secret-internal');
  }
  @Post('dup')
  async dup() {
    const col = this.conn.collection('dups');
    await col.createIndex({ k: 1 }, { unique: true });
    await col.insertOne({ k: 1 });
    await col.insertOne({ k: 1 });
    return {};
  }
  @Post('mongoose-validation')
  async mongooseValidation() {
    await this.conn.model(Models.Room).create({ code: 'X', capacity: -1 });
    return {};
  }
  @Get('cast/:id')
  async cast(@Param('id') id: string) {
    return { data: await this.conn.model(Models.Room).findById(id) };
  }
}

describe('error envelope', () => {
  let t: TestApp;
  let app: INestApplication;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [TestController] });
    app = t.app;
  });

  afterAll(async () => {
    await t.close();
  });

  it('body rỗng → 400 VALIDATION_FAILED với details.fields.phone', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/t/lead').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(typeof res.body.error.details.fields.phone).toBe('string');
  });

  it('pipe hoạt động với @Query và @Param', async () => {
    const q = await request(app.getHttpServer()).get('/api/v1/t/query?n=abc');
    expect(q.status).toBe(400);
    expect(q.body.error.details.fields.n).toEqual(expect.any(String));
    const ok = await request(app.getHttpServer()).get('/api/v1/t/query?n=5');
    expect(ok.body).toEqual({ data: { n: 5 } });
    const p = await request(app.getHttpServer()).get('/api/v1/t/param/abc');
    expect(p.status).toBe(400);
    expect(p.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('AppError → status theo mã', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/t/app-error');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: { code: 'CLASS_FULL', message: expect.any(String) } });
  });

  it('insert trùng unique → 409 CONFLICT', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/t/dup');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details).toEqual({ keys: ['k'] });
  });

  it('Error lạ → 500 INTERNAL, không lộ nội dung', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/t/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('x-secret-internal');
  });

  it('JSON hỏng → 400 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/t/lead')
      .set('content-type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('HttpException 4xx chưa map giữ status, code VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/t/http413');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('lỗi zod ở gốc dùng khóa _root', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/t/root').send({ a: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields._root).toEqual(expect.any(String));
  });

  it('route không tồn tại → 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('ClockService có thể override bằng FakeClock', () => {
    expect(app.get(ClockService).now()).toEqual(new Date('2026-01-05T02:00:00Z'));
    t.clock.advance(1000);
    expect(app.get(ClockService).now()).toEqual(new Date('2026-01-05T02:00:01Z'));
  });

  it('Mongoose ValidationError → 400 VALIDATION_FAILED, details.fields theo path', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/t/mongoose-validation');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields).toEqual({ name: expect.any(String), capacity: expect.any(String) });
  });

  it('CastError (ObjectId sai) → 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/t/cast/not-an-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: 'NOT_FOUND' });
  });
});
