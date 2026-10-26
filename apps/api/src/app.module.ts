import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthCoreModule } from './common/auth/auth-core.module';
import { CommonModule } from './common/common.module';
import { ContractsModule } from './common/contracts';
import { loadEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CoursesModule } from './modules/courses/courses.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { PlacementModule } from './modules/placement/placement.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { ClassesModule } from './modules/classes/classes.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { GradesModule } from './modules/grades/grades.module';
import { FeesModule } from './modules/fees/fees.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    CommonModule,
    ContractsModule,
    AuthCoreModule,
    MongooseModule.forRootAsync({ useFactory: () => ({ uri: loadEnv().MONGODB_URI }) }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    EventEmitterModule.forRoot(),
    CoursesModule,
    RoomsModule,
    SettingsModule,
    AdmissionsModule,
    PlacementModule,
    EnrollmentsModule,
    ClassesModule,
    ScheduleModule,
    AttendanceModule,
    GradesModule,
    FeesModule,
    ReportsModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
