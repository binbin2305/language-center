import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpErrorFilter } from './common/filters/http-exception.filter';
import { loadEnv } from './config/env';

export function setupApp(app: NestExpressApplication): void {
  // Behind a reverse proxy set TRUST_PROXY so req.ip (login rate limit) is the client, not the proxy.
  app.set('trust proxy', loadEnv().TRUST_PROXY);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpErrorFilter());
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
}
