# Bookora Storefront Demo Catalog Seed — Kết quả

## 1. Trạng thái

**DONE** cho catalog seed và inventory seed tách riêng.

- Catalog đã tạo đúng 24 Product demo và rerun bảo toàn đủ 24 Product.
- Tất cả Product mới là `DRAFT` vì chưa có Product Media; không bypass publish invariant.
- Inventory seed đã chạy đúng contract hiện tại: skip đủ 24 Product DRAFT, không tạo receipt/stock. Stock plan và receipt idempotency được kiểm bằng targeted test; sau khi người dùng upload media và publish, chạy lại `npm run prisma:seed:storefront-inventory`.

## 2. BOUND

Các file task tạo/sửa:

- `prisma/seed/storefront-catalog/storefront-catalog.data.ts`: dataset 24 Product và research metadata.
- `prisma/seed/storefront-catalog/storefront-catalog.helpers.ts`: money, sale date và combination key helpers.
- `prisma/seed/storefront-catalog/storefront-catalog.seed.ts`: seed aggregate theo transaction, create-if-missing và preserve-on-rerun.
- `prisma/seed/storefront-catalog/storefront-inventory.seed.ts`: inventory seed receipt-based, chỉ xử lý ACTIVE.
- `prisma/seed.storefront-catalog.ts`: entry point catalog riêng.
- `prisma/seed.storefront-inventory.ts`: entry point inventory riêng.
- `prisma/seed.ts`: nối catalog demo vào seed orchestrator hiện hữu.
- `src/modules/products/storefront-catalog.seed.spec.ts`: targeted dataset/inventory tests.
- `package.json`: hai exact seed scripts.
- File báo cáo này.

Task không sửa schema, migration, Product/Category/Inventory runtime, controller, service, repository, DTO, OpenAPI, generated code hoặc frontend. Worktree có thay đổi Phase 11.5 tồn tại trước task; các thay đổi đó được giữ nguyên.

## 3. Fahasa Research

Ngày tham khảo: **22/07/2026**. Chỉ đọc dữ liệu công khai, không đăng nhập, không captcha, không tải/hotlink ảnh và không sao chép mô tả dài.

- Giữ phần lớn candidate trong prompt.
- Thay `Beartown — Thị Trấn Nhỏ, Giấc Mơ Lớn` bằng `Người Đàn Ông Mang Tên OVE`, cùng tác giả Fredrik Backman, vì đầu sách thay thế đang xuất hiện trên bảng Văn học Fahasa.
- Dùng edition `Siêu Kinh Tế Học Hài Hước` của Steven D. Levitt và Stephen J. Dubner thay tên candidate cũ, theo catalog Fahasa hiện hành.
- Xác minh `Marketing Phải Bán Được Hàng`: Donald Miller, J. J. Peterson, Lao Động, bìa mềm, giá tham khảo 128.000đ/159.000đ.
- Xác minh `Bán Hàng Thời Kỹ Thuật Số`: Grant Leboff, Thế Giới, bìa mềm, 228 trang, 230 g, giá tham khảo 96.000đ.
- Xác minh `Nhà Giả Kim (Tái Bản 2025)`: Paulo Coelho, Hội Nhà Văn, bìa mềm, 228 trang, 240 g, giá tham khảo 76.000đ.
- Xác minh edition `Elon Musk` của Walter Isaacson và edition 2025 của `Xây Dựng Câu Chuyện Thương Hiệu`.
- Giá trong seed là fixture VND hợp lý để phủ filter, không cam kết là giá Fahasa hiện tại. Bốn release date năm 2027 được ghi rõ là fixture demo.

## 4. Dataset

