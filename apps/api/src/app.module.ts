import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from './common/common.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    CommonModule,
    MongooseModule.forRoot(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/language-center'),
  ],
  controllers: [HealthController],
})
export class AppModule {}
