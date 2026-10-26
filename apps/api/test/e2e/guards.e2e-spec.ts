import { Controller, Get } from '@nestjs/common';
import { Types } from 'mongoose';
import { AllowPasswordChangeRequired } from '../../src/common/auth/allow-password-change.decorator';
import { AuthUser } from '../../src/common/auth/auth-user';
import { CurrentUser } from '../../src/common/auth/current-user.decorator';
import { Public } from '../../src/common/auth/public.decorator';
import { Roles } from '../../src/common/auth/roles.decorator';
import { signTestToken } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

@Controller('g')
class GuardsController {
  @Get('open')
  @Public()
  open() {
    return { data: 'open' };
  }
  @Get('unannotated')
  unannotated() {
    return { data: 'x' };
  }
  @Get('manager')
  @Roles('MANAGER')
  manager(@CurrentUser() u: AuthUser) {
    return { data: { id: u.id.toHexString(), isOid: u.id instanceof Types.ObjectId, role: u.role, studentId: u.studentId?.toHexString() } };
  }
}

@Controller('gauth')
@AllowPasswordChangeRequired()
class AuthLikeController {
  @Get('me')
  @Roles('MANAGER', 'TEACHER')
  me() {
    return { data: 'me' };
  }
}

describe('global guards', () => {
  let t: TestApp;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  beforeAll(async () => {
    t = await createTestApp({ controllers: [GuardsController, AuthLikeController] });
  });
  afterAll(async () => {
    await t.close();
  });

  it('@Public không token → 200', async () => {
    expect((await t.http().get('/api/v1/g/open')).status).toBe(200);
  });
  it('health không token → 200', async () => {
    expect((await t.http().get('/api/v1/health')).status).toBe(200);
  });
  it('không token → 401 UNAUTHENTICATED', async () => {
    const res = await t.http().get('/api/v1/g/manager');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
  it('token rác → 401', async () => {
    const res = await t.http().get('/api/v1/g/manager').set(auth('garbage'));
    expect(res.status).toBe(401);
  });
  it('token sai chữ ký → 401', async () => {
    const tok = signTestToken(t, { role: 'MANAGER' }).slice(0, -3) + 'abc';
    expect((await t.http().get('/api/v1/g/manager').set(auth(tok))).status).toBe(401);
  });
  it('token hết hạn (clock + 16 phút) → 401', async () => {
    const tok = signTestToken(t, { role: 'MANAGER' });
    expect((await t.http().get('/api/v1/g/manager').set(auth(tok))).status).toBe(200);
    t.clock.advance(16 * 60 * 1000);
    const res = await t.http().get('/api/v1/g/manager').set(auth(tok));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
  it('route không @Roles với MANAGER → 403 FORBIDDEN (fail-closed)', async () => {
    const res = await t.http().get('/api/v1/g/unannotated').set(auth(signTestToken(t, { role: 'MANAGER' })));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
  it('@Roles(MANAGER) với TEACHER → 403', async () => {
    const res = await t.http().get('/api/v1/g/manager').set(auth(signTestToken(t, { role: 'TEACHER' })));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
  it('@Roles(MANAGER) với MANAGER → 200 và @CurrentUser trả ObjectId', async () => {
    const sid = new Types.ObjectId().toHexString();
    const sub = new Types.ObjectId().toHexString();
    const res = await t.http().get('/api/v1/g/manager').set(auth(signTestToken(t, { sub, role: 'MANAGER', studentId: sid })));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: sub, isOid: true, role: 'MANAGER', studentId: sid });
  });
  it('token mcp:true vào route thường → 403 PASSWORD_CHANGE_REQUIRED', async () => {
    const res = await t.http().get('/api/v1/g/manager').set(auth(signTestToken(t, { role: 'MANAGER', mcp: true })));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });
  it('token mcp:true vào controller @AllowPasswordChangeRequired → 200', async () => {
    const res = await t.http().get('/api/v1/gauth/me').set(auth(signTestToken(t, { role: 'MANAGER', mcp: true })));
    expect(res.status).toBe(200);
  });
  it('token sub không phải ObjectId → 401', async () => {
    const res = await t.http().get('/api/v1/g/manager').set(auth(signTestToken(t, { sub: 'nope', role: 'MANAGER' })));
    expect(res.status).toBe(401);
  });
});
