import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateBranchDto,
  UpdateBranchDto,
} from './authorization-management.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('Branch address and coordinate DTOs', () => {
  it('accepts two-level addresses and coordinate boundary values', async () => {
    await expect(
      pipe.transform(
        {
          name: 'Boundary Branch',
          code: 'boundary-branch',
          address: 'Số 1, phường Ninh Kiều, Cần Thơ',
          province: 'Cần Thơ',
          ward: 'Ninh Kiều',
          latitude: -90,
          longitude: 180,
        },
        { type: 'body', metatype: CreateBranchDto },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        province: 'Cần Thơ',
        ward: 'Ninh Kiều',
        latitude: -90,
        longitude: 180,
      }),
    );
  });

  it.each([
    ['latitude below minimum', { latitude: -90.0000001 }],
    ['latitude above maximum', { latitude: 90.0000001 }],
    ['longitude below minimum', { longitude: -180.0000001 }],
    ['longitude above maximum', { longitude: 180.0000001 }],
    ['latitude NaN', { latitude: Number.NaN }],
    ['longitude Infinity', { longitude: Number.POSITIVE_INFINITY }],
  ])('rejects %s', async (_name, input) => {
    await expect(
      pipe.transform(input, {
        type: 'body',
        metatype: UpdateBranchDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts omitted and explicit null optional location fields', async () => {
    await expect(
      pipe.transform(
        {
          province: null,
          ward: null,
          latitude: null,
          longitude: null,
        },
        { type: 'body', metatype: UpdateBranchDto },
      ),
    ).resolves.toEqual({
      province: null,
      ward: null,
      latitude: null,
      longitude: null,
    });
    await expect(
      pipe.transform({}, { type: 'body', metatype: UpdateBranchDto }),
    ).resolves.toEqual({});
  });

  it('rejects the obsolete district field', async () => {
    await expect(
      pipe.transform(
        {
          name: 'Legacy Branch',
          code: 'legacy-branch',
          address: 'Legacy address',
          district: 'Legacy district',
        },
        { type: 'body', metatype: CreateBranchDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
