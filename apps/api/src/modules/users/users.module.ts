import { Module } from '@nestjs/common';
import { TeachersController } from './teachers.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ controllers: [UsersController, TeachersController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
