import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpErrorFilter } from './common/filters/http-exception.filter';
import { loadEnv } from './config/env';
import { setupOpenApi } from './openapi/setup-openapi';

export function setupApp(app: NestExpressApplication): void {
  // Behind a reverse proxy set TRUST_PROXY so req.ip (login rate limit) is the client, not the proxy.
  const env = loadEnv();
  app.set('trust proxy', env.TRUST_PROXY);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpErrorFilter());
  app.use(helmet());
  app.use(cookieParser());
  // An array makes `cors` reflect only a matching Origin; any other origin gets no ACAO header.
  app.enableCors({ origin: [env.WEB_ORIGIN], credentials: true });
  setupOpenApi(app, env);
}
