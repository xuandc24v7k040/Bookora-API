import { DestinationTypeResolver } from './destination-type.resolver';

describe('DestinationTypeResolver', () => {
  const resolver = new DestinationTypeResolver();

  it.each([
    ['Phường Ninh Kiều', 'WARD'],
    ['  PHƯỜNG   Ninh Kiều ', 'WARD'],
    ['Xã Mỹ Khánh', 'COMMUNE'],
    ['Đặc khu Côn Đảo', 'SPECIAL_ZONE'],
    ['Ninh Kiều', 'UNKNOWN'],
  ] as const)('derives %s authoritatively', (name, expected) => {
    expect(resolver.fromAdministrativeName(name)).toBe(expected);
  });

  it.each(['UNKNOWN', 'SPECIAL_ZONE'] as const)(
    'falls %s back to the safer commune rate',
    (sourceType) => {
      expect(resolver.resolve(sourceType)).toEqual({
        sourceType,
        destinationType: 'COMMUNE',
        resolution: 'DESTINATION_TYPE_FALLBACK_COMMUNE',
      });
    },
  );
});