| # | Product | Category | Type | Author | Publisher | Giá mặc định | Sale | Release |
|---:|---|---|---|---|---|---:|---|---|
| 1 | Nhà Giả Kim (Tái Bản 2025) | Tiểu thuyết | OPTIONED | Paulo Coelho | Hội Nhà Văn | 95.000đ | ACTIVE 76.000đ | 2025 |
| 2 | Sứ Mệnh Hail Mary | Tiểu thuyết | SIMPLE | Andy Weir | Thế Giới | 239.000đ | NONE | 2021 |
| 3 | Người Đàn Ông Mang Tên OVE | Tiểu thuyết | SIMPLE | Fredrik Backman | Trẻ | 179.000đ | NONE | 2012 |
| 4 | Nếu Biết Trăm Năm Là Hữu Hạn | Truyện ngắn - Tản văn | SIMPLE | Phạm Lữ Ân | Hội Nhà Văn | 135.000đ | ACTIVE 108.000đ | 2024 |
| 5 | Trên Đường Băng | Truyện ngắn - Tản văn | SIMPLE | Tony Buổi Sáng | Trẻ | 110.000đ | NONE | 2015 |
| 6 | Thương Mấy Cũng Là Người Dưng | Truyện ngắn - Tản văn | SIMPLE | Anh Khang | Hội Nhà Văn | 89.000đ | NONE | 2016 |
| 7 | Your Name | Light Novel | OPTIONED | Makoto Shinkai | Kim Đồng | 95.000đ | ACTIVE 76.000đ | 2016 |
| 8 | 5 Centimet Trên Giây | Light Novel | SIMPLE | Makoto Shinkai | Kim Đồng | 85.000đ | NONE | 2007 |
| 9 | Thám Tử Đã Chết - Tập 1 | Light Novel | SIMPLE | Nigozyu | Kim Đồng | 125.000đ | NONE | 2019 |
| 10 | Bến Xe (Tái Bản 2020) | Ngôn tình | SIMPLE | Thương Thái Vi | Phụ Nữ Việt Nam | 118.000đ | NONE | 2020 |
| 11 | Vụng Trộm Yêu Anh | Ngôn tình | SIMPLE | Trúc Dĩ | Phụ Nữ Việt Nam | 249.000đ | NONE | 2021 |
| 12 | Đuổi Theo Mùa Hạ | Ngôn tình | SIMPLE | Mộc Qua Hoàng | Phụ Nữ Việt Nam | 219.000đ | NONE | FUTURE fixture 2027-03-15 |
| 13 | Shoe Dog - Gã Nghiện Giày | Nhân vật - Bài học kinh doanh | SIMPLE | Phil Knight | Lao Động | 198.000đ | ACTIVE 158.000đ | 2016 |
| 14 | Steve Jobs | Nhân vật - Bài học kinh doanh | SIMPLE | Walter Isaacson | Thế Giới | 349.000đ | NONE | 2011 |
| 15 | Elon Musk | Nhân vật - Bài học kinh doanh | SIMPLE | Walter Isaacson | Công Thương | 399.000đ | NONE | FUTURE fixture 2027-04-15 |
| 16 | Một Đời Quản Trị | Quản trị - Lãnh đạo | SIMPLE | Phan Văn Trường | Trẻ | 199.000đ | FUTURE 169.000đ | 2019 |
| 17 | Lãnh Đạo Luôn Ăn Sau Cùng | Quản trị - Lãnh đạo | SIMPLE | Simon Sinek | Lao Động | 189.000đ | NONE | 2014 |
| 18 | Chiến Lược Đại Dương Xanh | Quản trị - Lãnh đạo | OPTIONED | W. Chan Kim, Renée Mauborgne | Lao Động | 229.000đ | NONE | FUTURE fixture 2027-05-15 |
| 19 | Marketing Phải Bán Được Hàng | Marketing - Bán hàng | SIMPLE | Donald Miller, J. J. Peterson | Lao Động | 159.000đ | ACTIVE 128.000đ | 2022 |
| 20 | Bán Hàng Thời Kỹ Thuật Số | Marketing - Bán hàng | SIMPLE | Grant Leboff | Thế Giới | 96.000đ | NONE | 2018 |
| 21 | Xây Dựng Câu Chuyện Thương Hiệu | Marketing - Bán hàng | OPTIONED | Donald Miller | Lao Động | 169.000đ | NONE | FUTURE fixture 2027-06-15 |
| 22 | Kinh Tế Học Trong Một Bài Học | Phân tích kinh tế | SIMPLE | Henry Hazlitt | Tri Thức | 149.000đ | EXPIRED 119.000đ | 1946 |
| 23 | Siêu Kinh Tế Học Hài Hước | Phân tích kinh tế | SIMPLE | Steven D. Levitt, Stephen J. Dubner | Tri Thức | 179.000đ | NONE | 2009 |
| 24 | Tâm Lý Học Về Tiền | Phân tích kinh tế | SIMPLE | Morgan Housel | Dân Trí | 189.000đ | ACTIVE 149.000đ | 2020 |

Database verification: 24 Product, 12 Văn học, 12 Kinh tế, mỗi child category đúng 3 Product, không Product demo thuộc root khác.

