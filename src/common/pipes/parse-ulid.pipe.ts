import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

@Injectable()
export class ParseUlidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const normalizedValue = value.toUpperCase();
    if (!ULID_PATTERN.test(normalizedValue)) {
      throw new BadRequestException('Định dạng ULID không hợp lệ');
    }

    return normalizedValue;
  }
}
