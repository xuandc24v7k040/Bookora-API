import {
  type WinstonModuleOptions,
  utilities as nestWinstonModuleUtilities,
} from 'nest-winston';
import { format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export const winstonConfig: WinstonModuleOptions = {
  transports: [
    new transports.Console({
      format: format.combine(
        format.timestamp(),
        format.ms(),
        nestWinstonModuleUtilities.format.nestLike('Exam', {
          colors: true,
          prettyPrint: true,
          appName: true,
        }),
      ),
    }),
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: format.combine(format.timestamp(), format.json()),
    }),
    new DailyRotateFile({
      level: 'error',
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: format.combine(format.timestamp(), format.json()),
    }),
  ],
};
