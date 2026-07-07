const fs = require('node:fs');
const path = require('node:path');

const OPENAPI_PATH = path.join(process.cwd(), 'docs', 'openapi.json');
const ULID_PATTERN = '^[0-7][0-9A-HJKMNP-TV-Z]{25}$';
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const ULID_NAMES = new Set([
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
const ULID_ARRAY_NAMES = new Set([
  'branchIds',
  'roleIds',
  'permissionIds',
  'destinationRoleIds',
]);
const PUBLIC_ROUTES = new Set([
  'GET /health',
  'GET /auth/csrf-token',
  'GET /auth/google',
  'GET /auth/google/callback',
]);
const SENSITIVE_FIELD_PATTERN =
  /passwordHash|refreshTokenHash|tokenHash|turnstileSecret|csrfSecret|oauthToken|rawSessionToken/i;

const document = JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
const failures = [];
const operations = [];

for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!HTTP_METHODS.has(method)) {
      continue;
    }

    operations.push({
      key: `${method.toUpperCase()} ${routePath}`,
      method,
      path: routePath,
      operation,
    });
  }
}

const operationIds = new Map();
for (const item of operations) {
  const { key, operation } = item;
  requireField(operation.operationId, `${key} thiếu operationId`);
  requireField(operation.summary, `${key} thiếu summary`);
  requireArray(operation.tags, `${key} thiếu tags`);

  if (operation.security === undefined) {
    failures.push(`${key} thiếu security hoặc security: []`);
  }

  if (operation.operationId) {
    operationIds.set(
      operation.operationId,
      (operationIds.get(operation.operationId) ?? 0) + 1,
    );
  }

  const successResponses = Object.entries(operation.responses ?? {}).filter(
    ([status]) => status.startsWith('2') || status.startsWith('3'),
  );
  if (successResponses.length === 0) {
    failures.push(`${key} thiếu success response`);
  }

  for (const [status, response] of successResponses) {
    if (status === '204' || status.startsWith('3')) {
      continue;
    }

    const schema = response.content?.['application/json']?.schema;
    if (!schema) {
      failures.push(`${key} response ${status} thiếu schema`);
    }
  }

  for (const parameter of operation.parameters ?? []) {
    if (parameter.in === 'path' && ULID_NAMES.has(parameter.name)) {
      assertUlidSchema(parameter.schema, `${key} path param ${parameter.name}`);
    }

    if (parameter.in === 'header' && parameter.name === 'X-Branch-Id') {
      assertUlidSchema(parameter.schema, `${key} header X-Branch-Id`);
    }
  }
}

for (const [operationId, count] of operationIds.entries()) {
  if (count > 1) {
    failures.push(`operationId bị trùng: ${operationId}`);
  }
}

const schemas = document.components?.schemas ?? {};
for (const [schemaName, schema] of Object.entries(schemas)) {
  inspectSchema(schemaName, schema, `components.schemas.${schemaName}`);
}

const securitySchemes = document.components?.securitySchemes ?? {};
assertSecurityScheme(securitySchemes.accessToken, 'cookie', 'accessToken');
assertSecurityScheme(securitySchemes.csrfCookie, 'cookie', 'csrfToken');
assertSecurityScheme(securitySchemes.csrfHeader, 'header', 'X-CSRF-Token');
if (securitySchemes.csrf) {
  failures.push('security scheme csrf cũ không được xuất hiện');
}

for (const key of PUBLIC_ROUTES) {
  const item = operations.find((operation) => operation.key === key);
  if (!item) {
    failures.push(`${key} không tồn tại`);
    continue;
  }

  if (JSON.stringify(item.operation.security) !== '[]') {
    failures.push(`${key} phải khai báo security: []`);
  }
}

const transfer = operations.find(
  (operation) => operation.key === 'POST /staff/{id}/transfer-branch',
);
if (
  transfer?.operation.parameters?.some(
    (parameter) => parameter.name === 'X-Branch-Id',
  )
) {
  failures.push('POST /staff/{id}/transfer-branch không được có X-Branch-Id');
}

assertSecurityObject(
  operations.find((operation) => operation.key === 'POST /auth/login'),
  ['csrfCookie', 'csrfHeader'],
);
assertSecurityObject(
  operations.find((operation) => operation.key === 'POST /auth/register'),
  ['csrfCookie', 'csrfHeader'],
);
assertSecurityObjectExact(
  operations.find((operation) => operation.key === 'POST /auth/logout'),
  ['csrfCookie', 'csrfHeader'],
);

assertResponses('POST /auth/login', ['200', '400', '401', '403', '429']);
assertResponses('POST /auth/register', ['201', '400', '403', '409', '429']);
assertResponses('GET /auth/csrf-token', ['200', '429']);
assertResponses('POST /auth/refresh', ['200', '401', '403', '429']);
assertResponses('POST /auth/logout', ['200', '403']);
assertNoResponses('POST /auth/logout', ['401']);
assertResponses('GET /auth/me', ['200', '401']);
assertNoResponses('GET /auth/me', ['403']);
assertRefresh401Documentation();

for (const item of operations) {
  const isMutation = ['post', 'put', 'patch', 'delete'].includes(item.method);
  const security = item.operation.security ?? [];
  const requiresAccessToken = security.some((entry) => 'accessToken' in entry);
  const requiresCsrf =
    security.some((entry) => 'csrfCookie' in entry || 'csrfHeader' in entry) ||
    security.some((entry) => 'csrf' in entry);

  if (isMutation && requiresAccessToken && requiresCsrf) {
    assertSecurityObject(item, ['accessToken', 'csrfCookie', 'csrfHeader']);
  }
}

