import { permissionCatalog } from '../../../prisma/catalog.seed';

describe('Phase 10B product permissions', () => {
  it('contains the complete minimal product permission set without duplicates', () => {
    const codes = permissionCatalog.map(({ code }) => code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'products.read',
        'products.create',
        'products.update',
        'products.delete',
        'products.publish',
      ]),
    );
    expect(new Set(codes).size).toBe(codes.length);
  });
});
