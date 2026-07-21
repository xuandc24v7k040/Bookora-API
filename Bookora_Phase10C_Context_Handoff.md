# Bookora Phase 10C — Final Hotfix Acceptance Handoff

Ngày tái kiểm tra: 2026-07-21 (Asia/Saigon)

## Trạng thái cuối

```text
PHASE 10C — PRODUCT MEDIA, R2 & FINALIZATION — PENDING
PHASE 10 — PRODUCTS ADMIN — PENDING
```

Command authoritative `npm run verify:phase9:categories` đã PASS sau khi verifier stale được đồng bộ với contract hiện hành: rename và move parent đều phải regenerate slug theo effective scope. Không thay đổi Category service/repository hoặc Product logic.

Manual browser đã quét đủ 48 route/viewport không overflow và click các action chính. Tuy nhiên native mouse automation không kích hoạt được SortableJS drag; runtime callback thật của `vue-draggable-plus` đã được kích trong browser để xác minh đúng một reorder request, persist sau reload và rollback khi request bị abort. Vì prompt yêu cầu thao tác drag chuột/touch thật, mục này vẫn được ghi trung thực là chưa có bằng chứng pointer/touch acceptance độc lập.

## BOUND

- Frontend: `D:\CTU\CT466E\bookora-web\bookora-web`.
- Backend: `D:\CTU\CT466E\bookora-api\bookora-api`.
- Runtime: `http://localhost:5173`, API/OpenAPI `http://localhost:8000`.
- Giữ toàn bộ worktree Phase 10A/10B/10C; không stage/commit/push/reset/clean.
- Không thêm dropzone upload mới, không đổi Product Media API/OpenAPI, không sửa generated code, không đổi schema/migration.
- Dependency duy nhất thêm theo prompt: `vue-draggable-plus` bằng npm/package-lock hiện hữu.
- GitNexus impact trước sửa: `ProductFormPage.vue` và `ProductDetailPage.vue` LOW, 1 direct router importer, 0 affected process; Product Media file chưa được index nên UNKNOWN. Final `detect_changes(compare master)` LOW, 7 indexed symbols, 0 affected process.

## Finding ledger 9 gate

| ID | Vấn đề | Root cause / kết quả | File chính | Evidence | Trạng thái |
|---|---|---|---|---|---|
| G-01 | Category verifier | Verifier stale đòi slug ổn định, trái với Category contract regenerate slug | `scripts/verify-phase9-categories.cjs` | `npm run verify:phase9:categories`: 8 root/32 child, rename/move regenerate slug, CRUD/R2 cleanup PASS | PASS |
| G-02 | Full frontend timeout | Wrapper 120 giây cũ ngắn hơn suite thật | Không cần sửa | Final chạy riêng: 125 files/606 tests PASS, 143.86s, exit 0 | PASS |
| G-03 | 6 viewport | Không có horizontal document overflow ở List/Create, 3 Edit, 3 Detail | UI hotfix files | 48/48 route×viewport PASS; console/network sạch | PASS với pointer-drag limitation |
| G-04 | Category + ACTIVE | Chuyện thiếu category; FO sai category và có 3 Variant Hộp 50 từ manual cũ | Dữ liệu qua UI/API chính thức | 3 fixture ACTIVE; FO 6/6; API/DB đồng nhất | PASS |
| G-05 | Full backend | Targeted cũ chưa đủ | Không sửa backend logic final | 58 suites/475 tests PASS, 102.679s | PASS |
| G-06 | Row focus | `focus-within:ring-2` đặt trên `<label>` Category/Author | `ProductFormPage.vue` | Bỏ row ring; checkbox giữ focus-visible ring; targeted/full tests PASS | PASS |
| G-07 | Drag reorder | Hai arrow chỉ đổi local state và cần nút Save | `ProductMediaSection.vue`, package files, tests | Drag handle, one-request persist, no-op, cross-gallery guard, rollback/toast; 6 component tests | PASS automated/runtime callback; pointer acceptance pending |
| G-08 | Primary star | Badge/nút chữ che ảnh, primary không có no-op control/loading riêng | `ProductMediaSection.vue`, tests | Star filled/outline, tooltip/ARIA/loading; runtime non-primary 1 request, current primary 0 | PASS |
| G-09 | Detail edit | Detail truyền prop không tồn tại `permission`; `PermissionGate` chỉ nhận `allOf/anyOf`, làm cả edit và publish action bị ẩn | `ProductDetailPage.vue`, contract test | Runtime Super Admin thấy Chỉnh sửa/publish; edit route đúng; full tests PASS | PASS |