## 5. Product Aggregate

- 20 SIMPLE, mỗi Product có một Variant `DEFAULT` active/default.
- 4 OPTIONED: Nhà Giả Kim, Your Name, Chiến Lược Đại Dương Xanh, Xây Dựng Câu Chuyện Thương Hiệu.
- Tổng 28 Variant, SKU unique theo prefix `DEMO-VH-*` / `DEMO-KT-*`.
- Mỗi OPTIONED có một Option, hai OptionValue, hai Variant và đủ VariantOptionValue.
- 24/24 Product có đúng một default active Variant.
- Mỗi Product có Author, Publisher và ba attributes hiện hữu: `LANGUAGE`, `PAGE_COUNT`, `PUBLICATION_DATE`. Kích thước, trọng lượng, số trang và năm xuất bản được lưu trên Variant theo schema hiện hành.

## 6. Media & Publish Safety

- ProductMedia tạo mới: **0**.
- Không gọi R2/image pipeline, không ghi URL và không đổi primary/sortOrder.
- 24 Product mới đều `DRAFT`.
- Rerun chỉ đọc/validate basic aggregate rồi `PRESERVED`; không sửa description, price, sale, releaseDate, status, media hoặc quan hệ do Admin đã chỉnh.
- Existing ACTIVE Product không bị downgrade.

## 7. Inventory Seed

- Resolve đúng bốn branch code: `can-tho`, `hau-giang`, `ho-chi-minh`, `ha-noi`; không tạo Branch.
- Chỉ đọc Product `ACTIVE` và Variant active.
- Receipt code deterministic theo Product + Branch; receipt đã tồn tại được preserve, không confirm/increment lại.
- Stock plan có `OUT_OF_STOCK` (không materialize item), `LOW_STOCK` 3–4 và `IN_STOCK` 20–80; có Product phủ bốn Branch và OPTIONED case Variant A còn hàng/Variant B không có hàng tại cùng Branch.
- Runtime hiện tại: 24 Product DRAFT bị skip, `createdReceipts = 0`, `demo receipt count = 0`.
- Targeted idempotency test xác nhận receipt tồn tại không gọi `stockReceipt.create` hoặc `branchProductStock.upsert`.

## 8. Verification

| Lệnh | Kết quả |
|---|---|
| `npm run prisma:format` | PASS |
| `npm run prisma:validate` | PASS |
| `npx prisma migrate status` | PASS — 14 migrations, database up to date |
| `npm run prisma:generate` | PASS |
| `npm run type-check` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS — SWC 328 files |
| targeted storefront seed spec | PASS — 1 suite, 6 tests |
| `npm test -- --runInBand` | PASS — 68 suites, 530 tests |
| catalog seed run 1 | PASS — created 24, preserved 0, conflicts 0 |
| catalog seed run 2 | PASS — created 0, preserved 24, conflicts 0 |
| inventory seed | PASS — active 0, skipped DRAFT 24, created receipt 0 |
| database relation verification | PASS — 24 relations valid, 28 variants, 0 media |
| `git diff --check` | PASS |
| GitNexus impact trước sửa `seed` | LOW — 1 direct file caller, 0 process |
| GitNexus `detect-changes --scope all` | HIGH cho toàn dirty worktree Phase 11.5 — 30 symbols/8 auth-avatar-image flows; task seed không thuộc các flow này |

## 9. Regression

- 40 Category vẫn tồn tại (8 root + 32 child).
- Ba fixture manual giữ nguyên tên/status/aggregate:
  - `ReLIFE - Tập 12 Manual 10B`: ACTIVE, 1 Variant, 1 Media, 3 Category.
  - `Chuyện Tình Thị Trấn Manual 10B`: ACTIVE, 2 Variant, 4 Media, 3 Category.
  - `Bút bi Thiên Long FO-024 Manual 10B`: ACTIVE, 6 Variant, 8 Media, 2 Category.
- Receipt hiện hữu vẫn là 6; không tạo receipt prefix `DEMO-STOREFRONT-` khi các Product còn DRAFT.
- Không stage, commit, push, reset hoặc clean.
- New untracked seed files chưa có trong committed GitNexus index; targeted/full tests và database verification là coverage trực tiếp cho phần này.

## 10. Kết luận

**BOOKORA STOREFRONT DEMO CATALOG SEED — DONE**
