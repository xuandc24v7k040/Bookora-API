import { type INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

const ULID_PATTERN = '^[0-7][0-9A-HJKMNP-TV-Z]{25}$';
const ULID_EXAMPLE = '01JY7M9M9Z4Y7Y7K7QZJ9Y4S4T';
const ID_PROPERTY_NAMES = new Set([
  'id',
  'userId',
  'branchId',
  'roleId',
  'permissionId',
  'userBranchId',
  'sessionId',
  'fromBranchId',
  'toBranchId',
  'replacementBranchId',
  'primaryBranchId',
]);
const ID_ARRAY_PROPERTY_NAMES = new Set([
  'branchIds',
  'roleIds',
  'permissionIds',
  'destinationRoleIds',
]);
const DATE_TIME_PROPERTY_NAMES = new Set([
  'createdAt',
  'updatedAt',
  'lastLoginAt',
  'timestamp',
]);
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type SecurityRequirement = Record<string, string[]>;
type SchemaLike = {
  type?: string;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  example?: string;
  nullable?: boolean;
  items?: SchemaLike;
  properties?: Record<string, SchemaLike>;
};
type ParameterLike = {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: SchemaLike;
};
type OperationLike = {
  summary?: string;
  description?: string;
  operationId?: string;
  security?: SecurityRequirement[];
  parameters?: ParameterLike[];
  responses?: Record<string, ResponseLike>;
};
type ResponseLike = {
  description?: string;
  content?: Record<string, { schema?: SchemaLike | { $ref: string } }>;
};

function createSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Bookora API')
    .setDescription(
      'Contract OpenAPI chính thức cho backend Bookora. Frontend dùng cookie credentials, cookie accessToken/refreshToken và header X-CSRF-Token cho mutation cần CSRF.',
    )
    .setVersion('1.0')
    .setLicense('Proprietary', '')
    .addServer('/api/v1', 'API base path')
    .addTag('health', 'Kiểm tra trạng thái dịch vụ.')
    .addTag('users', 'Quản lý người dùng cấp hệ thống.')
    .addTag('auth', 'Đăng ký, đăng nhập, phiên đăng nhập, CSRF và OAuth.')
    .addTag('roles', 'Quản lý vai trò và quyền gán vào vai trò.')
    .addTag('permissions', 'Quản lý danh mục quyền.')
    .addTag('branches', 'Quản lý chi nhánh và phạm vi chi nhánh.')
    .addTag('branch-admins', 'Quản lý Branch Admin và phân công chi nhánh.')
    .addTag('staff', 'Quản lý Staff trong phạm vi chi nhánh.')
    .addSecurity('accessToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'accessToken',
    })
    .addSecurity('refreshToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'refreshToken',
    })
    .addSecurity('csrf', {
      type: 'apiKey',
      in: 'header',
      name: 'X-CSRF-Token',
    })
    .build();
}

export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  const options: SwaggerDocumentOptions = {
    operationIdFactory: (controllerKey: string, methodKey: string) => {
      const controller = controllerKey
        .replace(/Controller$/, '')
        .replace(/^App$/, '');

      return `${controller.charAt(0).toLowerCase()}${controller.slice(1)}${methodKey.charAt(0).toUpperCase()}${methodKey.slice(1)}`;
    },
  };

  const document = SwaggerModule.createDocument(
    app,
    createSwaggerConfig(),
    options,
  );
  normalizeOpenApiDocument(document);

  return document;
}

export function setupSwagger(app: INestApplication): void {
  const document = createSwaggerDocument(app);

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}

function normalizeOpenApiDocument(document: OpenAPIObject): void {
  deleteEmptyContact(document);
  deleteEmptyLicenseUrl(document);
  addErrorResponseSchema(document);
  normalizeOperations(document);
  normalizeComponentSchemas(document);
}

function deleteEmptyContact(document: OpenAPIObject): void {
  if (
    document.info.contact &&
    Object.keys(document.info.contact).length === 0
  ) {
    delete document.info.contact;
  }
}

function deleteEmptyLicenseUrl(document: OpenAPIObject): void {
  if (document.info.license?.url === '') {
    delete document.info.license.url;
  }
}

function normalizeOperations(document: OpenAPIObject): void {
  for (const [path, pathItem] of Object.entries(document.paths)) {
    const operations = pathItem as Record<string, OperationLike>;

    for (const method of HTTP_METHODS) {
      const operation = operations[method];
      if (!operation) {
        continue;
      }

      operation.description ??= operation.summary;
      operation.security = normalizeSecurity(path, method, operation.security);
      normalizeParameters(operation.parameters);
      normalizeRedirectResponses(path, operation);
      normalizeErrorResponses(operation);
    }
  }
}

function addErrorResponseSchema(document: OpenAPIObject): void {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ErrorResponseDto = {
    type: 'object',
    required: ['statusCode', 'message', 'path', 'method', 'timestamp'],
    properties: {
      statusCode: { type: 'number', example: 400 },
      message: { type: 'string', example: 'Dữ liệu không hợp lệ' },
      error: { type: 'string', example: 'Bad Request' },
      code: { type: 'string', example: 'VALIDATION_ERROR' },
      errors: {
        type: 'array',
        items: { type: 'string' },
        example: ['email must be an email'],
      },
      path: { type: 'string', example: '/api/v1/auth/login' },
      method: { type: 'string', example: 'POST' },
      timestamp: {
        type: 'string',
        format: 'date-time',
        example: '2026-06-28T12:00:00.000Z',
      },
    },
  };
}

