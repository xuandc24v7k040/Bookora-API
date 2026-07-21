import {
  Prisma,
  ProductAttributeType,
} from '../../src/generated/prisma/client';
import { toSlug } from '../../src/common/utils/slug.util';
type SeedClient = Pick<
  Prisma.TransactionClient,
  'supplier' | 'publisher' | 'author' | 'productAttribute'
>;
export const PRODUCT_MASTER_DATA_SNAPSHOT = {
  suppliers: [
    {
      id: '01KXZH3K4D79K2KXFFNR2QNPWQ',
      name: 'Công ty Phân phối Sách Cửu Long',
      phone: '0292 381 0001',
      email: 'cuulong@bookora.example',
      address: 'Cần Thơ',
    },
    {
      id: '01KXZH3K4M46EX8AEJTEV8CHV8',
      name: 'Công ty Phát hành Tri Thức Việt',
      phone: '028 381 0002',
      email: 'trithucviet@bookora.example',
      address: 'Thành phố Hồ Chí Minh',
    },
    {
      id: '01KXZH3K4N6JE32JAVCA2SXAT4',
      name: 'Công ty Sách và Văn phòng phẩm Mekong',
      phone: null,
      email: 'mekong@bookora.example',
      address: 'Cần Thơ',
    },
    {
      id: '01KXZH3K4NW3DJPR3QSKXT8897',
      name: 'Công ty Phân phối Giáo dục Ánh Dương',
      phone: '024 381 0004',
      email: null,
      address: 'Hà Nội',
    },
    {
      id: '01KXZH3K4NHGJCWNEGKMATDD5A',
      name: 'Công ty Thương mại Văn hóa Sen Việt',
      phone: null,
      email: null,
      address: 'Đồng bằng sông Cửu Long',
    },
  ],
  publishers: [
    ['01KXZH3K4N6V7BWD0HAXHV7B39', 'Nhà xuất bản Kim Đồng'],
    ['01KXZH3K4PBXQ2M6MKDRMHA0HW', 'Nhà xuất bản Trẻ'],
    ['01KXZH3K4PYG3N1MS73966BC10', 'Nhà xuất bản Hội Nhà Văn'],
    ['01KXZH3K4QD6HG4PQ2VFTJX4XN', 'Nhà xuất bản Giáo dục Việt Nam'],
    ['01KXZH3K4RFT35F9GXYPA64X2D', 'Nhà xuất bản Lao Động'],
    ['01KXZH3K4RQT30NW2294A5W8Z1', 'Nhà xuất bản Thế Giới'],
    ['01KXZH3K4RZSXCYRD2XXMPNX60', 'Nhà xuất bản Phụ Nữ Việt Nam'],
    [
      '01KXZH3K4SWJK7KKQ5D1DKDKB3',
      'Nhà xuất bản Tổng hợp Thành phố Hồ Chí Minh',
    ],
  ].map(([id, name]) => ({ id, name })),
  authors: [
    ['01KXZH3K4SVZSEJT49GE3KAAHY', 'Nguyễn Nhật Ánh'],
    ['01KXZH3K4T7ZWR9212XN9XQJE4', 'Tô Hoài'],
    ['01KXZH3K4THE3N3D2EAA1T1NZW', 'Nam Cao'],
    ['01KXZH3K4TES0HX58YD7666F68', 'Nguyễn Ngọc Tư'],
    ['01KXZH3K4VYWH9ZNPHARZ71EEH', 'Thạch Lam'],
    ['01KXZH3K4VSK0T9RAGQ49YCR68', 'Vũ Trọng Phụng'],
    ['01KXZH3K4VGCEBV90YJAJWEJNH', 'Ngô Tất Tố'],
    ['01KXZH3K4WBW6YMGGCTGQE0R7Y', 'Xuân Quỳnh'],
    ['01KXZH3K4WG6VSWE1KR29PB00J', 'Haruki Murakami'],
    ['01KXZH3K4WXJM5B27W6D9DXFRE', 'J. K. Rowling'],
    ['01KXZH3K4XY8HAQ484ZEWVY06C', 'Antoine de Saint-Exupéry'],
    ['01KXZH3K4X7SCM9MXASGJZX9A8', 'Nguyễn Du'],
  ].map(([id, name]) => ({ id, name })),
  attributes: [
    {
      id: '01KXZH3K4X4KD7BWF4KJ3JXVNW',
      name: 'Ngôn ngữ',
      code: 'LANGUAGE',
      type: ProductAttributeType.TEXT,
    },
    {
      id: '01KXZH3K4Y45KVMENT3Z09R7QD',
      name: 'Xuất xứ',
      code: 'ORIGIN',
      type: ProductAttributeType.SINGLE_SELECT,
    },
    {
      id: '01KXZH3K4YJB87STTEWXYZD449',
      name: 'Số trang',
      code: 'PAGE_COUNT',
      type: ProductAttributeType.NUMBER,
    },
    {
      id: '01KXZH3K5057K8XVT0KMRRGTHK',
      name: 'Độ tuổi đề xuất',
      code: 'RECOMMENDED_AGE',
      type: ProductAttributeType.TEXT,
    },
    {
      id: '01KXZH3K50F0WEPARCFXXDP07P',
      name: 'Thương hiệu',
      code: 'BRAND',
      type: ProductAttributeType.TEXT,
    },
    {
      id: '01KXZH3K50RW6BZJJP26W5B03H',
      name: 'Chất liệu',
      code: 'MATERIAL',
      type: ProductAttributeType.MULTI_SELECT,
    },
    {
      id: '01KXZH3K514RCK9AE6G3EF2W1W',
      name: 'Kích thước ngòi bút',
      code: 'NIB_SIZE',
      type: ProductAttributeType.NUMBER,
    },
    {
      id: '01KXZH3K518HF2KHV67WYGZKY2',
      name: 'Loại mực',
      code: 'INK_TYPE',
      type: ProductAttributeType.SINGLE_SELECT,
    },
    {
      id: '01KXZH3K51TQR80K5K79F37B2S',
      name: 'Có quà tặng',
      code: 'HAS_GIFT',
      type: ProductAttributeType.BOOLEAN,
    },
    {
      id: '01KXZH3K52EVZN40RM0BEZFJ8H',
      name: 'Ngày phát hành',
      code: 'PUBLICATION_DATE',
      type: ProductAttributeType.DATE,
    },
  ],
} as const;

