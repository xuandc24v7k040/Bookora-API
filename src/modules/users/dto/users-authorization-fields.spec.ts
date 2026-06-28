import { ValidationPipe } from '@nestjs/common';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';

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
});
