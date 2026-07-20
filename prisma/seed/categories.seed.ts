import { CategoryType, Prisma } from '../../src/generated/prisma/client';
import { buildCategorySlug } from '../../src/modules/categories/category-slug.util';

export const CATEGORY_SEED_TREE = [
  {
    name: 'Văn học',
    children: [
      'Tiểu thuyết',
      'Truyện ngắn - Tản văn',
      'Light Novel',
      'Ngôn tình',
    ],
  },
  {
    name: 'Kinh tế',
    children: [
      'Nhân vật - Bài học kinh doanh',
      'Quản trị - Lãnh đạo',
      'Marketing - Bán hàng',
      'Phân tích kinh tế',
    ],
  },
  {
    name: 'Tâm lý - Kỹ năng sống',
    children: [
      'Kỹ năng sống',
      'Rèn luyện nhân cách',
      'Tâm lý',
      'Sách cho tuổi mới lớn',
    ],
  },
  {
    name: 'Nuôi dạy con',
    children: [
      'Cẩm nang làm cha mẹ',
      'Phương pháp giáo dục trẻ các nước',
      'Phát triển trí tuệ cho trẻ',
      'Phát triển kỹ năng cho trẻ',
    ],
  },
  {
    name: 'Sách thiếu nhi',
    children: [
      'Manga - Comic',
      'Kiến thức bách khoa',
      'Sách tranh kỹ năng sống cho trẻ',
      'Vừa học - Vừa chơi với trẻ',
    ],
  },
  {
    name: 'Tiểu sử - Hồi ký',
    children: [
      'Câu chuyện cuộc đời',
      'Chính trị',
      'Kinh tế',
      'Nghệ thuật - Giải trí',
    ],
  },
  {
    name: 'Giáo khoa - Tham khảo',
    children: [
      'Sách giáo khoa',
      'Sách tham khảo',
      'Luyện thi THPT Quốc gia',
      'Mẫu giáo',
    ],
  },
  {
    name: 'Sách học ngoại ngữ',
    children: ['Tiếng Anh', 'Tiếng Nhật', 'Tiếng Hoa', 'Tiếng Hàn'],
  },
] as const;

type CategorySeedClient = Pick<Prisma.TransactionClient, 'category'>;

export async function seedCategories(tx: CategorySeedClient): Promise<void> {
  for (const [rootIndex, definition] of CATEGORY_SEED_TREE.entries()) {
    const rootSlug = buildCategorySlug(definition.name);
    const root = await tx.category.upsert({
      where: { slug: rootSlug },
      create: {
        name: definition.name,
        slug: rootSlug,
        type: CategoryType.NORMAL,
        isActive: true,
        sortOrder: (rootIndex + 1) * 10,
      },
      update: {
        parentId: null,
        type: CategoryType.NORMAL,
        sortOrder: (rootIndex + 1) * 10,
      },
      select: { id: true, name: true },
    });

    for (const [childIndex, childName] of definition.children.entries()) {
      const childSlug = buildCategorySlug(childName, definition.name);
      await tx.category.upsert({
        where: { slug: childSlug },
        create: {
          name: childName,
          slug: childSlug,
          parentId: root.id,
          type: CategoryType.NORMAL,
          isActive: true,
          sortOrder: (childIndex + 1) * 10,
        },
        update: {
          parentId: root.id,
          type: CategoryType.NORMAL,
          sortOrder: (childIndex + 1) * 10,
        },
      });
    }
  }
}
