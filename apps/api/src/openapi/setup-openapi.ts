import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import { NON_PRODUCTION_ENVS, type Env } from '../config/env';
import { listRoutes } from '../common/routes/route-inventory';
import { buildOpenApiDocument } from './build-document';

/**
 * H-04 (D33): mounts GET /api/docs (Swagger UI) + /api/docs-json from listRoutes(app) and the route
 * zod schemas. Fail-closed: mounted only when NODE_ENV is development/e2e/test (NFR-01: only login/refresh/health are public).
 */
export function setupOpenApi(app: NestExpressApplication, env: Env): void {
  if (!NON_PRODUCTION_ENVS.includes(env.NODE_ENV)) return;
  SwaggerModule.setup('api/docs', app, buildOpenApiDocument(listRoutes(app)), {
    jsonDocumentUrl: 'api/docs-json',
  });
}
