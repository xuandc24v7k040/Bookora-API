import { BadRequestException } from '@nestjs/common';
import { ParseUlidPipe } from './parse-ulid.pipe';

describe('ParseUlidPipe', () => {
  const pipe = new ParseUlidPipe();

  it.each(['01JY7M9M9Z4Y7Y7K7QZJ9Y4S4T', '7ZZZZZZZZZZZZZZZZZZZZZZZZZ'])(
    'accepts canonical uppercase ULID %s',
    (value) => {
      expect(pipe.transform(value)).toBe(value);
    },
  );

  it.each([
    '8ZZZZZZZZZZZZZZZZZZZZZZZZZ',
    'ZZZZZZZZZZZZZZZZZZZZZZZZZZ',
    '01JY7M9M9Z4Y7Y7K7QZJ9Y4S4',
    '01JY7M9M9Z4Y7Y7K7QZJ9Y4S4TA',
    '01jy7m9m9z4y7y7k7qzj9y4s4t',
  ])('rejects non-canonical ULID %s', (value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
