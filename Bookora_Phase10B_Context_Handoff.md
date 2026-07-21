# Bookora Phase 10B — Full UI Audit/Hotfix/Reverification Handoff

## Status

**PHASE 10B — PRODUCTS, OPTIONS & VARIANTS — DONE**

Hotfix, automated gate và manual runtime matrix đều PASS. AlertDialog dùng chung trong phần Product nhận click đúng; destructive mutation được chạy trên Product disposable rồi cleanup; ba negative Variant payload trả đúng machine code; simple/one-option/multi-option detail PASS trên desktop/mobile. Ba fixture manual chính được giữ nguyên theo yêu cầu user.

Không stage, commit hoặc push. Không xóa fixture/seed.

## BOUND và phạm vi

- Frontend: `D:\CTU\CT466E\bookora-web\bookora-web`.
- Backend: `D:\CTU\CT466E\bookora-api\bookora-api`.
- Runtime audit: `http://localhost:5173`, API `http://localhost:8000`.
- Giữ nguyên các thay đổi Phase 10A/10B có sẵn trong cả hai worktree.
- Không mở rộng sang media/R2, inventory, storefront, sales channel hoặc bundle/combo.
- GitNexus frontend `BaseVue3TS` đã được dùng trước mỗi symbol sửa. Các file Product Phase10B đang untracked/chưa có trong index nên các impact liên quan trả `UNKNOWN`, 0 caller/process; không có cảnh báo HIGH/CRITICAL. Backend không có repo index tương ứng.

## Audit ledger F-01 → F-18

| Finding | Root cause | Hotfix / file chính | Verification | Trạng thái |
|---|---|---|---|---|
| F-01 Sidebar native scroll | `SidebarContent` tự `overflow-auto`, nav tranh chiều cao với footer | `AppSidebar.vue`: root overflow hidden, nav trong shadcn `ScrollArea`, footer ngoài viewport | component test + viewport audit | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-02 raw ISO date | Detail render trực tiếp response; hydrate date phụ thuộc chuỗi | `utils/product-date.ts`, `ProductDetailPage.vue`, `ProductFormPage.vue`: parser UTC-safe, vi-VN, fail-safe | 3 unit tests; Browser simple detail hiển thị `25/11/2021`, không có Invalid Date | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-03 English labels | Copy Phase10B còn `Options & Values`, configuration enum | Dịch copy Product form/detail/option/variant, giữ nguyên machine codes | source contract + browser snapshot tiếng Việt | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-04 native Supplier/Publisher select | Load danh sách lớn và dùng `<select>` | `AsyncMasterDataCombobox.vue` + Command primitives: Popover, server search debounce 350 ms, page size 20, loading/error/retry/empty/clear/keyboard/cache label, z-index 70 | chọn/search/clear bằng browser; 2 component tests | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-05 native short-description textarea | Form dùng native element | shadcn `Textarea`, maxlength/counter/error/aria-describedby/clear error | source contract + build + browser snapshot | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-06 Category native scroll | Container `overflow-y-auto` | Category và Author dùng shadcn `ScrollArea`, responsive 1 cột | viewport DOM audit không còn native scroll | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-07 Option horizontal native scroll | Table min-width rộng trên mobile | Desktop table trong horizontal `ScrollArea`; mobile cards; `min-w-0`, actions luôn hiện | 6 viewport + docked 320 px, không page/native overflow | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-08 Detail Variant native scroll | Một table rộng cho mọi breakpoint | Desktop `ScrollArea`, mobile Variant cards; bỏ ULID/combinationKey khỏi UI | Browser ba detail: desktop table, mobile cards, body/client width bằng nhau | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-09 Add Value không phản hồi | Không có local validation; invalid draft đi thẳng API 400 | Named handler, button type, inline draft errors, valid payload mới gọi mutation | component click test valid/invalid; browser invalid bị chặn, không toast 400 | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-10 Delete Option/Value im lặng | Button blocked bị disabled nên không giải thích; usage per-value thiếu | Button luôn mở allowed/blocked dialog; backend trả `usageCount`; invalidation chính xác | blocked và allowed Option/Value delete đều PASS bằng Browser | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-11 Dialog copy/action mâu thuẫn và không nhận click | Blocked dialog vẫn có destructive semantics chung; `AlertDialogContent` kế thừa `pointer-events: none` từ body lock nên overlay nuốt pointer event | `MasterDataDeleteDialog.vue`: blocked chỉ có Đóng; allowed có Hủy/Xóa; dùng `AlertDialogCancel` trực tiếp và đặt `pointer-events-auto` cho content | component tests; Browser xác nhận hit-test trúng BUTTON và đóng được dialog Product/Variant/Option bằng chuột | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-12 invalid colorCode | Placeholder `#RRGGBB` được submit; backend validator quá rộng | strict `/^#[0-9A-Fa-f]{6}$/`, nullable, uppercase ở frontend; DTO backend đồng bộ | frontend 3 + backend 7 tests; browser inline error, không request/toast 400 | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-13 sticky footer che content | Nội dung cuối thiếu bảo đảm khoảng trống/breakpoint | form `pb-24`, footer responsive và z-index 20; popover z-index 70 | 6 viewport không overflow; field/action cuối truy cập được | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-14 preview không cancel | Preview chỉ có trạng thái mở, không reset draft | `CLOSED/LOADING/READY/ERROR`, Retry/Hủy; cancel reset preview-only/common-price và focus trigger | component test + browser open/cancel/reopen | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-15 matrix không responsive | Native table 1500 px trên mobile | Desktop horizontal `ScrollArea`, mobile cards, actions nằm ngoài vùng kéo ngang | browser 390×844 open/cancel/reopen, body 375/375 | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-16 valid action 400 | UI cho gửi màu literal không hợp lệ, error mapping quá chung | client validation trước HTTP; backend DTO strict; field errors map inline, toast chỉ dùng khi không có field error | invalid browser action không có API toast; valid create component test gọi đúng payload | AUTOMATED_VERIFIED / MANUAL_VERIFIED |
| F-17 report cũ không đủ bằng chứng | Báo cáo cũ đánh PASS quá sớm | Handoff này ghi ledger, lệnh thật, test totals, viewport/action, blocker và fixture | review tài liệu | VERIFIED |
| F-18 PATCH Variant mặc định bị hiểu thành bỏ mặc định | Initializer `isDefault = false`/`isActive = true` của Create DTO bị `PartialType` kế thừa sang Update DTO, làm field bị bỏ qua không còn `undefined` | Bỏ runtime initializer, giữ OpenAPI default và repository fallback; thêm regression test PATCH semantics | targeted 11 tests; API 200; UI đổi tên/giá Variant mặc định và toast thành công | AUTOMATED_VERIFIED / MANUAL_VERIFIED |

