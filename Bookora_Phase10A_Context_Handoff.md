# Bookora Phase 10A — Product Master Data Foundation — Handoff

## Phạm vi đã triển khai

- Global SYSTEM Admin CRUD cho Suppliers, Publishers, Authors và Product Attributes.
- 20 OpenAPI operations có operationId ổn định, JWT/permission/CSRF theo contract.
- Server-side search, filter, sort, pagination; stable `id ASC` tie-break; usage count.
- Backend-only slug cho Supplier/Publisher/Author, sinh lại khi đổi tên.
- Hard-delete bị chặn khi còn Product/ProductAuthor/AttributeValue tham chiếu.
- Product Attribute `code`/`type` bất biến sau khi đã có AttributeValue.
- 16 permission mới; role Super Admin nhận đủ 16 quyền.
- Seed riêng, idempotent: 5 suppliers, 8 publishers, 12 authors, 10 attributes; đủ
  sáu `ProductAttributeType`. Seed không ghi đè record đã tồn tại.
- Vue SYSTEM Admin có list/detail/create/edit/delete cho cả bốn catalog; URL đồng bộ
  page/filter/sort, query giữ previous data, dialog có fixed action area và form
  scrollable; delete dùng accessible AlertDialog.
- OpenAPI backend đã sync sang frontend và Orval được regenerate bằng workflow chính thức.

## Không thay đổi

- Không có migration Phase 10A: 12-table product schema đã tồn tại và validate hợp lệ.
- Không mở public/client product catalog, product CRUD, variants, inventory hoặc pricing.
- Không dùng `X-Branch-Id` cho bốn catalog global.
- Không thay auth cookie/JWT/refresh/CSRF/session architecture.

## Endpoint matrix

| Resource | List | Create | Detail | Update | Delete |
| --- | --- | --- | --- | --- | --- |
| suppliers | `suppliersList` | `suppliersCreate` | `suppliersGet` | `suppliersUpdate` | `suppliersDelete` |
| publishers | `publishersList` | `publishersCreate` | `publishersGet` | `publishersUpdate` | `publishersDelete` |
| authors | `authorsList` | `authorsCreate` | `authorsGet` | `authorsUpdate` | `authorsDelete` |
| product-attributes | `productAttributesList` | `productAttributesCreate` | `productAttributesGet` | `productAttributesUpdate` | `productAttributesDelete` |

## Verification handoff

- Backend: Prisma validate/generate, type-check, lint, build, Jest, docs check.
- Frontend: generated-Zod policy, Vitest and production build.
- Run `detect_changes` in both repositories before any future commit.
- Authenticated browser scenarios require a human to complete Turnstile in the local
  login flow; do not bypass or automate the challenge.
