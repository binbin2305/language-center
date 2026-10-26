import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { ALL_ROLES, ErrorCode, Role } from '@lc/shared';
import { ClockService } from '../clock/clock.service';
import { AppError } from '../errors/app-error';
import { ALLOW_PASSWORD_CHANGE_KEY } from './allow-password-change.decorator';
import { AuthedRequest } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';

const OBJECT_ID_HEX = /^[0-9a-f]{24}$/i;

interface AccessClaims {
  sub?: unknown;
  role?: unknown;
  studentId?: unknown;
  mcp?: unknown;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly clock: ClockService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer (.+)$/i.exec(header) : null;
    if (!match) throw new AppError(ErrorCode.UNAUTHENTICATED);

    let claims: AccessClaims;
    try {
      claims = this.jwt.verify<AccessClaims>(match[1], {
        algorithms: ['HS256'],
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
      });
    } catch {
      throw new AppError(ErrorCode.UNAUTHENTICATED);
    }

    const { sub, role, studentId } = claims;
    if (
      typeof sub !== 'string' ||
      !OBJECT_ID_HEX.test(sub) ||
      typeof role !== 'string' ||
      !(ALL_ROLES as readonly string[]).includes(role) ||
      (studentId !== undefined && (typeof studentId !== 'string' || !OBJECT_ID_HEX.test(studentId)))
    ) {
      throw new AppError(ErrorCode.UNAUTHENTICATED);
    }

    req.user = {
      id: new Types.ObjectId(sub),
      role: role as Role,
      ...(studentId !== undefined ? { studentId: new Types.ObjectId(studentId as string) } : {}),
    };

    // Fail-closed: anything other than an absent/false claim means the password must be changed first.
    const mustChangePassword = claims.mcp !== undefined && claims.mcp !== false;
    if (mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_KEY, targets)) {
      throw new AppError(ErrorCode.PASSWORD_CHANGE_REQUIRED);
    }
    return true;
  }
}