## Dữ liệu/fixture cuối

| Product | Categories | Status | Variant active/total | General media/primary | Variant galleries có media |
|---|---|---:|---:|---:|---|
| ReLIFE `01KY02E528QZ1YXPX3DVEXFDE9` | Manga - Comic; Tiểu thuyết; Văn học | ACTIVE | 1/1 | 1/1 | — |
| Chuyện Tình Thị Trấn `01KY02J5ZJ90CEP1RMR3Z2XEJB` | Ngôn tình; Tiểu thuyết; Văn học | ACTIVE | 3/3 | 2/1 | CTTT-SOFTCOVER-MANUAL 2/1 |
| FO-024 `01KY03TYEC03VJBHS3A53249A5` | Giáo khoa - Tham khảo; Sách tham khảo | ACTIVE | 6/6 | 2/1 | FO024-001, FO024-003, FO024-005: mỗi gallery 2/1 |

- Root Category query `parent_id IS NULL`: 8.
- Cleanup chính thức: set default về `FO024-001`, xóa Variant `FO024-111`, `FO024-222`, `FO024-333`, rồi xóa OptionValue `Hộp 50`; mọi mutation HTTP 200.
- Cả ba Product publish bằng nút `Kích hoạt`; mỗi UI toast `Cập nhật trạng thái sản phẩm thành công.`.
- API detail của cả ba trả HTTP 200/ACTIVE; DB trả ACTIVE.
- 13/13 Product Media URL thực trả HTTP 200 và `image/webp`.

## Automated verification cuối

- Backend targeted: `npm test -- --runInBand src/modules/product-media src/modules/products src/modules/categories` — 11 suites/78 tests PASS, 26.116s.
- Backend full: `npm test -- --runInBand` — 58 suites/475 tests PASS, 102.679s.
- Backend `npm run lint`, `npm run type-check`, `npm run build` PASS; build 289 files.
- Backend Prisma format/validate/generate PASS; migrate status 11 migrations, up to date.
- Backend `npm run docs:check` PASS: 122 operations/108 schemas.
- Backend `npm run verify:phase9:categories` PASS: 8 root/32 child; rename và move parent regenerate slug; R2 lifecycle/CRUD cleanup PASS.
- Frontend targeted cuối: 2 files/11 tests PASS; Product Media riêng 6 tests PASS.
- Frontend final full chạy riêng: `npm test` — 125 files/606 tests PASS, 143.86s, exit 0.
- Một run đồng thời production build có 1 lazy-import test timeout 5s; rerun suite một mình không tăng timeout PASS toàn bộ, xác nhận resource contention.
- Frontend `npx vue-tsc -b --pretty false` PASS.
- Frontend final `npm run build` PASS, 4080 modules; warning chunk >500 kB còn là performance debt.
- `npm run verify:generated-zod` PASS: 15 files, 178 `zod.ulid()`, 0 forbidden.
- `git diff --check` PASS cả backend và frontend.

## Manual responsive matrix

Mỗi viewport dưới đây đã mở: Product List, Product Create, Edit simple/one-option/multi-option và Detail simple/one-option/multi-option.

