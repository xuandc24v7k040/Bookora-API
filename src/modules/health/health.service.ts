import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthResponseDto } from './dto';

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService) {}

  getHealth(): HealthResponseDto {
    return {
      name: this.configService.get<string>('app.name') ?? 'Exam API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
