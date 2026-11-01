import { INestApplication, RequestMethod, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import type { Role } from '@lc/shared';
import type { ZodTypeAny } from 'zod';
import { ALLOW_PASSWORD_CHANGE_KEY } from '../auth/allow-password-change.decorator';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

export interface RouteInfo {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Without the global prefix, e.g. '/students/:id'. */
  path: string;
  controller: string;
  handler: string;
  /** Resolved like RolesGuard: handler metadata overrides controller metadata. */
  roles: Role[] | undefined;
  isPublic: boolean;
  allowPasswordChange: boolean;
  params: string[];
  /** Whole-object ZodValidationPipe schemas on @Body() / @Query() / @Param(). */
  schemas: { body?: ZodTypeAny; query?: ZodTypeAny; param?: ZodTypeAny };
}

const METHODS: Partial<Record<RequestMethod, RouteInfo['method']>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

const SCHEMA_SLOTS: Partial<Record<RouteParamtypes, keyof RouteInfo['schemas']>> = {
  [RouteParamtypes.BODY]: 'body',
  [RouteParamtypes.QUERY]: 'query',
  [RouteParamtypes.PARAM]: 'param',
};

interface RouteArg {
  data?: unknown;
  pipes?: unknown[];
}

function joinPath(...parts: string[]): string {
  const p = parts.join('/').replace(/\/+/g, '/').replace(/\/$/, '');
  return p.startsWith('/') ? p || '/' : `/${p}`;
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  return [typeof v === 'string' ? v : ''];
}

function schemasOf(ctrl: Type<unknown>, handler: string): RouteInfo['schemas'] {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, ctrl, handler) ?? {}) as Record<
    string,
    RouteArg
  >;
  const out: RouteInfo['schemas'] = {};
  for (const [key, arg] of Object.entries(args)) {
    const slot = SCHEMA_SLOTS[Number(key.split(':')[0]) as RouteParamtypes];
    if (!slot || arg.data !== undefined) continue;
    const pipe = arg.pipes?.find((p): p is ZodValidationPipe => p instanceof ZodValidationPipe);
    if (pipe) out[slot] = pipe.schema;
  }
  return out;
}

/** Every HTTP route of the app with its auth metadata and zod schemas, sorted by method then path. */
export function listRoutes(app: INestApplication): RouteInfo[] {
  const discovery = new DiscoveryService(app.get(ModulesContainer));
  const scanner = new MetadataScanner();
  const reflector = new Reflector();
  const seen = new Set<Type<unknown>>();
  const routes: RouteInfo[] = [];

  for (const wrapper of discovery.getControllers()) {
    const ctrl = wrapper.metatype as Type<unknown> | null;
    if (!ctrl || seen.has(ctrl)) continue;
    seen.add(ctrl);
    const proto = ctrl.prototype as Record<string, unknown>;
    const ctrlPaths = asList(Reflect.getMetadata(PATH_METADATA, ctrl));
    for (const handler of scanner.getAllMethodNames(proto)) {
      const fn = proto[handler] as (...args: unknown[]) => unknown;
      const routePath: unknown = Reflect.getMetadata(PATH_METADATA, fn);
      const method = METHODS[Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod];
      if (routePath === undefined || !method) continue;
      const targets: Array<Type<unknown> | ((...args: unknown[]) => unknown)> = [fn, ctrl];
      const base = {
        method,
        controller: ctrl.name,
        handler,
        roles: reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets),
        isPublic: reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true,
        allowPasswordChange:
          reflector.getAllAndOverride<boolean | undefined>(ALLOW_PASSWORD_CHANGE_KEY, targets) ===
          true,
        schemas: schemasOf(ctrl, handler),
      };
      for (const cp of ctrlPaths) {
        for (const rp of asList(routePath)) {
          const path = joinPath(cp, rp);
          routes.push({ ...base, path, params: [...path.matchAll(/:(\w+)/g)].map((m) => m[1]) });
        }
      }
    }
  }
  return routes.sort((a, b) => a.method.localeCompare(b.method) || a.path.localeCompare(b.path));
}