| Viewport | Routes | Horizontal overflow | Console | Unexpected HTTP | Kết quả |
|---|---:|---:|---:|---:|---|
| 1440×900 | 8/8 | 0 | 0 | 0 | PASS |
| 1366×768 | 8/8 | 0 | 0 | 0 | PASS |
| 1024×768 | 8/8 | 0 | 0 | 0 | PASS |
| 768×1024 | 8/8 | 0 | 0 | 0 | PASS |
| 390×844 | 8/8 | 0 | 0 | 0 | PASS |
| 320×700 | 8/8 | 0 | 0 | 0 | PASS |

Browser action evidence: Category mouse click không tạo box shadow/outline trên row và focus nằm ở checkbox; preview/alt/delete dialog mở/đóng; non-primary star gửi 1 mutation, current primary gửi 0; edit/list navigation hoạt động; reorder callback thực của library gửi đúng 1 request, persist sau reload; abort request khôi phục order cũ và toast `Không thể lưu thứ tự ảnh.`.

## Blocker để DONE

1. Nếu yêu cầu bằng chứng strict pointer/touch, chạy một drag thật bằng Chrome tương tác trên CTTT general gallery và mobile device; xác nhận đúng 1 request và persist sau reload.

---

# Historical handoff trước final hotfix

Ngày kiểm tra: 2026-07-21 (Asia/Saigon)

## Kết luận cổng hoàn tất

**PENDING**

Phần triển khai Product Media R2 đã hoàn thành và các luồng chính đã chạy thật với database/R2. Tuy nhiên không được đánh dấu `DONE` vì cổng bắt buộc vẫn còn hai điểm chưa xanh hoàn toàn:

1. `npm run verify:phase9:categories` thất bại trên dữ liệu local với `Expected 8 root categories`.
2. Full frontend `npm test` không kết thúc trong giới hạn 120 giây của runner. Các test tập trung Phase 10C và HTTP boundary đều pass.

Ngoài ra manual matrix đầy đủ cho Product Create/Product Edit/Product Detail + mọi dialog tại cả 6 viewport chưa được lặp lại toàn bộ; Product Edit đã được kiểm tra đủ 6 viewport. Vì vậy handoff giữ trạng thái PENDING theo đúng done gate của prompt.

## Phạm vi đã triển khai

### Backend

- Module mới `src/modules/product-media` gồm controller, service, repository, cleanup service, DTO và test.
- API global scope, không yêu cầu `X-Branch-Id`:
  - `GET /products/:productId/media`
  - `POST /products/:productId/media`
  - `PATCH /products/:productId/media/:mediaId`
  - `PATCH /products/:productId/media/:mediaId/primary`
  - `PUT /products/:productId/media/reorder`
  - `DELETE /products/:productId/media/:mediaId`
  - `PUT /products/:productId/options/:optionId/values/:optionValueId/image`
  - `DELETE /products/:productId/options/:optionId/values/:optionValueId/image`
- Áp dụng permission `products.read`/`products.update`, CSRF cho mutation và giới hạn multipart 5 MB.
- Gallery chung tối đa 12 ảnh; gallery biến thể tối đa 8 ảnh; alt text tối đa 200 ký tự.
- First image tự thành primary; set-primary, reorder chính xác, promote ảnh kế tiếp khi xóa primary.
- Không cho xóa ảnh chung cuối của sản phẩm ACTIVE.
- Publish ACTIVE kiểm tra gallery chung có đúng một primary và mỗi gallery biến thể không rỗng có đúng một primary.
- Delete Product/Variant/Option/OptionValue thu gom URL trước transaction và cleanup R2 best-effort sau DB commit.
- Upload có compensation cleanup nếu ghi DB thất bại; replace/remove OptionValue thumbnail cleanup object cũ.
- R2 key được giới hạn dưới namespace `products/`:
  - `products/{productId}/media/general/{ulid}.webp`
  - `products/{productId}/media/variants/{variantId}/{ulid}.webp`
  - `products/{productId}/option-values/{optionValueId}/{ulid}.webp`
