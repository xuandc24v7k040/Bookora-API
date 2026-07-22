# Bookora Phase 11 — Inventory Bound / Verify Done Handoff

Ngày hoàn tất: 2026-07-22 (Asia/Saigon)

## 1. Kết luận

Phase 11 đã hoàn tất theo contract ba bảng inventory:

- `branch_product_stocks`
- `stock_receipts`
- `stock_receipt_items`

Không triển khai Order/Cart/stock movement ngoài phạm vi. Migration production đã được áp dụng, OpenAPI runtime và frontend generated client đã đồng bộ, full test và manual browser test đã pass.

## 2. Database và migration

Migration mới:

- `prisma/migrations/20260722150000_phase11_inventory_contract/migration.sql`

Thay đổi chính:

- Thêm `stock_receipts.supplier_id` nullable.
- FK receipt → supplier dùng `ON DELETE RESTRICT`.
- FK stock → product variant đổi sang `ON DELETE RESTRICT`.
- Thêm check constraint `branch_product_stocks.low_stock_threshold >= 0`.
- Dọn permission cũ `inventory.update`, `stock_movements.read`, `stock_movements.create`.
- Giữ đúng ba bảng inventory, không thêm bảng stock movement.

Kết quả:

- `prisma migrate deploy`: pass, migration Phase 11 đã áp dụng.
- `prisma migrate status`: 13 migrations, database up to date.
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code`: no difference.
- `prisma format`, `prisma validate`, `prisma generate`: pass.

Backup trước migration:

- File: `C:\Users\Admin\AppData\Local\Temp\bookora-phase11-backup-20260721-221147177Z\bookora_db-before-phase11.dump`
- Format: PostgreSQL custom archive.
- Size: 163,333 bytes.
- SHA-256: `CAAF187F8F10D70AF734BBE090136FB5CFB282D14D0555EE620BEABD5CF077A8`
- `pg_restore --list`: pass, 314 archive entries.

## 3. Permission catalog

Permission Phase 11:

- `inventory.read`
- `inventory.update_threshold`
- `stock_receipts.read`
- `stock_receipts.create`
- `stock_receipts.update`
- `stock_receipts.cancel`
- `stock_receipts.confirm`

Role seed:

- `SUPER_ADMIN`: toàn bộ permission catalog.
- `BRANCH_ADMIN`: đủ bảy permission inventory/receipt.
- `INVENTORY`: đủ bảy permission inventory/receipt.
- Permission inventory cũ/stale đã bị loại.

`npx prisma db seed`: pass.

## 4. Backend runtime

Module mới:

- `src/modules/inventory/`
- `src/modules/stock-receipts/`

API mới:

- `GET /inventory/variant-options`: global selector, không cần `X-Branch-Id`, chỉ trả Product ACTIVE + Variant active.
- `GET /inventory/stocks`: branch required.
- `PATCH /inventory/stocks/:variantId/threshold`: branch required + CSRF + permission riêng.
- `GET /stock-receipts`: branch required.
- `POST /stock-receipts`: tạo DRAFT theo branch.
- `GET /stock-receipts/:id`: branch required.
- `PATCH /stock-receipts/:id`: chỉ DRAFT.
- `POST /stock-receipts/:id/cancel`: chỉ DRAFT.
- `POST /stock-receipts/:id/confirm`: chỉ DRAFT, transaction serializable.

Confirm receipt:

- Revalidate branch active.
- Revalidate supplier tồn tại khi có supplier.
- Revalidate Product ACTIVE và Variant active.
- Conditional transition `DRAFT → CONFIRMED` trong cùng transaction.
- Upsert/increment toàn bộ stock item trong cùng transaction.
- Retry transaction conflict tối đa ba lần.
- Race loser/confirm lần hai không tăng tồn.
- Validation thất bại rollback toàn bộ, không đổi trạng thái và không tăng một phần.

Reference guard:

- Không xóa supplier khi đang được Product hoặc StockReceipt tham chiếu.
- Không xóa product variant khi đang được stock/receipt item hoặc các domain reference khác tham chiếu.
- Supplier `usageCount` bao gồm cả Product và StockReceipt.

## 5. OpenAPI và generated client

Backend OpenAPI:

- 80 paths.
- 131 operations.
- 119 schemas.
- Contract check pass.
- Redocly lint pass (hai ignore đã có trong cấu hình dự án).

Đã sửa drift giữa exporter và runtime:

- Runtime Swagger có prefix `/api/v1`.
- Normalizer canonicalize prefix chỉ khi áp security/error metadata.
- URL runtime không bị đổi.
- Backend `docs/openapi.json` và frontend `openapi/bookora.openapi.json` semantic equality: `true`.

Frontend generation:

- Chạy `npm run gen:api:local` từ backend runtime `localhost:8000`: pass.
- Runtime SHA-256 sau cùng: `C7D0355F5C76C4B2B5278DA96FB3BFBBD1AD620A7FB560967672E55B58FAA6AE`.
- Orval client: pass.
- Generated Zod: 17 files, 188 `zod.ulid()`, 0 forbidden occurrences.
- Không sửa tay generated client.

## 6. Frontend

Feature mới:

- `src/features/inventory/api/`
- `src/features/inventory/components/`
- `src/features/inventory/pages/`
- `src/features/inventory/utils/`

Màn hình:

- Tồn kho theo branch, server search/filter/sort/paging.
- Dialog cập nhật ngưỡng tồn thấp.
- Danh sách phiếu nhập theo branch.
- Dedicated create page.
- Dedicated edit DRAFT page.
- Detail page cho DRAFT/CONFIRMED/CANCELLED.
- Confirm/cancel dialog.
- Global variant selector có server search/paging và ScrollArea.

Branch scope:

- Stock/receipt request dùng `branchScoped: true`.
- Query key chứa branch scope.
- Super Admin ở global scope bị chuyển tới branch-required page.
- Global variant selector không gửi branch header.
- Menu SYSTEM và BRANCH đều có Tồn kho/Phiếu nhập kho.

Dirty guard:

- Custom dialog cho internal navigation.
- Guard trước khi đổi header branch hoặc về global scope.
- Chọn “Ở lại” không đổi branch, không đổi query cache scope.
- Native `beforeunload` chỉ dùng cho reload/đóng tab.

## 7. Automated verification

Backend:

- ESLint: pass.
- Type-check: pass.
- Build: pass, 307 files compiled.
- Unit: 62 suites / 505 tests pass.
- E2E: 7 suites / 46 tests pass.
- Inventory/stock-receipt targeted: 4 suites / 22 tests pass.
- Schema/transaction targeted: 1 suite / 7 tests pass.

Các test transaction bao gồm:

- Confirm tăng nhiều item trong một transaction.
- Confirm receipt đã CONFIRMED không chạm stock.
- Invalid Product/Variant fail trước transition.
- Hai confirm đồng thời chỉ một request tăng tồn.
- Negative threshold bị DB constraint chặn.
- Supplier/variant delete bị FK restrict chặn.

Frontend:

- Vitest: 127 files / 613 tests pass.
- `vue-tsc -b`: pass.
- Vite production build: pass, 4,142 modules transformed.
- Project không có lint script frontend nên không báo lint frontend pass.
- Vite còn warning chunk >500 kB ở các chunk legacy lớn; không phải Phase 11 runtime error.

## 8. Manual browser verification

Tài khoản:

- `superadmin@bookora.local`
- Branch: Chi nhánh Cần Thơ.

Receipt tạo thật:

- ID: `01KY3DFVASS0FRBQZ9N5H693SZ`
- Code: `PNK-can-tho-202607-Y8V0A2011R`
- Supplier: Công ty Sách và Văn phòng phẩm Mekong.
- Status cuối: CONFIRMED.
- Item count: 3.
- Total quantity: 270.
- Total cost: 5,600,000 VND.

Ba fixture:

1. `FO024-001`: quantity 80, cost 10,000; stock trước 0, sau 80.
2. `CTTT-HARDCOVER-MANUAL`: quantity 90, cost 20,000; stock trước 0, sau 90.
3. `RELIFE-12-MANUAL-10B`: quantity 100, cost 30,000; stock trước 0, sau 100.

Evidence:

- DRAFT chưa tạo stock row.
- Confirm một lần tạo đúng ba stock row với 80/90/100.
- Detail CONFIRMED không còn action sửa/hủy/xác nhận.
- Manual dirty branch switch Cần Thơ → Hậu Giang hiện custom dialog; chọn “Ở lại” giữ Cần Thơ và giữ nguyên form.
- Selector bug giữ ID nhưng mất object qua nhiều search đã được phát hiện trong manual test, sửa sang Map variant đầy đủ, build lại và manual rerun pass.
- Browser console error cuối: 0.

Responsive matrix:

- Pages: branch selection, stock list, receipt list, receipt form, receipt detail.
- Viewports: 1440×900, 1024×768, 768×1024, 390×844.
- 20/20 page-viewport combinations: không page overflow.
- Variant selector tại 390×844: dialog nằm trong viewport, bounds left 16 / right 374.4 / top 63.3 / bottom 780.7.

## 9. GitNexus và worktree

Đã chạy impact trước khi sửa các symbol hiện hữu và `detect_changes()` sau thay đổi.

`detect_changes()` báo tổng worktree risk HIGH backend / CRITICAL frontend vì worktree còn chứa thay đổi Phase 10 Product chưa commit từ trước, gồm nhiều Product symbols và auth/menu hub. Các thay đổi đó được giữ nguyên, không reset/ghi đè. Phase 11 được kiểm chứng bằng full test, build, E2E và manual flow ở trên.

Không chạy `git add`, `git commit`, `git push`, `git reset` hoặc `git clean`.

## 10. Lưu ý vận hành

- Backend dev server hiện chạy ở `localhost:8000` từ quá trình manual test.
- Frontend dev server hiện chạy ở `localhost:5173` (process có sẵn của workspace).
- Receipt manual verification được giữ lại trong database làm evidence.
- Backup trước migration được giữ tại đường dẫn nêu ở mục 2.

## 11. Trạng thái

`DONE`

## 12. Final hotfix — authoritative addendum

Mục này thay thế các mô tả cũ về authorization của Product/Variant selector và là trạng thái authoritative sau hotfix cuối ngày 2026-07-22.

### Permission và authorization

- `STAFF` giữ `products.read`, bỏ `products.create` và `products.update`; seed reconcile xóa mapping system-role không còn thuộc expected set nhưng không đụng custom role.
- `BRANCH_ADMIN` và `INVENTORY` có `products.read` cùng toàn bộ quyền Inventory/Receipt.
- `GET /inventory/variant-options` dùng ANY-OF: `products.read` hoặc `stock_receipts.create` hoặc `stock_receipts.update`.
- Catalog Product/Variant vẫn global. `X-Branch-Id` chỉ được gửi cho branch actor để tính effective permission, tuyệt đối không dùng để lọc catalog.
- Product list/detail nhận branch authorization context; branch actor có `products.read` được đọc nhưng không được mở mutation khi thiếu quyền.

### Frontend final hotfix

- Menu Product dựa trên effective `products.read`; bổ sung route `/branch-admin/products` và `/branch-admin/products/:id` dạng read-only.
- Variant selector phân trang theo Product, tải toàn bộ active Variant của từng Product trong trang, gom nhóm collapse/expand và giữ selection bằng `Map` qua search/paging/collapse.
- Variant đã thêm bị disabled và hiển thị `Đã thêm`; SIMPLE variant hiển thị `Mặc định`.
- Threshold action là icon-only, giữ tooltip/`aria-label="Chỉnh ngưỡng cảnh báo"`, focus ring và hit area 36 px.
- Resource `stock_receipts` dùng label tập trung `Phiếu nhập kho`.

### Verification sau hotfix

- Seed thực tế chạy hai lần liên tiếp: pass.
- Backend: 63 suites / 513 tests pass; E2E 7 suites / 46 tests pass; type-check, ESLint và build pass.
- Frontend: 128 files / 620 tests pass; `vue-tsc -b` và production build pass.
- OpenAPI: 80 paths / 131 operations / 119 schemas; contract check và Redocly pass.
- Generated client từ `http://localhost:8000/api/docs-json`: SHA-256 `89A13C6DFCCF314E8261EDEE219341D37B11A280E07A185870689F4ABADB509D`; Orval pass; Zod 17 files / 210 `zod.ulid()` / 0 forbidden occurrences.
- Manual `localhost:5173`: Super Admin thêm ba Variant thuộc ba Product; reopen hiển thị đủ ba `Đã thêm`; collapse/expand pass; footer và nút click được.
- Responsive selector pass tại 1440×900, 1024×768, 768×1024 và 390×844; header/search/pagination/footer đều hiện, mobile dialog nằm gọn trong viewport.
- Đăng nhập lại sau seed: Branch Admin, INVENTORY và STAFF đều mở được Product list/detail read-only; Branch Admin và INVENTORY mở receipt selector và tải catalog thành công. STAFF không có route tạo receipt theo expected seed, nhưng quyền `products.read` và ANY-OF được xác nhận bằng Product runtime cùng guard/controller tests.
- Browser console cuối không có lỗi từ selector flow.
- Không chạy `git add`, `git commit`, `git push`, `git reset` hoặc `git clean`.

### Trạng thái cuối

`PHASE 11 — INVENTORY — DONE`
