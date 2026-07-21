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
  'productId',
  'categoryId',
  'supplierId',
  'publisherId',
  'authorId',
  'attributeId',
  'optionId',
  'optionValueId',
  'valueId',
  'variantId',
  'replacementBranchId',
  'primaryBranchId',
]);
const ID_ARRAY_PROPERTY_NAMES = new Set([
  'branchIds',
  'roleIds',
  'permissionIds',
  'destinationRoleIds',
  'categoryIds',
  'authorIds',
  'optionValueIds',
]);
const DATE_TIME_PROPERTY_NAMES = new Set([
  'createdAt',
  'updatedAt',
  'lastLoginAt',
  'timestamp',
  'releaseDate',
  'saleStartAt',
  'saleEndAt',
]);
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type SecurityRequirement = Record<string, string[]>;
type SchemaLike = {
  type?: string;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  uniqueItems?: boolean;
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
  content?: Record<
    string,
    {
      schema?: SchemaLike | { $ref: string };
      examples?: Record<string, { summary?: string; value: unknown }>;
    }
  >;
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
    .addTag(
      'products',
      'Quản lý Product, Options, Option Values và Variants toàn cục.',
    )
    .addSecurity('accessToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'accessToken',
      description: 'Cookie accessToken dùng để xác thực request cần user.',
    })
    .addSecurity('refreshToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'refreshToken',
      description: 'Cookie refreshToken dùng cho refresh/logout phiên.',
    })
    .addSecurity('csrfCookie', {
      type: 'apiKey',
      in: 'cookie',
      name: 'csrfToken',
      description:
        'Cookie csrfToken trong cơ chế CSRF double-submit. Phải đi cùng header X-CSRF-Token trên mutation cần CSRF.',
    })
    .addSecurity('csrfHeader', {
      type: 'apiKey',
      in: 'header',
      name: 'X-CSRF-Token',
      description:
        'Header CSRF double-submit. Giá trị phải trùng cookie csrfToken trên mutation cần CSRF.',
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
      if (isOauthRedirectPath(path)) {
        continue;
      }
      normalizeErrorResponses(operation);
      normalizeAuthErrorResponses(path, method, operation);
    }
  }
}

function addErrorResponseSchema(document: OpenAPIObject): void {
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ErrorResponseDto = {
    type: 'object',
    required: ['statusCode', 'message', 'error', 'path', 'method', 'timestamp'],
    properties: {
      statusCode: { type: 'number', example: 400 },
      message: { type: 'string', example: 'Dữ liệu không hợp lệ' },
      error: { type: 'string', example: 'Bad Request' },
      code: { type: 'string', example: 'CSRF_INVALID' },
      errors: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: { type: 'string' },
        },
        example: { email: ['email must be an email'] },
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
          'Chuyển hướng về frontend. Thành công: /auth/callback?success=true. Thất bại: /login?error=google_access_denied, /login?error=google_state_invalid hoặc /login?error=google_auth_failed.',
      },
    };
  }
}

function isOauthRedirectPath(path: string): boolean {
  return path === '/auth/google' || path === '/auth/google/callback';
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

function errorResponse(
  description: string,
  examples?: Record<string, { summary?: string; value: unknown }>,
): ResponseLike {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
        ...(examples ? { examples } : {}),
      },
    },
  };
}

