import { ensureCatalogFitsParcel } from './ghn-parcel';

describe('GHN catalog dimensions constrain estimated outer parcel', () => {
  it.each(['20.5x14x1.1cm', '20 x 13 x 1,7 cm', '21×14cm', null, 'khổ A5'])(
    'accepts fitting or incomplete catalog measurement %s',
    (packageSize) => {
      expect(() =>
        ensureCatalogFitsParcel([28, 20, 5], [{ quantity: 1, packageSize }]),
      ).not.toThrow();
    },
  );
  it.each(['60x40x10cm', '30x21cm', '20x14x0cm'])(
    'rejects measured oversized/invalid book %s without underdeclaring',
    (packageSize) => {
      expect(() =>
        ensureCatalogFitsParcel([28, 20, 5], [{ quantity: 1, packageSize }]),
      ).toThrow();
    },
  );
  it('rejects a measured stack that cannot fit the selected package', () => {
    expect(() =>
      ensureCatalogFitsParcel(
        [28, 20, 5],
        [{ quantity: 3, packageSize: '20x14x1.1cm' }],
      ),
    ).toThrow();
    expect(() =>
      ensureCatalogFitsParcel(
        [28, 22, 12],
        [{ quantity: 3, packageSize: '20x14x1.1cm' }],
      ),
    ).not.toThrow();
  });
});
