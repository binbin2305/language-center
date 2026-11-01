import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Env } from '../config/env';

/**
 * H-04 (D33): mounts GET /api/docs + /api/docs-json from listRoutes(app) and the route zod schemas,
 * never when NODE_ENV=production. Task 0 contract stub: no-op until L-HARDENING implements it.
 */
export function setupOpenApi(app: NestExpressApplication, env: Env): void {
  if (env.NODE_ENV === 'production') return;
  void app; // H-04: build the document from listRoutes(app) and mount Swagger UI here.
}
