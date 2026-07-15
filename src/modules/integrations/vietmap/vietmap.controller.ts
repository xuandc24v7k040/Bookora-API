import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiBaseResponse } from '@/common/decorators';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { Permissions } from '@/modules/authorization/decorators/permissions.decorator';
import { PermissionsGuard } from '@/modules/authorization/guards/permissions.guard';
import {
  VietMapAutocompleteQueryDto,
  VietMapLocationResponseDto,
  VietMapPlaceQueryDto,
  VietMapReverseQueryDto,
  VietMapSuggestionResponseDto,
} from './dto/vietmap.dto';
import { VietMapService } from './vietmap.service';

@ApiTags('vietmap')
@ApiSecurity('accessToken')
@Controller('integrations/vietmap')
@UseGuards(JwtAccessGuard, PermissionsGuard)
@Permissions('branches.read')
@ApiResponse({ status: 502, description: 'VietMap provider unavailable' })
@ApiResponse({ status: 504, description: 'VietMap provider timeout' })
export class VietMapController {
  constructor(private readonly service: VietMapService) {}

  @Get('reverse')
  @ApiOperation({
    summary: 'Reverse geocode a branch location with VietMap v4',
  })
  @ApiBaseResponse(VietMapLocationResponseDto, {
    description: 'Branch location resolved',
  })
  reverse(@Query() query: VietMapReverseQueryDto) {
    return this.service.reverse(query);
  }

  @Get('autocomplete')
  @ApiOperation({
    summary: 'Search branch location suggestions with VietMap v4',
  })
  @ApiBaseResponse(VietMapSuggestionResponseDto, {
    description: 'Location suggestions retrieved',
    isArray: true,
  })
  autocomplete(@Query() query: VietMapAutocompleteQueryDto) {
    return this.service.autocomplete(query);
  }

  @Get('place')
  @ApiOperation({ summary: 'Resolve a VietMap v4 place reference' })
  @ApiBaseResponse(VietMapLocationResponseDto, {
    description: 'Place resolved',
  })
  place(@Query() query: VietMapPlaceQueryDto) {
    return this.service.place(query.reference);
  }
}
