import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthCoreModule } from './common/auth/auth-core.module';
import { CommonModule } from './common/common.module';
import { loadEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    CommonModule,
    AuthCoreModule,
    MongooseModule.forRootAsync({ useFactory: () => ({ uri: loadEnv().MONGODB_URI }) }),
    DatabaseModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
