require('dotenv').config();

const { JwtService } = require('@nestjs/jwt');
const { HeadObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');
const sharp = require('sharp');
const { ulid } = require('ulid');

const baseUrl = 'http://localhost:8000/api/v1/categories';
const csrfToken = `phase9-${ulid()}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const jwt = new JwtService();
const r2 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  region: process.env.R2_REGION || 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const createdCategoryIds = [];
const createdSessionIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function jsonRequest(path, options = {}, auth) {
  const headers = { ...(options.headers || {}) };
  if (auth) {
    headers.cookie = `accessToken=${auth}; csrfToken=${csrfToken}`;
    if (!['GET', 'HEAD'].includes(options.method || 'GET')) {
      headers['x-csrf-token'] = csrfToken;
    }
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

async function createTestSession(email) {
  const userResult = await pool.query(
    'SELECT id, email FROM users WHERE email = $1 AND is_active = true',
    [email],
  );
  const user = userResult.rows[0];
  assert(user, `Missing development user ${email}`);
  const sessionId = ulid();
  await pool.query(
    `INSERT INTO auth_sessions
      (id, user_id, refresh_token_hash, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '30 minutes', NOW(), NOW())`,
    [sessionId, user.id, `phase9-${ulid()}`],
  );
  createdSessionIds.push(sessionId);
  return jwt.sign(
    { sub: user.id, email: user.email, sid: sessionId },
    { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
  );
}

function publicKey(url) {
  const base = new URL(
    `${process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, '')}/`,
  );
  const candidate = new URL(url);
  return decodeURIComponent(candidate.pathname.slice(base.pathname.length));
}

async function objectExists(url) {
  try {
    await r2.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_PUBLIC_BUCKET,
        Key: publicKey(url),
      }),
    );
    return true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound')
      return false;
    throw error;
  }
}

async function main() {
  const systemToken = await createTestSession('superadmin@bookora.local');
  const branchToken = await createTestSession('branchadmin.ct@bookora.local');
  const result = {};

  result.unauthenticated = (await jsonRequest('/tree')).status;
  result.branchForbidden = (await jsonRequest('/tree', {}, branchToken)).status;
  const tree = await jsonRequest(
    '/tree?sortBy=sortOrder&sortOrder=asc',
    {},
    systemToken,
  );
  assert(tree.status === 200, `Tree failed with ${tree.status}`);
  assert(tree.payload.data.length === 8, 'Expected 8 root categories');
  assert(
    tree.payload.data.reduce((sum, root) => sum + root.children.length, 0) ===
      32,
    'Expected 32 child categories',
  );
  result.seed = '8 roots / 32 children';

  const missingCsrf = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      cookie: `accessToken=${systemToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: 'Should not create' }),
  });
  result.csrfRejected = missingCsrf.status;

  const suffix = ulid().slice(-8);
  const root = await jsonRequest(
    '',
    {
      method: 'POST',
      body: { name: `Phase 9 Verify ${suffix}`, sortOrder: 9998 },
    },
    systemToken,
  );
  assert(root.status === 201, `Create root failed with ${root.status}`);
  createdCategoryIds.push(root.payload.data.id);

  const moveRoot = await jsonRequest(
    '',
    {
      method: 'POST',
      body: { name: `Phase 9 Move Parent ${suffix}`, sortOrder: 9999 },
    },
    systemToken,
  );
  assert(
    moveRoot.status === 201,
    `Create move parent failed with ${moveRoot.status}`,
  );
  createdCategoryIds.push(moveRoot.payload.data.id);

  const child = await jsonRequest(
    '',
    {
      method: 'POST',
      body: {
        name: `Phase 9 Child ${suffix}`,
        parentId: root.payload.data.id,
        sortOrder: 0,
      },
    },
    systemToken,
  );
  assert(child.status === 201, `Create child failed with ${child.status}`);
  createdCategoryIds.push(child.payload.data.id);

  const thirdLevel = await jsonRequest(
    '',
    {
      method: 'POST',
      body: {
        name: `Phase 9 Invalid ${suffix}`,
        parentId: child.payload.data.id,
      },
    },
    systemToken,
  );
  assert(
    thirdLevel.status === 400,
    `Third level should be 400, got ${thirdLevel.status}`,
  );
  result.thirdLevelRejected = thirdLevel.payload.code;

  const oldSlug = child.payload.data.slug;
  const renamedName = `Phase 9 Renamed ${suffix}`;
  const renamed = await jsonRequest(
    `/${child.payload.data.id}`,
    { method: 'PATCH', body: { name: renamedName } },
    systemToken,
  );
  assert(
    renamed.status === 200 && renamed.payload.data.slug !== oldSlug,
    'Renaming must regenerate the slug',
  );
  result.slugRegeneratedOnRename = true;

  const moved = await jsonRequest(
    `/${child.payload.data.id}`,
    { method: 'PATCH', body: { parentId: moveRoot.payload.data.id } },
    systemToken,
  );
  assert(
    moved.status === 200 &&
      moved.payload.data.parentId === moveRoot.payload.data.id &&
      moved.payload.data.slug !== renamed.payload.data.slug,
    'Moving to a different parent must regenerate the slug',
  );
  result.slugRegeneratedOnParentMove = true;

  const blockedDelete = await jsonRequest(
    `/${moveRoot.payload.data.id}`,
    { method: 'DELETE' },
    systemToken,
  );
  assert(
    blockedDelete.status === 409,
    `Parent delete should be 409, got ${blockedDelete.status}`,
  );
  result.parentDeleteRejected = blockedDelete.payload.code;

  const firstImage = await sharp({
    create: { width: 900, height: 500, channels: 3, background: '#2563eb' },
  })
    .png()
    .toBuffer();
  const firstForm = new FormData();
  firstForm.set(
    'file',
    new Blob([firstImage], { type: 'image/png' }),
    'phase9-first.png',
  );
  const uploaded = await jsonRequest(
    `/${child.payload.data.id}/image`,
    { method: 'PUT', body: firstForm },
    systemToken,
  );
  assert(
    uploaded.status === 200 && uploaded.payload.data.imageUrl,
    `Image upload failed with ${uploaded.status}`,
  );
  const firstUrl = uploaded.payload.data.imageUrl;
  const firstPublic = await fetch(firstUrl);
  assert(
    firstPublic.ok,
    `Uploaded image is not public (${firstPublic.status})`,
  );
  assert(
    firstPublic.headers.get('content-type')?.startsWith('image/webp'),
    'Uploaded image must be WebP',
  );

  const secondImage = await sharp({
    create: { width: 700, height: 1100, channels: 3, background: '#f97316' },
  })
    .jpeg()
    .toBuffer();
  const secondForm = new FormData();
  secondForm.set(
    'file',
    new Blob([secondImage], { type: 'image/jpeg' }),
    'phase9-second.jpg',
  );
  const replaced = await jsonRequest(
    `/${child.payload.data.id}/image`,
    { method: 'PUT', body: secondForm },
    systemToken,
  );
  assert(
    replaced.status === 200 && replaced.payload.data.imageUrl !== firstUrl,
    'Image replacement must use a new immutable URL',
  );
  assert(!(await objectExists(firstUrl)), 'Replaced R2 object must be deleted');
  const secondUrl = replaced.payload.data.imageUrl;
  const secondPublic = await fetch(secondUrl);
  assert(
    secondPublic.ok,
    `Replacement image is not public (${secondPublic.status})`,
  );

  const removed = await jsonRequest(
    `/${child.payload.data.id}/image`,
    { method: 'DELETE' },
    systemToken,
  );
  assert(
    removed.status === 200 && removed.payload.data.imageUrl === null,
    `Image removal failed with ${removed.status}`,
  );
  assert(!(await objectExists(secondUrl)), 'Removed R2 object must be deleted');
  result.r2Lifecycle = 'upload / public read / replace / remove';

  const deleteChild = await jsonRequest(
    `/${child.payload.data.id}`,
    { method: 'DELETE' },
    systemToken,
  );
  assert(
    deleteChild.status === 200,
    `Delete child failed with ${deleteChild.status}`,
  );
  createdCategoryIds.splice(
    createdCategoryIds.indexOf(child.payload.data.id),
    1,
  );
  const deleteRoot = await jsonRequest(
    `/${root.payload.data.id}`,
    { method: 'DELETE' },
    systemToken,
  );
  assert(
    deleteRoot.status === 200,
    `Delete root failed with ${deleteRoot.status}`,
  );
  createdCategoryIds.splice(
    createdCategoryIds.indexOf(root.payload.data.id),
    1,
  );
  const deleteMoveRoot = await jsonRequest(
    `/${moveRoot.payload.data.id}`,
    { method: 'DELETE' },
    systemToken,
  );
  assert(
    deleteMoveRoot.status === 200,
    `Delete move parent failed with ${deleteMoveRoot.status}`,
  );
  createdCategoryIds.splice(
    createdCategoryIds.indexOf(moveRoot.payload.data.id),
    1,
  );
  result.crudCleanup = true;

  console.log(JSON.stringify(result, null, 2));
}

main()
  .finally(async () => {
    if (createdCategoryIds.length) {
      await pool
        .query('DELETE FROM categories WHERE id = ANY($1)', [
          createdCategoryIds,
        ])
        .catch(() => undefined);
    }
    if (createdSessionIds.length) {
      await pool
        .query('DELETE FROM auth_sessions WHERE id = ANY($1)', [
          createdSessionIds,
        ])
        .catch(() => undefined);
    }
    await pool.end();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
