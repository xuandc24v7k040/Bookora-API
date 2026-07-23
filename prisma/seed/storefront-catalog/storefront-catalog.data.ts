export const STOREFRONT_DEMO_PREFIX = 'DEMO';

export const STOREFRONT_SALE_PERIODS = {
  ACTIVE: {
    startAt: '2026-01-01T00:00:00.000Z',
    endAt: '2027-12-31T23:59:59.999Z',
  },
  FUTURE: {
    startAt: '2027-01-01T00:00:00.000Z',
    endAt: '2027-02-01T00:00:00.000Z',
  },
  EXPIRED: {
    startAt: '2025-01-01T00:00:00.000Z',
    endAt: '2025-12-31T23:59:59.999Z',
  },
} as const;

export type StorefrontSaleState = keyof typeof STOREFRONT_SALE_PERIODS | 'NONE';

export type StorefrontVariantDefinition = {
  name: string;
  sku: string;
  optionValue?: string;
  originalPrice: number;
  salePrice?: number;
  isbn?: string;
  isDefault?: boolean;
};

export type StorefrontProductDefinition = {
  name: string;
  slug: string;
  categorySlug: string;
  authors: readonly string[];
  publisher: string;
  shortDescription: string;
  description: string;
  releaseDate: string;
  publicationYear: number;
  pageCount: number;
  weightGram: number;
  packageSize: string;
  saleState: StorefrontSaleState;
  option?: {
    name: string;
    code: string;
    values: readonly { label: string; value: string }[];
  };
  variants: readonly StorefrontVariantDefinition[];
  research?: {
    sourceUrl: string;
    note: string;
  };
};

const product = (
  definition: StorefrontProductDefinition,
): StorefrontProductDefinition => definition;

