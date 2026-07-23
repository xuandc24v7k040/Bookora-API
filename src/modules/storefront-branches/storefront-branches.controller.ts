import { Controller, Get, applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiBaseResponse, ResponseMessage } from '@/common/decorators';
import { StorefrontBranchResponseDto } from './dto/storefront-branch-response.dto';
import { StorefrontBranchesService } from './storefront-branches.service';

const ApiStorefrontBranchErrors = () =>
  applyDecorators(
    ...[400, 429, 500].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('storefront-branches')
@ApiStorefrontBranchErrors()
@Controller('storefront/branches')
export class StorefrontBranchesController {
  constructor(private readonly service: StorefrontBranchesService) {}

  @Get()
  @ApiOperation({
    operationId: 'storefrontBranchesList',
    summary: 'Lấy danh sách chi nhánh đang phục vụ storefront',
  })
  @ApiBaseResponse(StorefrontBranchResponseDto, {
    description: 'Lấy danh sách chi nhánh thành công',
    isArray: true,
  })
  @ResponseMessage('Lấy danh sách chi nhánh thành công')
  list() {
    return this.service.list();
  }
}