function normalizeAuthErrorResponses(
  path: string,
  method: (typeof HTTP_METHODS)[number],
  operation: OperationLike,
): void {
  if (path === '/auth/register' && method === 'post') {
    operation.responses ??= {};
    operation.responses['400'] = errorResponse(
      'Dữ liệu validation không hợp lệ hoặc thiếu Turnstile token khi Turnstile bật. Turnstile missing token trả code TURNSTILE_REQUIRED.',
    );
    operation.responses['403'] = errorResponse(
      'CSRF failure trả code CSRF_INVALID. Turnstile verification/config/provider failure trả code TURNSTILE_FAILED.',
    );
    operation.responses['409'] = errorResponse('Email đã được sử dụng.');
    operation.responses['429'] = errorResponse(
      'Vượt quá giới hạn đăng ký trong cửa sổ throttle.',
    );
    return;
  }

  if (path === '/auth/login' && method === 'post') {
    operation.responses ??= {};
    operation.responses['400'] = errorResponse(
      'Dữ liệu validation không hợp lệ hoặc thiếu Turnstile token khi Turnstile bật. Turnstile missing token trả code TURNSTILE_REQUIRED.',
    );
    operation.responses['401'] = errorResponse(
      'Đăng nhập không hợp lệ. Backend cố ý trả lỗi generic cho email không tồn tại, mật khẩu sai, tài khoản inactive, provider không phù hợp hoặc thiếu password hash. Không được dùng response này để trigger refresh.',
    );
    operation.responses['403'] = errorResponse(
      'CSRF failure trả code CSRF_INVALID. Turnstile verification/config/provider failure trả code TURNSTILE_FAILED.',
    );
    operation.responses['429'] = errorResponse(
      'Quá giới hạn request hoặc tạm khóa đăng nhập theo email/IP. Runtime hiện không đảm bảo machine-readable code hoặc countdown có cấu trúc.',
    );
    return;
  }

  if (path === '/auth/logout' && method === 'post') {
    operation.description =
      `${operation.description ?? ''} Backend sử dụng accessToken hoặc refreshToken nếu cookie tồn tại để xác định user và revoke active sessions; chúng không phải security precondition bắt buộc.`.trim();
    operation.responses ??= {};
    delete operation.responses['400'];
    delete operation.responses['401'];
    operation.responses['403'] = errorResponse(
      'CSRF failure trả code CSRF_INVALID.',
    );
    return;
  }

  if (path === '/auth/refresh' && method === 'post') {
    operation.responses ??= {};
    delete operation.responses['400'];
    operation.responses['401'] = errorResponse(
      'Refresh session không hợp lệ. Có thể là missing refresh cookie, invalid/expired token, missing payload, missing/revoked/expired session, inactive user, REFRESH_TOKEN_ALREADY_ROTATED hoặc REFRESH_TOKEN_INVALID_OR_REUSED. REFRESH_TOKEN_ALREADY_ROTATED là concurrent rotation race loser; backend không revoke session và không clear cookies ở branch này. REFRESH_TOKEN_INVALID_OR_REUSED là refresh-token hash mismatch / invalid-or-reused; backend revoke matching session và clear auth cookies, không khẳng định đây là malicious reuse được xác nhận.',
      {
        alreadyRotated: {
          summary: 'Concurrent rotation race loser',
          value: {
            statusCode: 401,
            message: 'Refresh token đã được xoay vòng bởi một yêu cầu khác',
            error: 'Unauthorized',
            code: 'REFRESH_TOKEN_ALREADY_ROTATED',
            path: '/api/v1/auth/refresh',
            method: 'POST',
            timestamp: '2026-07-02T00:00:00.000Z',
          },
        },
        invalidOrReused: {
          summary: 'Refresh-token hash mismatch / invalid-or-reused',
          value: {
            statusCode: 401,
            message: 'Refresh token không hợp lệ hoặc đã được dùng lại',
            error: 'Unauthorized',
            code: 'REFRESH_TOKEN_INVALID_OR_REUSED',
            path: '/api/v1/auth/refresh',
            method: 'POST',
            timestamp: '2026-07-02T00:00:00.000Z',
          },
        },
      },
    );
    operation.responses['403'] = errorResponse(
      'CSRF failure trả code CSRF_INVALID.',
    );
    operation.responses['429'] = errorResponse(
      'Vượt quá giới hạn refresh trong cửa sổ throttle. Background refresh phải coi đây là transient/inconclusive, không tự động coi là session expired.',
    );
    return;
  }

  if (path === '/auth/me' && method === 'get') {
    operation.responses ??= {};
    delete operation.responses['400'];
    delete operation.responses['403'];
    operation.responses['401'] = errorResponse(
      'Access session không hợp lệ, hết hạn hoặc thiếu. Đây là eligible access-session 401 cho refresh flow nếu request chưa retry.',
    );
    return;
  }

  if (path === '/auth/csrf-token' && method === 'get') {
    operation.responses ??= {};
    delete operation.responses['400'];
    operation.responses['429'] = errorResponse(
      'Không lấy được CSRF token do vượt throttle. Frontend không được gửi mutation phụ thuộc CSRF nếu bootstrap token thất bại.',
    );
  }
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
    return [csrfSecurity()];
  }

  if (path === '/auth/logout') {
    return [csrfSecurity()];
  }

  if (path === '/auth/refresh') {
    return [csrfSecurity({ refreshToken: [] })];
  }

  if (!security) {
    return [csrfSecurity({ accessToken: [] })];
  }

  const requiresAccessToken = security.some((item) => 'accessToken' in item);
  const requiresRefreshToken = security.some((item) => 'refreshToken' in item);
  const requiresCsrf = security.some(
    (item) => 'csrf' in item || 'csrfCookie' in item || 'csrfHeader' in item,
  );

  if (requiresCsrf) {
    return [
      csrfSecurity({
        ...(requiresAccessToken ? { accessToken: [] } : {}),
        ...(requiresRefreshToken ? { refreshToken: [] } : {}),
      }),
    ];
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
    return [csrfSecurity()];
  }

  if (path === '/auth/logout') {
    return [csrfSecurity()];
  }

  if (path === '/auth/refresh') {
    return [csrfSecurity({ refreshToken: [] })];
  }

  if (method === 'get') {
    return [];
  }

  return [];
}

function csrfSecurity(
  requirements: SecurityRequirement = {},
): SecurityRequirement {
  return {
    ...requirements,
    csrfCookie: [],
    csrfHeader: [],
  };
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
      const declaredExample = propertySchema.example;
      Object.assign(propertySchema, ulidSchema());
      if (declaredExample) {
        propertySchema.example = declaredExample;
      }
    }

    if (ID_ARRAY_PROPERTY_NAMES.has(propertyName)) {
      propertySchema.type = 'array';
      propertySchema.items = ulidSchema(false);

      if (
        propertyName === 'branchIds' ||
        propertyName === 'roleIds' ||
        propertyName === 'destinationRoleIds'
      ) {
        propertySchema.minItems ??= 1;
      }

      propertySchema.uniqueItems ??= true;
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