- Preset mới:
  - `productGallery`: WebP, max 1600 px, quality 82.
  - `optionValueThumbnail`: WebP, max 512 px, quality 80.
- Category image error codes cũ được giữ nguyên để tránh regression.

### Database

- Schema và migration Phase 10B đã có đủ `ProductMedia.variantId`, `ProductMedia.updatedAt`, `ProductOptionValue.imageUrl` và hai partial unique indexes primary.
- Không tạo migration mới.
- `prisma migrate status`: 11 migrations, database schema up to date.

### Frontend

- Product Media section dùng chung cho Create/Edit/Detail.
- Create mode cho chọn ảnh trước, upload sau khi Product được persist và route có product ID.
- Gallery chung/biến thể, fallback read-only, preview, alt text, primary, reorder và delete confirmation.
- Queue có trạng thái READY/UPLOADING/SUCCESS/ERROR_RETRYABLE/ERROR_INVALID/CANCELED, tối đa 3 upload song song, retry và revoke object URL đúng vòng đời.
- Client preflight kiểm tra extension, MIME, kích thước và magic bytes JPEG/PNG/WebP trước khi tạo preview; file văn bản đổi đuôi `.jpg` bị chặn tại client.
- OptionValue thumbnail dialog được tích hợp vào Product Option Builder, vẫn giữ color swatch fallback.
- Query keys Product Media là global scope và không chứa branch ID.
- OpenAPI client và Zod được sinh lại từ runtime OpenAPI; không sửa tay generated code.

## Dữ liệu manual giữ lại

- ReLIFE — `01KY02E528QZ1YXPX3DVEXFDE9`
  - Gallery chung có ảnh R2 thật, đúng một primary.
  - Đã kiểm tra upload, đổi primary, alt text, reorder và delete ảnh phụ.
- Chuyện Tình Thị Trấn — `01KY02J5ZJ90CEP1RMR3Z2XEJB`
  - Gallery chung có 2 ảnh.
  - Variant `CTTT-SOFTCOVER-MANUAL` có 2 ảnh và đúng một primary.
  - OptionValue `Bìa mềm` có thumbnail R2.
- FO-024 — `01KY03TYEC03VJBHS3A53249A5`
  - Gallery chung có 2 ảnh.
  - Variant `FO024-001` và `FO024-003` mỗi variant có 2 ảnh, đúng một primary.
  - OptionValue `Xanh` và `Đỏ` có thumbnail R2.

Không xóa ba fixture trên.

## Bằng chứng R2 thật

- URL upload mới trả `HTTP 200`, `Content-Type: image/webp`, cache immutable:
  - `https://media.bookora.id.vn/products/01KY02E528QZ1YXPX3DVEXFDE9/media/general/01KY1D2SGE5P7EMYY1B9M975JY.webp`
- Ảnh phụ ReLIFE sau khi xóa qua UI biến mất khỏi DB gallery và URL R2 trả `HTTP 404`:
  - `https://media.bookora.id.vn/products/01KY02E528QZ1YXPX3DVEXFDE9/media/general/01KY1D2S516ASTM8VBDD9TX0QT.webp`
- File text đổi đuôi `.jpg` hiển thị lỗi `nội dung tệp không phải ảnh hợp lệ`, không có preview và không vào queue.

## Manual browser evidence

- Đăng nhập localhost:5173 bằng Super Admin thành công.
- Tab sạch tải Product Edit và Product Media thành công, console warning/error: `[]`.
- Product Edit có media section, upload action, save action và footer reachable ở:
  - 1440×900: PASS
  - 1366×768: PASS
  - 1024×768: PASS
  - 768×1024: PASS
  - 390×844: PASS
  - 320×700: PASS
