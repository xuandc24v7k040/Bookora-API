import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PublicProductQueryDto } from './dto';

describe('PublicProductQueryDto', () => {
  it.each([
    [{ author: 'j-k-rowling' }, ['j-k-rowling']],
    [
      { author: ['j-k-rowling', 'antoine-de-saint-exupery'] },
      ['j-k-rowling', 'antoine-de-saint-exupery'],
    ],
    [{ publisher: 'nha-xuat-ban-kim-dong' }, ['nha-xuat-ban-kim-dong']],
    [{ publisher: ['nxb-tre', 'nxb-kim-dong'] }, ['nxb-tre', 'nxb-kim-dong']],
  ])(
    'normalizes singular and repeated public facet params',
    async (input, expected) => {
      const dto = plainToInstance(PublicProductQueryDto, input);
      await expect(validate(dto)).resolves.toHaveLength(0);
      expect(dto.author ?? dto.publisher).toEqual(expected);
    },
  );

  it('accepts valid combined filters', async () => {
    const dto = plainToInstance(PublicProductQueryDto, {
      author: ['j-k-rowling'],
      publisher: ['nha-xuat-ban-kim-dong'],
      categorySlug: 'van-hoc',
      onSale: 'true',
      upcoming: 'false',
      priceMin: '10000',
      priceMax: '200000',
      page: '2',
      pageSize: '24',
      sort: 'newest',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      author: ['j-k-rowling'],
      publisher: ['nha-xuat-ban-kim-dong'],
      onSale: true,
      upcoming: false,
      page: 2,
      pageSize: 24,
    });
  });

  it('rejects an object value instead of stringifying it', async () => {
    const dto = plainToInstance(PublicProductQueryDto, {
      author: { slug: 'j-k-rowling' },
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