function normalizeRedirectResponses(
  path: string,
  operation: OperationLike,
): void {
  if (path === '/auth/google') {
    operation.responses = {
      '302': {
        description:
          'Chuyển hướng sang Google OAuth và set cookie oauthState đã ký.',
      },
    };
  }

  if (path === '/auth/google/callback') {
    operation.responses = {
      '302': {
        description:
          'Chuyển hướng về frontend sau khi xác thực Google thành công hoặc thất bại.',
      },
    };
  }
}

function normalizeErrorResponses(operation: OperationLike): void {
  operation.responses ??= {};

  const has4xx = Object.keys(operation.responses).some((status) =>
    status.startsWith('4'),
  );
  if (has4xx) {
    return;
  }

  operation.responses['400'] = errorResponse(
    'Yêu cầu không hợp lệ hoặc dữ liệu validation không hợp lệ.',
  );

  const security = operation.security ?? [];
  const requiresAuthCookie = security.some(
    (item) => 'accessToken' in item || 'refreshToken' in item,
  );

  if (requiresAuthCookie) {
    operation.responses['401'] = errorResponse(
      'Cookie phiên đăng nhập không hợp lệ, hết hạn hoặc thiếu.',
    );
  }

  if (security.some((item) => 'accessToken' in item)) {
    operation.responses['403'] = errorResponse(
      'User không có quyền hoặc không thuộc phạm vi chi nhánh hợp lệ.',
    );
  }
}

function errorResponse(description: string): ResponseLike {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      },
    },
  };
}

function normalizeSecurity(
  path: string,
  method: (typeof HTTP_METHODS)[number],
  security: SecurityRequirement[] | undefined,
): SecurityRequirement[] {
  if (path === '/health') {
    return [];
  }

  if (method === 'get') {
    if (path.startsWith('/auth/')) {
      return normalizeAuthSecurity(path, method);
    }

    return security ?? [{ accessToken: [] }];
  }

  if (path === '/auth/register' || path === '/auth/login') {
    return [{ csrf: [] }];
  }

  if (path === '/auth/logout') {
    return [{ accessToken: [], refreshToken: [], csrf: [] }];
  }

  if (path === '/auth/refresh') {
    return [{ refreshToken: [], csrf: [] }];
  }

  if (!security) {
    return [{ accessToken: [], csrf: [] }];
  }

  const requiresAccessToken = security.some((item) => 'accessToken' in item);
  const requiresCsrf = security.some((item) => 'csrf' in item);

  if (requiresAccessToken && requiresCsrf) {
    return [{ accessToken: [], csrf: [] }];
  }

  return security;
}

function normalizeAuthSecurity(
  path: string,
  method: (typeof HTTP_METHODS)[number],
): SecurityRequirement[] {
  if (path === '/auth/me') {
    return [{ accessToken: [] }];
  }

  if (path === '/auth/register' || path === '/auth/login') {
    return [{ csrf: [] }];
  }

  if (path === '/auth/logout') {
    return [{ accessToken: [], refreshToken: [], csrf: [] }];
  }

  if (path === '/auth/refresh') {
    return [{ refreshToken: [], csrf: [] }];
  }

  if (method === 'get') {
    return [];
  }

  return [];
}

function normalizeParameters(parameters: ParameterLike[] | undefined): void {
  if (!parameters) {
    return;
  }

  for (const parameter of parameters) {
    if (
      parameter.in === 'path' &&
      parameter.name &&
      ID_PROPERTY_NAMES.has(parameter.name)
    ) {
      parameter.schema = ulidSchema();
    }

    if (parameter.in === 'header' && parameter.name === 'X-Branch-Id') {
      parameter.description =
        parameter.required === true
          ? 'ULID chi nhánh đang được chọn. Bắt buộc với route cần selected branch.'
          : 'ULID chi nhánh đang được chọn. Có thể bỏ qua với route Super Admin hoặc route hỗ trợ scope rộng.';
      parameter.schema = ulidSchema();
    }
  }
}

function normalizeComponentSchemas(document: OpenAPIObject): void {
  const schemas = document.components?.schemas as
    | Record<string, SchemaLike>
    | undefined;

  if (!schemas) {
    return;
  }

  for (const schema of Object.values(schemas)) {
    normalizeSchemaProperties(schema);
  }
}

function normalizeSchemaProperties(schema: SchemaLike): void {
  if (!schema.properties) {
    return;
  }

  for (const [propertyName, propertySchema] of Object.entries(
    schema.properties,
  )) {
    if (ID_PROPERTY_NAMES.has(propertyName)) {
      Object.assign(propertySchema, ulidSchema());
    }

    if (ID_ARRAY_PROPERTY_NAMES.has(propertyName)) {
      propertySchema.type = 'array';
      propertySchema.items = ulidSchema(false);
    }

    if (DATE_TIME_PROPERTY_NAMES.has(propertyName)) {
      propertySchema.type = 'string';
      propertySchema.format = 'date-time';
    }

    if (
      (propertyName === 'description' || propertyName === 'phone') &&
      propertySchema.type === 'object' &&
      !propertySchema.properties
    ) {
      propertySchema.type = 'string';
      propertySchema.nullable = true;
    }

    if (propertySchema.items) {
      normalizeSchemaProperties(propertySchema.items);
    }

    normalizeSchemaProperties(propertySchema);
  }
}

function ulidSchema(includeExample = true): SchemaLike {
  return {
    type: 'string',
    format: 'ulid',
    pattern: ULID_PATTERN,
    minLength: 26,
    maxLength: 26,
    ...(includeExample ? { example: ULID_EXAMPLE } : {}),
  };
}
