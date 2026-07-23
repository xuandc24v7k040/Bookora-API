import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateCustomerProfileDto } from './customer-account.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('UpdateCustomerProfileDto', () => {
  it('rejects email because customer email is protected', async () => {
    await expect(
      pipe.transform(
        { fullName: 'Nguyễn Văn A', email: 'other@example.com' },
        { type: 'body', metatype: UpdateCustomerProfileDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts the allowlisted editable profile fields', async () => {
    await expect(
      pipe.transform(
        {
          fullName: 'Nguyễn Văn A',
          phone: '0901234567',
          gender: 'male',
          birthday: '2000-01-02',
        },
        { type: 'body', metatype: UpdateCustomerProfileDto },
      ),
    ).resolves.toMatchObject({ fullName: 'Nguyễn Văn A' });
  });
});
