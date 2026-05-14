import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configurations } from './config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: configurations,
    }),
    DatabaseModule,
    HealthModule,
    UsersModule,
  ],
})
export class AppModule {}