- Preview/primary/alt/reorder/delete confirmation: PASS trên ReLIFE.
- Variant gallery và fallback: PASS trên Chuyện Tình Thị Trấn/FO-024.
- OptionValue thumbnail upload dialog: PASS trên Chuyện Tình Thị Trấn/FO-024.
- Product ACTIVE publish end-to-end chưa được đánh dấu PASS: các fixture hiện vẫn DRAFT và fixture Chuyện Tình Thị Trấn đang thiếu category.

## Kiểm tra tự động đã chạy

### Backend — PASS

- `npm run lint`
- `npm run type-check`
- `npm run build` — 289 files compiled.
- Targeted Jest Product Media/Products/Images — 3 suites, 11 tests pass.
- `npm run docs:check` — 122 operations, 108 schemas, OpenAPI valid.
- `npx prisma migrate status` — up to date.

### Frontend — PASS

- `npx vue-tsc -b`
- `npx vite build` — 4079 modules transformed.
- Targeted Vitest HTTP boundary/Product Media queue/ImageDropzone/Product money — 4 files, 43 tests pass.
- `npm run verify:generated-zod` — 15 files, 178 `zod.ulid()`, 0 forbidden occurrences.

### Chưa xanh

- `npm run verify:phase9:categories` — FAIL: `Expected 8 root categories`.
- `npm test` frontend — TIMEOUT sau 120 giây, không có kết quả full-suite để khẳng định pass/fail.

## GitNexus impact/detect_changes

- Impact trước các symbol sửa chính đều LOW; riêng shared `productErrorMessage` là HIGH do có 14 caller, nên thay đổi tại đó chỉ thêm mapping error code, không đổi signature/logic chung.
- `detect_changes` frontend: LOW, 6 indexed symbols, không có affected process được phát hiện.
- `detect_changes` backend: HIGH vì chạm ProductsRepository/ProductsService và các execution flow update status/update option value/image processing. Các flow này đã được bù bằng lint, typecheck, build, targeted Products/Image tests và manual R2 test. New Product Media files chưa có trong index hiện tại.
- GitNexus index báo chậm một commit dù analyzer local trả `Already up to date`; cần re-index sau khi commit Phase 10C để có graph đầy đủ cho module mới.

## File chính thay đổi

Backend:

- `src/modules/product-media/**`: toàn bộ bounded context Product Media.
- `src/modules/products/**`: publish invariants, imageUrl response và R2 cleanup khi xóa aggregate.
- `src/shared/images/**`: presets và error-code routing cho Product Media.
- `src/app.module.ts`: đăng ký ProductMediaModule.
- `docs/openapi.json`: runtime OpenAPI export.

Frontend:

- `src/features/products/media/**`: API facade, queue composable, tests, media section và thumbnail dialog.
- `src/features/products/pages/ProductFormPage.vue`: create/edit media integration.
- `src/features/products/pages/ProductDetailPage.vue`: read-only media integration.
- `src/features/products/components/ProductOptionBuilder.vue`: OptionValue thumbnail action.
- `src/components/shared/ImageDropzone.vue`, `ImagePreviewDialog.vue`: backward-compatible shared props.
- `src/api/generated/**`, `openapi/bookora.openapi.json`: regenerated contract/client/Zod.

## Việc cần làm để chuyển sang DONE

1. Khôi phục/đối chiếu seed category để `verify:phase9:categories` thấy đúng 8 root categories; không sửa verifier để né lỗi dữ liệu.
2. Chạy full frontend test suite ngoài runner 120 giây và lưu kết quả pass.
3. Lặp lại toàn bộ matrix Product Create/Edit/Detail, general/variant/thumbnail/queue ở cả 6 viewport.
4. Bổ sung category hợp lệ cho fixture Chuyện Tình Thị Trấn, kích hoạt các fixture và ghi bằng chứng publish ACTIVE thành công.
5. Re-index GitNexus và chạy lại `detect_changes` để module mới xuất hiện trong graph.

Không stage, commit, push, reset hoặc clean trong Phase 10C này.
