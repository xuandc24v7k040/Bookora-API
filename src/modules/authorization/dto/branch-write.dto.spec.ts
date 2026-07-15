import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateBranchDto,
  UpdateBranchDto,
} from './authorization-management.dto';

describe('Branch write DTOs', () => {
  const requiredCreate = {
    code: 'ct-01',
    name: 'Cần Thơ',
    address: 'Ninh Kiều',
  };

  it.each([true, false])('accepts create status %s', async (isActive) => {
    const dto = plainToInstance(CreateBranchDto, {
      ...requiredCreate,
      isActive,
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts omitted create status for service defaulting', async () => {
    await expect(
      validate(plainToInstance(CreateBranchDto, requiredCreate)),
    ).resolves.toHaveLength(0);
  });

  it.each([true, false])('accepts update status %s', async (isActive) => {
    await expect(
      validate(plainToInstance(UpdateBranchDto, { isActive })),
    ).resolves.toHaveLength(0);
  });

  it('rejects incomplete coordinate pairs', async () => {
    const errors = await validate(
      plainToInstance(CreateBranchDto, {
        ...requiredCreate,
        latitude: 10.0452,
      }),
    );
    expect(errors.some((error) => error.property === 'coordinates')).toBe(true);
  });

  it('rejects 0,0 coordinates', async () => {
    const errors = await validate(
      plainToInstance(UpdateBranchDto, {
        latitude: 0,
        longitude: 0,
      }),
    );
    expect(errors.some((error) => error.property === 'coordinates')).toBe(true);
  });

  it('accepts manual addresses without coordinates', async () => {
    await expect(
      validate(
        plainToInstance(CreateBranchDto, {
          ...requiredCreate,
          province: 'Thành phố Cần Thơ',
          ward: 'Phường Ninh Kiều',
          latitude: null,
          longitude: null,
        }),
      ),
    ).resolves.toHaveLength(0);
  });
});
