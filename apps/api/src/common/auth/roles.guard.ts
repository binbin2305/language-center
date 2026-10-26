import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, Role } from '@lc/shared';
import { AppError } from '../errors/app-error';
import { AuthedRequest } from './current-user.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

/** Fail-closed: a non-public route without @Roles is forbidden for everyone. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!roles || roles.length === 0 || !user || !roles.includes(user.role)) {
      throw new AppError(ErrorCode.FORBIDDEN);
    }
    return true;
  }
}