## Thay đổi chính

### Frontend

- Thêm shadcn wrappers: `src/components/ui/textarea/*`, `src/components/ui/command/*`.
- Thêm `AsyncMasterDataCombobox.vue`, `product-date.ts`, `product-option-validation.ts`.
- Sửa `ProductFormPage.vue`, `ProductDetailPage.vue`, `ProductDescriptionEditor.vue`, `ProductOptionBuilder.vue`, `ProductVariantManager.vue`.
- Sửa `MasterDataDeleteDialog.vue`, `AppSidebar.vue`.
- Thêm/đổi tests: `product-ui-hotfix.test.ts`, `product-ui-contract.test.ts`, date/color helper tests, delete-dialog/sidebar tests.
- Regenerate OpenAPI/Orval/Zod bằng `npm run gen:api:local`; không sửa generated client thủ công.
- Loại bỏ `window.confirm` route guard cũ. Vẫn giữ `beforeunload` cho đóng/reload tab có dữ liệu chưa lưu.

### Backend

- `products.repository.ts`: select `_count.variantLinks` cho từng OptionValue.
- `products.service.ts`: map `usageCount` vào response create/update/list/delete-related refresh.
- `product-response.dto.ts`: khai báo `usageCount` trong OpenAPI.
- `product.dto.ts`: color nullable hoặc đúng sáu hex; message tiếng Việt.
- `product.dto.spec.ts`: 7 trường hợp strict color/null.
- OpenAPI `docs/openapi.json` được export chính thức; frontend sync từ endpoint docs-json.

## Automated verification thực thi thật

### Backend

- `npm test -- --runInBand src/modules/products`: **5 suites / 37 tests PASS**.
- `npm test -- --runInBand`: **57 suites / 470 tests PASS**.
- `npm run type-check`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS, 279 files.
- `npm run prisma:format`: PASS.
- `npm run prisma:validate`: PASS.
- `npm run prisma:generate`: PASS.
- `npx prisma migrate status`: PASS, 11 migrations, schema up to date.
- `npm run docs:check`: PASS; **114 operations / 104 schemas**, Redocly valid, 2 rules ignored theo config có sẵn.
- `git diff --check`: PASS.
- GitNexus `detect_changes(scope=compare, base_ref=master)`: LOW; 5 indexed symbols, 0 affected execution process. Product Phase10B files vẫn chưa có trong index nên kết quả này không được dùng như bằng chứng phủ toàn feature.

