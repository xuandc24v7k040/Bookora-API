import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

interface ApiBaseResponseOptions {
  description: string;
  status?: number;
  isArray?: boolean;
}

export function ApiBaseResponse<TModel extends Type<unknown>>(
  model: TModel,
  options: ApiBaseResponseOptions,
) {
  const status = options.status ?? 200;
  const dataSchema = options.isArray
    ? {
        type: 'array',
        items: { $ref: getSchemaPath(model) },
      }
    : { $ref: getSchemaPath(model) };

  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      description: options.description,
      schema: {
        type: 'object',
        required: ['statusCode', 'message', 'data'],
        properties: {
          statusCode: { type: 'number', example: status },
          message: { type: 'string', example: options.description },
          data: dataSchema,
        },
      },
    }),
  );
}
