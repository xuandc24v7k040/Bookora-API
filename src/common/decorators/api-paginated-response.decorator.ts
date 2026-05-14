import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

export function ApiPaginatedResponse<TModel extends Type<unknown>>(
  model: TModel,
  description: string,
) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['statusCode', 'message', 'data', 'meta'],
        properties: {
          statusCode: { type: 'number', example: 200 },
          message: { type: 'string', example: description },
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
          },
          meta: {
            type: 'object',
            required: [
              'total',
              'page',
              'lastPage',
              'limit',
              'hasNextPage',
              'hasPreviousPage',
            ],
            properties: {
              total: { type: 'number', example: 42 },
              page: { type: 'number', example: 1 },
              lastPage: { type: 'number', example: 5 },
              limit: { type: 'number', example: 10 },
              hasNextPage: { type: 'boolean', example: true },
              hasPreviousPage: { type: 'boolean', example: false },
            },
          },
        },
      },
    }),
  );
}