### Frontend

- Targeted sau thay đổi cuối: **6 files / 19 tests PASS**.
- Full Vitest: **123 files / 594 tests PASS**.
- `npx vue-tsc -b --pretty false`: PASS.
- Final `npm run build` sau code edit cuối: PASS, 4056 modules transformed.
- `npm run verify:generated-zod`: PASS; 14 files, 162 `zod.ulid()`, 0 forbidden.
- `git diff --check`: PASS.
- Không có script lint trong `package.json`; không tuyên bố frontend lint đã chạy.
- Build còn warning chunk >500 kB ở các bundle có sẵn; đây là performance debt, không phải compile failure.

## Manual browser evidence

### Routes/fixtures

- Multi-option edit/detail: `/super-admin/products/01KY03TYEC03VJBHS3A53249A5` — hydrate, interaction và 6/6 Variant PASS.
- Simple detail: `/super-admin/products/01KY02E528QZ1YXPX3DVEXFDE9` — ngày `25/11/2021`, desktop/mobile PASS.
- One-option detail: `/super-admin/products/01KY02J5ZJ90CEP1RMR3Z2XEJB` — desktop/mobile PASS.

### Viewports

Edit page đã kiểm: `1440×900`, `1366×768`, `1024×768`, `768×1024`, `390×844`, thêm docked/narrow `320×700`.

- Tất cả: `document.body.scrollWidth === clientWidth`.
- Native `<select>`: 0.
- Native overflowing containers ngoài shadcn ScrollArea viewport: 0.
- ScrollArea count thay đổi đúng breakpoint: desktop 5, tablet/mobile 4.
- 390×844 matrix open/cancel/reopen: PASS; body 375/375.
- Async supplier search “Mekong”, select và clear nullable: PASS.
- Invalid `#RRGGBB`: inline error PASS, không xuất hiện toast API 400.
- Block delete used value: lý do usage hiển thị, chỉ có Đóng, không có destructive confirm.
- Product delete “Hủy”, Variant delete “Hủy” và blocked Option “Đóng”: click bằng chuột đều đóng dialog; không có mutation phát sinh.
- Product list status filter ghi vào URL, refresh giữ nguyên filter/kết quả, column visibility ẩn/hiện “Nhà cung cấp”: PASS.
- Phiên edit sạch: 0 console warning/error.

### Manual gates cuối

- Disposable Product: create OptionValue → delete allowed; create Option → delete allowed; bulk-create 2 Variant; default Variant delete blocked; non-default Variant delete allowed; Variant update tên/giá PASS; DRAFT Product aggregate delete PASS.
- Hai Product disposable và toàn bộ aggregate con đã được cleanup; không tác động ba fixture manual chính.
- Negative “thiếu một OptionValue” → `400 PRODUCT_VARIANT_INCOMPLETE_OPTIONS`.
- Negative “hai Value cùng Option” → `400 PRODUCT_VARIANT_INCOMPLETE_OPTIONS`.
- Negative “Value thuộc Product khác” → `400 PRODUCT_VARIANT_OPTION_VALUE_SCOPE_MISMATCH`.
- FO-024 vẫn `6/6 đang bán` sau ba request âm. Clean Browser tab cuối: 0 console warning/error.

## Cache/invalidation

- Option/Value mutations invalidate option list cùng Product detail/list cần thiết.
- Variant mutations invalidate variants, options, detail và list để usage count/delete guard không stale.
- Preview cancel không gọi mutation và không xóa persisted Options/Values/Variants.

## Fixtures

Giữ nguyên theo yêu cầu user, không cleanup:

- `01KY02E528QZ1YXPX3DVEXFDE9` — ReLIFE simple.
- `01KY02J5ZJ90CEP1RMR3Z2XEJB` — Chuyện Tình Thị Trấn, one option.
- `01KY03TYEC03VJBHS3A53249A5` — FO-024, multi option.
- Pagination fixtures Phase10B hiện có.
- Không xóa master seed Phase 9/10A.

## Kết luận

Toàn bộ gate còn lại đã PASS trên runtime thật với phiên superadmin có Turnstile/session hợp lệ. Không bypass xác minh, không xóa fixture manual, không stage/commit/push.
