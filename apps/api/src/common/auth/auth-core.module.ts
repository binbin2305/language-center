import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { loadEnv } from '../../config/env';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenRevoker } from './refresh-token-revoker';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const env = loadEnv();
        return { secret: env.JWT_ACCESS_SECRET, signOptions: { algorithm: 'HS256', expiresIn: env.JWT_ACCESS_TTL as JwtSignOptions['expiresIn'] } };
      },
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    RefreshTokenRevoker,
  ],
  exports: [RefreshTokenRevoker],
})
export class AuthCoreModule {}
