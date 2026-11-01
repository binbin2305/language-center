import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import type { OpenAPIObject } from '@nestjs/swagger';
import { z, ZodTypeAny } from 'zod';
import type { RouteInfo } from '../common/routes/route-inventory';

extendZodWithOpenApi(z);

export const API_PREFIX = '/api/v1';
const BEARER = 'bearer';

/** ZodEffects (refine/transform/preprocess) -> the object schema inside, so keys can become parameters. */
function unwrapObject(schema: ZodTypeAny | undefined): z.AnyZodObject | undefined {
  let s: ZodTypeAny | undefined = schema;
  while (s instanceof z.ZodEffects) s = s._def.schema as ZodTypeAny;
  return s instanceof z.ZodObject ? s : undefined;
}

function pathParamsSchema(route: RouteInfo): z.AnyZodObject | undefined {
  if (route.params.length === 0) return undefined;
  const fromContract = unwrapObject(route.schemas.param);
  if (fromContract && route.params.every((p) => p in fromContract.shape)) return fromContract;
  return z.object(Object.fromEntries(route.params.map((p) => [p, z.string()])));
}

/** Nest `:id` -> OpenAPI `{id}`, with the global prefix. */
export function toOpenApiPath(path: string): string {
  return API_PREFIX + path.replace(/:(\w+)/g, '{$1}');
}

/** D33: OpenAPI 3.0 document generated from listRoutes(app) and the route zod contracts. */
export function buildOpenApiDocument(routes: RouteInfo[]): OpenAPIObject {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', BEARER, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  for (const r of routes) {
    const hasBody = r.method !== 'GET' && r.method !== 'DELETE' && r.schemas.body !== undefined;
    const query = unwrapObject(r.schemas.query);
    const op = {
      method: r.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete',
      path: toOpenApiPath(r.path),
      operationId: `${r.controller}_${r.handler}`,
      tags: [r.controller.replace(/Controller$/, '')],
      summary: `${r.controller}.${r.handler}`,
      description: r.isPublic
        ? 'Public.'
        : `Roles: ${(r.roles ?? []).join(', ')}.${r.allowPasswordChange ? ' Allowed while a password change is pending.' : ''}`,
      request: {
        params: pathParamsSchema(r),
        query,
        ...(hasBody
          ? { body: { content: { 'application/json': { schema: r.schemas.body as ZodTypeAny } } } }
          : {}),
      },
      responses: {
        default: {
          description: 'Response envelope { data } or error { error: { code, message } }.',
        },
      },
      ...(r.isPublic ? {} : { security: [{ [BEARER]: [] }], 'x-roles': r.roles ?? [] }),
    };
    registry.registerPath(op as Parameters<OpenAPIRegistry['registerPath']>[0]);
  }

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Language Center API',
      version: '1.0.0',
      description: 'Generated from the @lc/shared zod contracts (D33). Not served in production.',
    },
    servers: [{ url: '/' }],
  }) as unknown as OpenAPIObject;
}