for (const key of [
  'GET /staff',
  'POST /staff',
  'GET /staff/{id}',
  'PATCH /staff/{id}',
  'DELETE /staff/{id}',
]) {
  const item = operations.find((operation) => operation.key === key);
  if (
    !item?.operation.parameters?.some(
      (parameter) => parameter.name === 'X-Branch-Id',
    )
  ) {
    failures.push(`${key} thiếu X-Branch-Id`);
  }
}

if (SENSITIVE_FIELD_PATTERN.test(JSON.stringify(schemas))) {
  failures.push('components.schemas có field nhạy cảm');
}

if (failures.length > 0) {
  console.error('OpenAPI contract check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `OpenAPI contract check passed: ${operations.length} operations, ${
    Object.keys(schemas).length
  } schemas.`,
);

function requireField(value, message) {
  if (!value) {
    failures.push(message);
  }
}

function requireArray(value, message) {
  if (!Array.isArray(value) || value.length === 0) {
    failures.push(message);
  }
}

function inspectSchema(schemaName, schema, location) {
  if (!schema || typeof schema !== 'object') {
    return;
  }

  if (
    schema.type === 'object' &&
    !schema.properties &&
    !schema.allOf &&
    !schema.oneOf &&
    !schema.anyOf
  ) {
    failures.push(`${location} là object mơ hồ không có properties`);
  }

  if (Object.keys(schema).length === 0) {
    failures.push(`${location} là schema rỗng {}`);
  }

  for (const [propertyName, propertySchema] of Object.entries(
    schema.properties ?? {},
  )) {
    if (ULID_NAMES.has(propertyName)) {
      assertUlidSchema(propertySchema, `${location}.${propertyName}`);
    }

    if (ULID_ARRAY_NAMES.has(propertyName)) {
      assertUlidArraySchema(propertySchema, `${location}.${propertyName}`);
    }

    inspectSchema(schemaName, propertySchema, `${location}.${propertyName}`);
  }

  if (schema.items) {
    inspectSchema(schemaName, schema.items, `${location}.items`);
  }
}

function assertUlidSchema(schema, location) {
  if (!schema) {
    failures.push(`${location} thiếu schema ULID`);
    return;
  }

  if (
    schema.type !== 'string' ||
    schema.format !== 'ulid' ||
    schema.pattern !== ULID_PATTERN ||
    schema.minLength !== 26 ||
    schema.maxLength !== 26
  ) {
    failures.push(`${location} chưa có schema ULID canonical`);
  }
}

function assertUlidArraySchema(schema, location) {
  if (schema?.type !== 'array') {
    failures.push(`${location} phải là array`);
    return;
  }

  assertUlidSchema(schema.items, `${location}.items`);
}

function assertSecurityObject(item, requiredSchemes) {
  if (!item) {
    failures.push('Không tìm thấy operation cần kiểm tra security');
    return;
  }

  const security = item.operation.security;
  if (!Array.isArray(security) || security.length !== 1) {
    failures.push(
      `${item.key} phải có đúng một security object để biểu diễn AND`,
    );
    return;
  }

  for (const scheme of requiredSchemes) {
    if (!(scheme in security[0])) {
      failures.push(`${item.key} thiếu security scheme ${scheme}`);
    }
  }
}

function assertSecurityObjectExact(item, requiredSchemes) {
  assertSecurityObject(item, requiredSchemes);
  if (!item?.operation.security?.[0]) {
    return;
  }

  const actualSchemes = Object.keys(item.operation.security[0]).sort();
  const expectedSchemes = [...requiredSchemes].sort();
  if (JSON.stringify(actualSchemes) !== JSON.stringify(expectedSchemes)) {
    failures.push(
      `${item.key} security phải đúng ${expectedSchemes.join(', ')}, hiện có ${actualSchemes.join(', ')}`,
    );
  }
}

function assertResponses(operationKey, statuses) {
  const item = operations.find((operation) => operation.key === operationKey);
  if (!item) {
    failures.push(`${operationKey} không tồn tại`);
    return;
  }

  for (const status of statuses) {
    if (!item.operation.responses?.[status]) {
      failures.push(`${operationKey} thiếu response ${status}`);
    }
  }
}

function assertNoResponses(operationKey, statuses) {
  const item = operations.find((operation) => operation.key === operationKey);
  if (!item) {
    failures.push(`${operationKey} không tồn tại`);
    return;
  }

  for (const status of statuses) {
    if (item.operation.responses?.[status]) {
      failures.push(`${operationKey} không được có response ${status}`);
    }
  }
}

function assertRefresh401Documentation() {
  const item = operations.find(
    (operation) => operation.key === 'POST /auth/refresh',
  );
  const response = item?.operation.responses?.['401'];
  const serialized = JSON.stringify(response);

  for (const code of [
    'REFRESH_TOKEN_ALREADY_ROTATED',
    'REFRESH_TOKEN_INVALID_OR_REUSED',
  ]) {
    if (!serialized.includes(code)) {
      failures.push(`POST /auth/refresh response 401 thiếu ${code}`);
    }
  }
}

function assertSecurityScheme(scheme, expectedIn, expectedName) {
  if (
    scheme?.type !== 'apiKey' ||
    scheme.in !== expectedIn ||
    scheme.name !== expectedName
  ) {
    failures.push(`security scheme ${expectedName} không đúng contract`);
  }
}