export async function seedProductMasterData(tx: SeedClient): Promise<void> {
  for (const item of PRODUCT_MASTER_DATA_SNAPSHOT.suppliers) {
    const exists = await tx.supplier.findFirst({
      where: { OR: [{ id: item.id }, { slug: toSlug(item.name) }] },
      select: { id: true },
    });
    if (!exists)
      await tx.supplier.create({ data: { ...item, slug: toSlug(item.name) } });
  }
  for (const item of PRODUCT_MASTER_DATA_SNAPSHOT.publishers) {
    const exists = await tx.publisher.findFirst({
      where: { OR: [{ id: item.id }, { slug: toSlug(item.name) }] },
      select: { id: true },
    });
    if (!exists)
      await tx.publisher.create({ data: { ...item, slug: toSlug(item.name) } });
  }
  for (const item of PRODUCT_MASTER_DATA_SNAPSHOT.authors) {
    const exists = await tx.author.findFirst({
      where: { OR: [{ id: item.id }, { slug: toSlug(item.name) }] },
      select: { id: true },
    });
    if (!exists)
      await tx.author.create({ data: { ...item, slug: toSlug(item.name) } });
  }
  for (const item of PRODUCT_MASTER_DATA_SNAPSHOT.attributes) {
    const exists = await tx.productAttribute.findFirst({
      where: { OR: [{ id: item.id }, { code: item.code }] },
      select: { id: true },
    });
    if (!exists) await tx.productAttribute.create({ data: item });
  }
}