export const STOREFRONT_CATALOG_PRODUCTS = [
  product({
    name: 'Nhà Giả Kim (Tái Bản 2025)',
    slug: 'demo-vh-nha-gia-kim-tai-ban-2025',
    categorySlug: 'van-hoc-tieu-thuyet',
    authors: ['Paulo Coelho'],
    publisher: 'Nhà xuất bản Hội Nhà Văn',
    shortDescription:
      'Hành trình theo đuổi ước mơ của chàng chăn cừu Santiago.',
    description:
      'Một tiểu thuyết giàu tính biểu tượng về lựa chọn, lòng can đảm và việc lắng nghe tiếng gọi của chính mình.',
    releaseDate: '2025-01-01T00:00:00.000Z',
    publicationYear: 2025,
    pageCount: 228,
    weightGram: 240,
    packageSize: '20.5 x 14 x 1.1 cm',
    saleState: 'ACTIVE',
    option: {
      name: 'Hình thức',
      code: 'FORMAT',
      values: [
        { label: 'Bìa mềm', value: 'PAPERBACK' },
        { label: 'Bìa cứng', value: 'HARDCOVER' },
      ],
    },
    variants: [
      {
        name: 'Bìa mềm',
        sku: 'DEMO-VH-NGK-PB',
        optionValue: 'PAPERBACK',
        originalPrice: 95000,
        salePrice: 76000,
        isDefault: true,
      },
      {
        name: 'Bìa cứng',
        sku: 'DEMO-VH-NGK-HC',
        optionValue: 'HARDCOVER',
        originalPrice: 165000,
        salePrice: 132000,
      },
    ],
    research: {
      sourceUrl: 'https://www.fahasa.com/nha-gia-kim-tai-ban-2025.html',
      note: 'Fahasa công khai Paulo Coelho, Hội Nhà Văn, bìa mềm, 228 trang, 240 g và giá tham khảo 76.000đ.',
    },
  }),
  product({
    name: 'Sứ Mệnh Hail Mary',
    slug: 'demo-vh-su-menh-hail-mary',
    categorySlug: 'van-hoc-tieu-thuyet',
    authors: ['Andy Weir'],
    publisher: 'Nhà xuất bản Thế Giới',
    shortDescription:
      'Một nhiệm vụ khoa học viễn tưởng quyết định tương lai Trái Đất.',
    description:
      'Ryland Grace tỉnh dậy giữa không gian và phải ghép lại ký ức để hoàn thành sứ mệnh cuối cùng của nhân loại.',
    releaseDate: '2021-05-04T00:00:00.000Z',
    publicationYear: 2021,
    pageCount: 536,
    weightGram: 620,
    packageSize: '24 x 16 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-VH-HAIL-MARY', originalPrice: 239000 },
    ],
    research: {
      sourceUrl:
        'https://www.fahasa.com/blog/review-sach-su-menh-hail-mary-project-hail-mary/',
      note: 'Fahasa xác nhận tựa Việt và tác giả Andy Weir; thông số còn lại là fixture demo hợp lý.',
    },
  }),
  product({
    name: 'Người Đàn Ông Mang Tên OVE',
    slug: 'demo-vh-nguoi-dan-ong-mang-ten-ove',
    categorySlug: 'van-hoc-tieu-thuyet',
    authors: ['Fredrik Backman'],
    publisher: 'Nhà xuất bản Trẻ',
    shortDescription:
      'Câu chuyện ấm áp về một người đàn ông nguyên tắc và khu phố của ông.',
    description:
      'Một tiểu thuyết hài hước, cảm động về mất mát, tình láng giềng và cơ hội bắt đầu lại.',
    releaseDate: '2012-08-27T00:00:00.000Z',
    publicationYear: 2024,
    pageCount: 456,
    weightGram: 520,
    packageSize: '20.5 x 14 cm',
    saleState: 'NONE',
    variants: [{ name: 'Mặc định', sku: 'DEMO-VH-OVE', originalPrice: 179000 }],
    research: {
      sourceUrl:
        'https://www.fahasa.com/nguoi-dan-ong-mang-ten-ove-tai-ban.html',
      note: 'Thay candidate Beartown bằng đầu sách Fredrik Backman đang xuất hiện trên bảng Văn học Fahasa.',
    },
  }),
  product({
    name: 'Nếu Biết Trăm Năm Là Hữu Hạn',
    slug: 'demo-vh-neu-biet-tram-nam-la-huu-han',
    categorySlug: 'van-hoc-truyen-ngan-tan-van',
    authors: ['Phạm Lữ Ân'],
    publisher: 'Nhà xuất bản Hội Nhà Văn',
    shortDescription:
      'Những trang tản văn nhẹ nhàng về thời gian và cách sống.',
    description:
      'Tập tản văn gợi người đọc quan sát những điều bình dị, trân trọng hiện tại và các mối quan hệ quanh mình.',
    releaseDate: '2024-01-15T00:00:00.000Z',
    publicationYear: 2024,
    pageCount: 320,
    weightGram: 360,
    packageSize: '20 x 13 cm',
    saleState: 'ACTIVE',
    variants: [
      {
        name: 'Mặc định',
        sku: 'DEMO-VH-TRAM-NAM',
        originalPrice: 135000,
        salePrice: 108000,
      },
    ],
  }),
  product({
    name: 'Trên Đường Băng',
    slug: 'demo-vh-tren-duong-bang',
    categorySlug: 'van-hoc-truyen-ngan-tan-van',
    authors: ['Tony Buổi Sáng'],
    publisher: 'Nhà xuất bản Trẻ',
    shortDescription:
      'Các câu chuyện ngắn khuyến khích người trẻ chủ động trưởng thành.',
    description:
      'Tập bài viết gần gũi về học tập, trải nghiệm, kỷ luật và tinh thần chuẩn bị cho hành trình dài phía trước.',
    releaseDate: '2015-01-01T00:00:00.000Z',
    publicationYear: 2023,
    pageCount: 308,
    weightGram: 330,
    packageSize: '20.5 x 13 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-VH-DUONG-BANG', originalPrice: 110000 },
    ],
  }),
  product({
    name: 'Thương Mấy Cũng Là Người Dưng',
    slug: 'demo-vh-thuong-may-cung-la-nguoi-dung',
    categorySlug: 'van-hoc-truyen-ngan-tan-van',
    authors: ['Anh Khang'],
    publisher: 'Nhà xuất bản Hội Nhà Văn',
    shortDescription:
      'Tản văn về tình yêu, chia xa và sự bình thản sau tổn thương.',
    description:
      'Những ghi chép ngắn về cảm xúc của người trẻ khi học cách chấp nhận, buông bỏ và bước tiếp.',
    releaseDate: '2016-09-01T00:00:00.000Z',
    publicationYear: 2022,
    pageCount: 216,
    weightGram: 260,
    packageSize: '20 x 13 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-VH-NGUOI-DUNG', originalPrice: 89000 },
    ],
  }),
  product({
    name: 'Your Name',
    slug: 'demo-vh-your-name',
    categorySlug: 'van-hoc-light-novel',
    authors: ['Makoto Shinkai'],
    publisher: 'Nhà xuất bản Kim Đồng',
    shortDescription: 'Hai người trẻ xa lạ kết nối qua những giấc mơ kỳ lạ.',
    description:
      'Light novel kết hợp tuổi trẻ, ký ức và khoảng cách thời gian trong một hành trình tìm kiếm đầy cảm xúc.',
    releaseDate: '2016-06-18T00:00:00.000Z',
    publicationYear: 2024,
    pageCount: 256,
    weightGram: 300,
    packageSize: '19 x 13 cm',
    saleState: 'ACTIVE',
    option: {
      name: 'Phiên bản',
      code: 'EDITION',
      values: [
        { label: 'Bản thường', value: 'STANDARD' },
        { label: 'Bản đặc biệt', value: 'SPECIAL' },
      ],
    },
    variants: [
      {
        name: 'Bản thường',
        sku: 'DEMO-VH-YOUR-NAME-STD',
        optionValue: 'STANDARD',
        originalPrice: 95000,
        salePrice: 76000,
        isDefault: true,
      },
      {
        name: 'Bản đặc biệt',
        sku: 'DEMO-VH-YOUR-NAME-SP',
        optionValue: 'SPECIAL',
        originalPrice: 159000,
        salePrice: 127000,
      },
    ],
  }),
  product({
    name: '5 Centimet Trên Giây',
    slug: 'demo-vh-5-centimet-tren-giay',
    categorySlug: 'van-hoc-light-novel',
    authors: ['Makoto Shinkai'],
    publisher: 'Nhà xuất bản Kim Đồng',
    shortDescription:
      'Những lát cắt về tình yêu và khoảng cách theo năm tháng.',
    description:
      'Một câu chuyện giàu hình ảnh về những người từng gần nhau nhưng dần trôi về các hướng khác biệt.',
    releaseDate: '2007-11-16T00:00:00.000Z',
    publicationYear: 2023,
    pageCount: 188,
    weightGram: 230,
    packageSize: '19 x 13 cm',
    saleState: 'NONE',
    variants: [{ name: 'Mặc định', sku: 'DEMO-VH-5CM', originalPrice: 85000 }],
  }),
  product({
    name: 'Thám Tử Đã Chết - Tập 1',
    slug: 'demo-vh-tham-tu-da-chet-tap-1',
    categorySlug: 'van-hoc-light-novel',
    authors: ['Nigozyu'],
    publisher: 'Nhà xuất bản Kim Đồng',
    shortDescription:
      'Một bí ẩn tiếp diễn sau khi vị thám tử huyền thoại không còn.',
    description:
      'Light novel trinh thám pha hành động kể về người trợ lý phải đối mặt với các manh mối còn dang dở.',
    releaseDate: '2019-11-25T00:00:00.000Z',
    publicationYear: 2024,
    pageCount: 328,
    weightGram: 380,
    packageSize: '19 x 13 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-VH-TTDC-01', originalPrice: 125000 },
    ],
  }),
  product({
    name: 'Bến Xe (Tái Bản 2020)',
    slug: 'demo-vh-ben-xe-tai-ban-2020',
    categorySlug: 'van-hoc-ngon-tinh',
    authors: ['Thương Thái Vi'],
    publisher: 'Nhà xuất bản Phụ Nữ Việt Nam',
    shortDescription: 'Một chuyện tình thanh xuân dịu dàng và nhiều day dứt.',
    description:
      'Tiểu thuyết tình cảm theo dấu những cuộc gặp gỡ, lựa chọn và ký ức còn lại khi mỗi người đi qua một chặng đời.',
    releaseDate: '2020-01-01T00:00:00.000Z',
    publicationYear: 2020,
    pageCount: 280,
    weightGram: 320,
    packageSize: '20.5 x 14 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-VH-BEN-XE', originalPrice: 118000 },
    ],
    research: {
      sourceUrl: 'https://www.fahasa.com/ben-xe-tai-ban-2020.html',
      note: 'Đầu sách đang xuất hiện trong bảng Văn học của Fahasa tại ngày nghiên cứu.',
    },
  }),
  product({
    name: 'Vụng Trộm Yêu Anh',
    slug: 'demo-vh-vung-trom-yeu-anh',
    categorySlug: 'van-hoc-ngon-tinh',
    authors: ['Trúc Dĩ'],
    publisher: 'Nhà xuất bản Phụ Nữ Việt Nam',
    shortDescription:
      'Tình cảm thầm kín lớn dần theo những năm tháng trưởng thành.',
    description:
      'Một tiểu thuyết tình cảm nhẹ nhàng về sự chân thành, khoảng cách tuổi trẻ và thời điểm thích hợp để nói ra.',
    releaseDate: '2021-01-01T00:00:00.000Z',
    publicationYear: 2023,
    pageCount: 520,
    weightGram: 620,
    packageSize: '22 x 15 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-VH-VTYA', originalPrice: 249000 },
    ],
  }),
  product({
    name: 'Đuổi Theo Mùa Hạ',
    slug: 'demo-vh-duoi-theo-mua-ha',
    categorySlug: 'van-hoc-ngon-tinh',
    authors: ['Mộc Qua Hoàng'],
    publisher: 'Nhà xuất bản Phụ Nữ Việt Nam',
    shortDescription:
      'Một câu chuyện tình cảm mang không khí rực rỡ của mùa hè.',
    description:
      'Tiểu thuyết thanh xuân kể về những rung động, hiểu lầm và lựa chọn giúp các nhân vật trưởng thành.',
    releaseDate: '2027-03-15T00:00:00.000Z',
    publicationYear: 2027,
    pageCount: 448,
    weightGram: 540,
    packageSize: '22 x 15 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-VH-MUA-HA', originalPrice: 219000 },
    ],
  }),
  product({
    name: 'Shoe Dog - Gã Nghiện Giày',
    slug: 'demo-kt-shoe-dog-ga-nghien-giay',
    categorySlug: 'kinh-te-nhan-vat-bai-hoc-kinh-doanh',
    authors: ['Phil Knight'],
    publisher: 'Nhà xuất bản Lao Động',
    shortDescription: 'Hồi ký khởi nghiệp của người đồng sáng lập Nike.',
    description:
      'Câu chuyện chân thực về những quyết định, rủi ro và con người phía sau hành trình xây dựng một thương hiệu toàn cầu.',
    releaseDate: '2016-04-26T00:00:00.000Z',
    publicationYear: 2022,
    pageCount: 496,
    weightGram: 580,
    packageSize: '23 x 15 cm',
    saleState: 'ACTIVE',
    variants: [
      {
        name: 'Mặc định',
        sku: 'DEMO-KT-SHOE-DOG',
        originalPrice: 198000,
        salePrice: 158000,
      },
    ],
  }),
  product({
    name: 'Steve Jobs',
    slug: 'demo-kt-steve-jobs',
    categorySlug: 'kinh-te-nhan-vat-bai-hoc-kinh-doanh',
    authors: ['Walter Isaacson'],
    publisher: 'Nhà xuất bản Thế Giới',
    shortDescription:
      'Tiểu sử về nhà sáng tạo có ảnh hưởng sâu rộng tới ngành công nghệ.',
    description:
      'Bức chân dung nhiều chiều về tầm nhìn, tính cách và những quyết định đã định hình Apple cùng nhiều ngành sáng tạo.',
    releaseDate: '2011-10-24T00:00:00.000Z',
    publicationYear: 2023,
    pageCount: 680,
    weightGram: 820,
    packageSize: '24 x 16 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-KT-STEVE-JOBS', originalPrice: 349000 },
    ],
  }),
  product({
    name: 'Elon Musk',
    slug: 'demo-kt-elon-musk',
    categorySlug: 'kinh-te-nhan-vat-bai-hoc-kinh-doanh',
    authors: ['Walter Isaacson'],
    publisher: 'Nhà xuất bản Công Thương',
    shortDescription:
      'Tiểu sử về doanh nhân đứng sau nhiều công ty công nghệ lớn.',
    description:
      'Một góc nhìn tổng hợp về tham vọng, phong cách điều hành và các dự án công nghệ gắn với Elon Musk.',
    releaseDate: '2027-04-15T00:00:00.000Z',
    publicationYear: 2027,
    pageCount: 704,
    weightGram: 900,
    packageSize: '24 x 16 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-KT-ELON-MUSK', originalPrice: 399000 },
    ],
    research: {
      sourceUrl:
        'https://www.fahasa.com/tieu-su-elon-musk-ban-dac-biet-bia-cung-ar.html',
      note: 'Fahasa xác nhận edition Walter Isaacson, Nhà xuất bản Công Thương; ngày phát hành 2027 là fixture demo.',
    },
  }),
  product({
    name: 'Một Đời Quản Trị',
    slug: 'demo-kt-mot-doi-quan-tri',
    categorySlug: 'kinh-te-quan-tri-lanh-dao',
    authors: ['Phan Văn Trường'],
    publisher: 'Nhà xuất bản Trẻ',
    shortDescription: 'Những chiêm nghiệm thực tế từ một đời làm quản trị.',
    description:
      'Các câu chuyện nghề nghiệp giúp người đọc nhìn rõ hơn về tổ chức, con người và trách nhiệm của người quản lý.',
    releaseDate: '2019-01-01T00:00:00.000Z',
    publicationYear: 2024,
    pageCount: 488,
    weightGram: 560,
    packageSize: '23 x 15 cm',
    saleState: 'FUTURE',
    variants: [
      {
        name: 'Mặc định',
        sku: 'DEMO-KT-MDQT',
        originalPrice: 199000,
        salePrice: 169000,
      },
    ],
  }),
  product({
    name: 'Lãnh Đạo Luôn Ăn Sau Cùng',
    slug: 'demo-kt-lanh-dao-luon-an-sau-cung',
    categorySlug: 'kinh-te-quan-tri-lanh-dao',
    authors: ['Simon Sinek'],
    publisher: 'Nhà xuất bản Lao Động',
    shortDescription:
      'Một cách tiếp cận lãnh đạo đặt niềm tin và con người làm nền tảng.',
    description:
      'Cuốn sách phân tích cách môi trường an toàn và tinh thần phục vụ giúp đội ngũ hợp tác bền vững hơn.',
    releaseDate: '2014-01-07T00:00:00.000Z',
    publicationYear: 2023,
    pageCount: 420,
    weightGram: 500,
    packageSize: '23 x 15 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-KT-LDLASC', originalPrice: 189000 },
    ],
  }),
  product({
    name: 'Chiến Lược Đại Dương Xanh',
    slug: 'demo-kt-chien-luoc-dai-duong-xanh',
    categorySlug: 'kinh-te-quan-tri-lanh-dao',
    authors: ['W. Chan Kim', 'Renée Mauborgne'],
    publisher: 'Nhà xuất bản Lao Động',
    shortDescription:
      'Khung tư duy tìm kiếm không gian thị trường mới thay vì đối đầu trực tiếp.',
    description:
      'Cuốn sách trình bày các công cụ chiến lược giúp doanh nghiệp tái định hình giá trị và tạo ra nhu cầu mới.',
    releaseDate: '2027-05-15T00:00:00.000Z',
    publicationYear: 2027,
    pageCount: 392,
    weightGram: 520,
    packageSize: '24 x 16 cm',
    saleState: 'NONE',
    option: {
      name: 'Hình thức',
      code: 'FORMAT',
      values: [
        { label: 'Bìa mềm', value: 'PAPERBACK' },
        { label: 'Bìa cứng', value: 'HARDCOVER' },
      ],
    },
    variants: [
      {
        name: 'Bìa mềm',
        sku: 'DEMO-KT-CLDDX-PB',
        optionValue: 'PAPERBACK',
        originalPrice: 229000,
        isDefault: true,
      },
      {
        name: 'Bìa cứng',
        sku: 'DEMO-KT-CLDDX-HC',
        optionValue: 'HARDCOVER',
        originalPrice: 329000,
      },
    ],
  }),
  product({
    name: 'Marketing Phải Bán Được Hàng',
    slug: 'demo-kt-marketing-phai-ban-duoc-hang',
    categorySlug: 'kinh-te-marketing-ban-hang',
    authors: ['Donald Miller', 'J. J. Peterson'],
    publisher: 'Nhà xuất bản Lao Động',
    shortDescription:
      'Năm bước đưa thông điệp marketing vào một kế hoạch có thể triển khai.',
    description:
      'Cẩm nang thực hành giúp doanh nghiệp làm rõ thông điệp, xây dựng nội dung và kết nối các hoạt động marketing với bán hàng.',
    releaseDate: '2022-01-01T00:00:00.000Z',
    publicationYear: 2022,
    pageCount: 272,
    weightGram: 330,
    packageSize: '20.5 x 14 cm',
    saleState: 'ACTIVE',
    variants: [
      {
        name: 'Mặc định',
        sku: 'DEMO-KT-MKT-BAN-HANG',
        originalPrice: 159000,
        salePrice: 128000,
      },
    ],
    research: {
      sourceUrl: 'https://www.fahasa.com/marketing-phai-ban-duoc-hang.html',
      note: 'Fahasa công khai Donald Miller, J. J. Peterson, Lao Động, bìa mềm và giá tham khảo 128.000đ/159.000đ.',
    },
  }),
  product({
    name: 'Bán Hàng Thời Kỹ Thuật Số',
    slug: 'demo-kt-ban-hang-thoi-ky-thuat-so',
    categorySlug: 'kinh-te-marketing-ban-hang',
    authors: ['Grant Leboff'],
    publisher: 'Nhà xuất bản Thế Giới',
    shortDescription: 'Tư duy và công cụ bán hàng trong môi trường kết nối số.',
    description:
      'Cuốn sách giới thiệu cách quan sát hành trình khách hàng, sử dụng kênh số và đo lường hiệu quả bán hàng.',
    releaseDate: '2018-01-01T00:00:00.000Z',
    publicationYear: 2018,
    pageCount: 228,
    weightGram: 230,
    packageSize: '20.5 x 14 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-KT-BH-KTS', originalPrice: 96000 },
    ],
    research: {
      sourceUrl: 'https://www.fahasa.com/ban-hang-thoi-ky-thuat-so.html',
      note: 'Fahasa công khai Grant Leboff, Thế Giới, bìa mềm, 228 trang, 230 g và giá 96.000đ.',
    },
  }),
  product({
    name: 'Xây Dựng Câu Chuyện Thương Hiệu',
    slug: 'demo-kt-xay-dung-cau-chuyen-thuong-hieu',
    categorySlug: 'kinh-te-marketing-ban-hang',
    authors: ['Donald Miller'],
    publisher: 'Nhà xuất bản Lao Động',
    shortDescription:
      'Khung kể chuyện giúp thương hiệu truyền đạt giá trị rõ ràng hơn.',
    description:
      'Một hướng dẫn thực hành để đặt khách hàng vào trung tâm câu chuyện và biến thông điệp thành lời kêu gọi hành động dễ hiểu.',
    releaseDate: '2027-06-15T00:00:00.000Z',
    publicationYear: 2027,
    pageCount: 256,
    weightGram: 320,
    packageSize: '20.5 x 14 cm',
    saleState: 'NONE',
    option: {
      name: 'Phiên bản',
      code: 'EDITION',
      values: [
        { label: 'Bản 2021', value: 'EDITION_2021' },
        { label: 'Tái bản 2025', value: 'EDITION_2025' },
      ],
    },
    variants: [
      {
        name: 'Bản 2021',
        sku: 'DEMO-KT-STORYBRAND-21',
        optionValue: 'EDITION_2021',
        originalPrice: 169000,
        isDefault: true,
      },
      {
        name: 'Tái bản 2025',
        sku: 'DEMO-KT-STORYBRAND-25',
        optionValue: 'EDITION_2025',
        originalPrice: 219000,
      },
    ],
    research: {
      sourceUrl:
        'https://www.fahasa.com/building-a-story-brand-xay-dung-cau-chuyen-thuong-hieu-tai-ban-2025.html',
      note: 'Fahasa có edition Donald Miller tái bản 2025; ngày phát hành tương lai là fixture demo.',
    },
  }),
  product({
    name: 'Kinh Tế Học Trong Một Bài Học',
    slug: 'demo-kt-kinh-te-hoc-trong-mot-bai-hoc',
    categorySlug: 'kinh-te-phan-tich-kinh-te',
    authors: ['Henry Hazlitt'],
    publisher: 'Nhà xuất bản Tri Thức',
    shortDescription:
      'Nhập môn tư duy kinh tế qua tác động nhìn thấy và tác động gián tiếp.',
    description:
      'Cuốn sách hướng người đọc xem xét hệ quả dài hạn của chính sách đối với nhiều nhóm thay vì chỉ một lợi ích trước mắt.',
    releaseDate: '1946-01-01T00:00:00.000Z',
    publicationYear: 2023,
    pageCount: 288,
    weightGram: 350,
    packageSize: '21 x 14 cm',
    saleState: 'EXPIRED',
    variants: [
      {
        name: 'Mặc định',
        sku: 'DEMO-KT-ONE-LESSON',
        originalPrice: 149000,
        salePrice: 119000,
      },
    ],
  }),
  product({
    name: 'Siêu Kinh Tế Học Hài Hước',
    slug: 'demo-kt-sieu-kinh-te-hoc-hai-huoc',
    categorySlug: 'kinh-te-phan-tich-kinh-te',
    authors: ['Steven D. Levitt', 'Stephen J. Dubner'],
    publisher: 'Nhà xuất bản Tri Thức',
    shortDescription:
      'Những câu hỏi đời thường được soi chiếu bằng dữ liệu và tư duy kinh tế.',
    description:
      'Tác phẩm dùng các tình huống bất ngờ để minh họa cách động cơ, dữ liệu và thiên kiến ảnh hưởng đến quyết định.',
    releaseDate: '2009-10-20T00:00:00.000Z',
    publicationYear: 2023,
    pageCount: 368,
    weightGram: 430,
    packageSize: '21 x 14 cm',
    saleState: 'NONE',
    variants: [
      { name: 'Mặc định', sku: 'DEMO-KT-SUPER-FREAK', originalPrice: 179000 },
    ],
    research: {
      sourceUrl: 'https://www.fahasa.com/review/product/list/id/23546/84271',
      note: 'Thay candidate bằng edition Siêu Kinh Tế Học Hài Hước đang được Fahasa lập danh mục, đúng hai tác giả.',
    },
  }),
  product({
    name: 'Tâm Lý Học Về Tiền',
    slug: 'demo-kt-tam-ly-hoc-ve-tien',
    categorySlug: 'kinh-te-phan-tich-kinh-te',
    authors: ['Morgan Housel'],
    publisher: 'Nhà xuất bản Dân Trí',
    shortDescription:
      'Những bài học về hành vi, rủi ro và quyết định tài chính dài hạn.',
    description:
      'Cuốn sách giải thích vì sao thái độ và trải nghiệm cá nhân thường quan trọng không kém kiến thức trong quản lý tiền bạc.',
    releaseDate: '2020-09-08T00:00:00.000Z',
    publicationYear: 2024,
    pageCount: 384,
    weightGram: 450,
    packageSize: '21 x 14 cm',
    saleState: 'ACTIVE',
    variants: [
      {
        name: 'Mặc định',
        sku: 'DEMO-KT-TLHVT',
        originalPrice: 189000,
        salePrice: 149000,
      },
    ],
  }),
] as const satisfies readonly StorefrontProductDefinition[];

export const STOREFRONT_CATEGORY_SLUGS = [
  'van-hoc-tieu-thuyet',
  'van-hoc-truyen-ngan-tan-van',
  'van-hoc-light-novel',
  'van-hoc-ngon-tinh',
  'kinh-te-nhan-vat-bai-hoc-kinh-doanh',
  'kinh-te-quan-tri-lanh-dao',
  'kinh-te-marketing-ban-hang',
  'kinh-te-phan-tich-kinh-te',
] as const;
