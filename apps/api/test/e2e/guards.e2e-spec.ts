import { Controller, Get } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

@Controller('gpub')
@Public()
class ClassPublicController {
  @Get('a')
  a() {
    return { data: 'a' };
  }
}

@Controller('gweird')
class WeirdController {
  @Get('public-and-roles')
  @Public()
  @Roles('MANAGER')
  publicAndRoles() {
    return { data: 'x' };
  }
  @Get('empty-roles')
  @Roles()
  emptyRoles() {
    return { data: 'x' };
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
    t = await createTestApp({ controllers: [GuardsController, AuthLikeController, ClassPublicController, WeirdController] });
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

  describe('hardening (R6)', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const claims = () => ({ sub: new Types.ObjectId().toHexString(), role: 'MANAGER', iat: Math.floor(t.clock.now().getTime() / 1000) });
    const get = (token: string) => t.http().get('/api/v1/g/manager').set(auth(token));

    it('token alg:none → 401', async () => {
      const tok = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...claims(), exp: claims().iat + 900 })}.`;
      expect((await get(tok)).status).toBe(401);
    });
    it('token ký HS384 bằng đúng secret → 401', async () => {
      const tok = t.app.get(JwtService).sign(claims(), { algorithm: 'HS384', expiresIn: '15m' });
      expect((await get(tok)).status).toBe(401);
    });
    it('role không thuộc ALL_ROLES → 401', async () => {
      expect((await get(signTestToken(t, { role: 'SUPERUSER' }))).status).toBe(401);
    });
    it('Authorization: Basic → 401', async () => {
      const res = await t.http().get('/api/v1/g/manager').set('Authorization', 'Basic x');
      expect(res.status).toBe(401);
    });
    it('@Public + @Roles trên cùng route: public thắng → 200 không cần token', async () => {
      expect((await t.http().get('/api/v1/gweird/public-and-roles')).status).toBe(200);
    });
    it('@Roles() rỗng → 403 với mọi role', async () => {
      const res = await t.http().get('/api/v1/gweird/empty-roles').set(auth(signTestToken(t, { role: 'ADMIN' })));
      expect(res.status).toBe(403);
    });
    it('@Public ở cấp class → 200', async () => {
      expect((await t.http().get('/api/v1/gpub/a')).status).toBe(200);
    });
    it.each([['"false"', 'false'], ['0', 0], ['null', null], ['"true"', 'true'], ['1', 1]])(
      'mcp=%s (không phải undefined/false) → fail-closed 403',
      async (_label, mcp) => {
        const res = await get(signTestToken(t, { role: 'MANAGER', mcp }));
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
      },
    );
    it('mcp=false → 200', async () => {
      expect((await get(signTestToken(t, { role: 'MANAGER', mcp: false }))).status).toBe(200);
    });
    it.each(['abc', '12345678901234567890123', '1234567890123456789012345', ' 507f1f77bcf86cd79943901'])(
      'sub %j không phải 24-hex → 401',
      async (sub) => {
        expect((await get(signTestToken(t, { sub, role: 'MANAGER' }))).status).toBe(401);
      },
    );
    it('studentId không phải 24-hex (12 ký tự) → 401', async () => {
      expect((await get(signTestToken(t, { role: 'MANAGER', studentId: 'abcdefghijkl' }))).status).toBe(401);
    });
  });
});
