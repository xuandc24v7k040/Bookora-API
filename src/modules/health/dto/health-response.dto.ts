import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'Exam API' })
  name!: string;

  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: '2026-05-13T00:00:00.000Z' })
  timestamp!: string;
}
