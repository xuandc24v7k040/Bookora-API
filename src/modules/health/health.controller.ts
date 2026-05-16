import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiBaseResponse, ResponseMessage } from '../../common/decorators';
import { HealthResponseDto } from './dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái ứng dụng' })
  @ApiBaseResponse(HealthResponseDto, {
    description: 'Kiểm tra trạng thái thành công',
  })
  @ResponseMessage('Kiểm tra trạng thái thành công')
  getHealth(): HealthResponseDto {
    return this.healthService.getHealth();
  }
}
