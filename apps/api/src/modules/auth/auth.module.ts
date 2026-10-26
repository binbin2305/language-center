import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { loadEnv } from '../../config/env';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    UsersModule,
    // Only applied where ThrottlerGuard is used explicitly (POST /auth/login).
    ThrottlerModule.forRootAsync({ useFactory: () => [{ ttl: 60_000, limit: loadEnv().LOGIN_RATE_LIMIT }] }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  exports: [TokenService],
})
export class AuthModule {}
