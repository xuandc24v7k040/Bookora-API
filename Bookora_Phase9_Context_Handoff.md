# Bookora Phase 9 — Categories & Shared R2 Image Upload — Handoff

> Trạng thái: **PENDING manual responsive UI verification**  
> Runtime contract: `/api/v1`, OpenAPI 73 operations / 69 schemas.

## Phạm vi đã triển khai

- Categories global API cho SYSTEM Admin; không dùng `X-Branch-Id`, chưa mở public/client catalog.
- Cây danh mục tối đa hai cấp với invariant parent/type/cycle và transaction serializable.
- Hard-delete có điều kiện, không cascade/orphan; trả machine code khi còn child hoặc product.
- Slug backend-only: sinh lúc create, giữ nguyên khi đổi tên, không nhận từ request.
- Shared R2 public/private adapter và image pipeline JPEG/PNG/WebP → WebP, ULID key,
  metadata stripped, auto-rotate, no-upscale, immutable cache.
- Replace/remove ảnh cập nhật DB trước rồi cleanup object; upload lỗi sau create/update được
  báo partial success ở UI.
- Admin list/tree/detail/create/update/status/delete, TreeSelect hardened,
  ImageDropzone và Eye preview. UI không hiển thị slug hoặc ULID.
- Permission catalog: `categories.read/create/update/delete`.
- Seeder riêng: 8 root + 32 child = 40 category; chạy lặp giữ dữ liệu admin-owned.

## Database và storage

- Migration `20260720090000_remove_category_icon_url` chỉ drop `categories.icon_url`.
- Audit trước migration: categories rỗng, không có icon/image cần backfill.
- Prisma validate/status/diff đều sạch; 10 migrations đã apply.
- R2 localhost smoke chạy thật: upload, public read WebP, replace + xóa object cũ,
  remove + xóa object mới, cleanup fixture đều pass.

## Contract và generated client

| Endpoint | operationId | Permission | CSRF | X-Branch-Id |
| --- | --- | --- | --- | --- |
| GET `/categories/tree` | `categoriesTree` | `categories.read` | Không | Không |
| GET `/categories/:id` | `categoriesGet` | `categories.read` | Không | Không |
| POST `/categories` | `categoriesCreate` | `categories.create` | Có | Không |
| PATCH `/categories/:id` | `categoriesUpdate` | `categories.update` | Có | Không |
| DELETE `/categories/:id` | `categoriesDelete` | `categories.delete` | Có | Không |
| PUT `/categories/:id/image` | `categoriesUploadImage` | `categories.update` | Có | Không |
| DELETE `/categories/:id/image` | `categoriesRemoveImage` | `categories.update` | Có | Không |

- `npm run docs:check`: 73 operations / 69 schemas.
- Frontend `npm run gen:api:local`: pass; generated Zod có 103 `zod.ulid()` và 0 forbidden occurrence.

## Regression evidence

- Backend: type-check, lint, 391/391 tests, build pass.
- Frontend: 520/520 tests, Vue TypeScript check và production build pass.
- Prisma validate/migrate status/diff, OpenAPI contract/lint, `git diff --check` pass.
- Integration smoke: unauthenticated 401, BRANCH 403, missing CSRF 403, seed 8/32,
  cấp ba bị từ chối, rename giữ slug, parent delete bị từ chối, CRUD cleanup pass.
- GitNexus không được re-analyze. Detect changes backend LOW. Frontend báo HIGH vì file
  menu tham gia 12 navigation/login flows; production function bodies không đổi và menu/policy/
  route regression tests đã pass.

## Việc còn lại để ghi PHASE 9 — DONE

- Manual UI authenticated tại 1440×900, 1024×768, 768×1024, 390×844.
- Xác nhận trực quan dialog scroll/z-index/focus, table overflow, console/network và toàn bộ
  ImageDropzone flow. Local login hiện bật Cloudflare Turnstile nên automation dừng trước CAPTCHA.

## Deferred

- Public/client mega menu và Product catalog.
- Category cấp ba, cascade delete và slug regeneration.
