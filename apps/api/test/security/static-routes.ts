import 'reflect-metadata';
import { RequestMethod, Type } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../../src/app.module';
import { IS_PUBLIC_KEY } from '../../src/common/auth/public.decorator';

/**
 * Synchronous route table for jest `it.each` (collection time cannot await an app boot).
 * Walks AppModule's static `imports`/`controllers` metadata. The sweep asserts that this table
 * equals `listRoutes(app)` of the booted app, so it cannot silently drift from the real inventory.
 */
export interface StaticRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  isPublic: boolean;
  hasParams: boolean;
}

const METHODS: Partial<Record<RequestMethod, StaticRoute['method']>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

type ModuleRef = Type<unknown> | { module: Type<unknown>; controllers?: Type<unknown>[]; imports?: unknown[] };

function unwrap(m: unknown): ModuleRef | undefined {
  if (!m) return undefined;
  if (typeof m === 'object' && 'forwardRef' in m) return unwrap((m as { forwardRef: () => unknown }).forwardRef());
  return m as ModuleRef;
}

function collectControllers(root: Type<unknown>): Type<unknown>[] {
  const seen = new Set<unknown>();
  const out = new Set<Type<unknown>>();
  const visit = (raw: unknown) => {
    const ref = unwrap(raw);
    if (!ref) return;
    const cls = typeof ref === 'function' ? ref : ref.module;
    if (seen.has(ref)) return;
    seen.add(ref);
    const ctrls = [
      ...((Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, cls) as Type<unknown>[] | undefined) ?? []),
      ...(typeof ref === 'function' ? [] : (ref.controllers ?? [])),
    ];
    ctrls.forEach((c) => out.add(c));
    const imports = [
      ...((Reflect.getMetadata(MODULE_METADATA.IMPORTS, cls) as unknown[] | undefined) ?? []),
      ...(typeof ref === 'function' ? [] : (ref.imports ?? [])),
    ];
    imports.forEach(visit);
  };
  visit(root);
  return [...out];
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [typeof v === 'string' ? v : '']);

function joinPath(...parts: string[]): string {
  const p = parts.join('/').replace(/\/+/g, '/').replace(/\/$/, '');
  return p.startsWith('/') ? p || '/' : `/${p}`;
}

export function staticRoutes(): StaticRoute[] {
  const routes: StaticRoute[] = [];
  for (const ctrl of collectControllers(AppModule)) {
    const proto = ctrl.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const fn = proto[name];
      if (typeof fn !== 'function') continue;
      const rp: unknown = Reflect.getMetadata(PATH_METADATA, fn);
      const method = METHODS[Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod];
      if (rp === undefined || !method) continue;
      const isPublic =
        (Reflect.getMetadata(IS_PUBLIC_KEY, fn) as boolean | undefined) ??
        (Reflect.getMetadata(IS_PUBLIC_KEY, ctrl) as boolean | undefined) ??
        false;
      for (const cp of asList(Reflect.getMetadata(PATH_METADATA, ctrl))) {
        for (const p of asList(rp)) {
          const path = joinPath(cp, p);
          routes.push({ method, path, isPublic: isPublic === true, hasParams: /:\w+/.test(path) });
        }
      }
    }
  }
  return routes.sort((a, b) => a.method.localeCompare(b.method) || a.path.localeCompare(b.path));
}

export const routeLabel = (r: { method: string; path: string }) => `${r.method} ${r.path}`;
