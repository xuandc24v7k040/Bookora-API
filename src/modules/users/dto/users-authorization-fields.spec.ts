import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';
import { UsersQueryDto } from './users-query.dto';

describe('Generic Users DTO authorization boundary', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it.each([
    [
      CreateUserDto,
      { fullName: 'User', email: 'user@example.com', type: 'SYSTEM' },
    ],
    [UpdateUserDto, { fullName: 'User', roleIds: ['role-id'] }],
    [UpdateUserDto, { permissionIds: ['permission-id'] }],
    [UpdateUserDto, { branchIds: ['branch-id'] }],
  ])('rejects authorization fields from %p', async (metatype, value) => {
    await expect(
      pipe.transform(value, {
        type: 'body',
        metatype,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts nullable profile fields and a strict calendar date', async () => {
    const dto = plainToInstance(CreateUserDto, {
      fullName: 'User',
      email: 'user@example.com',
      phone: null,
      gender: '  non-binary  ',
      birthday: '1995-08-17',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.gender).toBe('non-binary');
  });

  it.each(['1995-02-31', '1995-08-17T00:00:00.000Z'])(
    'rejects invalid or non-date-only birthday %s',
    async (birthday) => {
      const dto = plainToInstance(UpdateUserDto, { birthday });
      await expect(validate(dto)).resolves.not.toHaveLength(0);
    },
  );

  it('transforms boolean query strings and validates UserType', async () => {
    const dto = plainToInstance(UsersQueryDto, {
      type: 'CUSTOMER',
      isActive: 'false',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.isActive).toBe(false);
  });
});
