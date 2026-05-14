import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { databaseConfig } from '../config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: ConfigType<typeof databaseConfig>) => ({
        uri: config.uri,
      }),
    }),
  ],
})
export class DatabaseModule {}
