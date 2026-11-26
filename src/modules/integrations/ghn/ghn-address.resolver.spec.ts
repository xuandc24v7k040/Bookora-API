import { GhnAddressResolver } from './ghn-address.resolver';
import type { GhnClient } from './ghn.client';
import type { GhnMasterRow } from './ghn.types';

const province: GhnMasterRow = {
  _id: 79,
  name: 'Hồ Chí Minh',
  extension_names: ['TP. Hồ Chí Minh'],
  parent_id: 0,
  status: 1,
};
const ward: GhnMasterRow = {
  _id: 7901,
  name: 'Phường Sài Gòn',
  extension_names: ['Sài Gòn'],
  parent_id: 79,
  status: 1,
};
const address = {
  address: ' QA street ',
  province: ' Thành phố Hồ Chí Minh ',
  ward: 'Phường Sài Gòn',
};
function setup(wards: GhnMasterRow[] = [ward]) {
  const masterData = jest
    .fn()
    .mockImplementation((id?: number) =>
      Promise.resolve(id === undefined ? [province] : wards),
    );
  const settings = () => ({ enabled: true, valid: true, scope: 'qa' });
  const resolver = new GhnAddressResolver({
    masterData,
    settings,
  } as unknown as GhnClient);
  return { resolver, masterData };
}
describe('GHN two-level name resolution', () => {
  it('uses canonical names and the matched province for ward lookup without coordinates', async () => {
    const { resolver, masterData } = setup();
    await expect(
      resolver.resolve(address, AbortSignal.timeout(1000)),
    ).resolves.toEqual({
      ...address,
      address: 'QA street',
      province: province.name,
      ward: ward.name,
    });
    expect(masterData.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      undefined,
      79,
    ]);
  });
  it('deduplicates concurrent master reads and reuses bounded TTL data', async () => {
    const { resolver, masterData } = setup();
    await Promise.all([
      resolver.resolve(address, AbortSignal.timeout(1000)),
      resolver.resolve(address, AbortSignal.timeout(1000)),
    ]);
    await resolver.resolve(address, AbortSignal.timeout(1000));
    expect(masterData).toHaveBeenCalledTimes(2);
  });
  it('fails closed on ambiguous bare ward aliases', async () => {
    const { resolver } = setup([
      ward,
      { ...ward, _id: 7902, name: 'Xã Sài Gòn' },
    ]);
    await expect(
      resolver.resolve(
        { ...address, ward: 'Sài Gòn' },
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow();
  });
  it('rejects inactive wards, missing structure and diacritic-losing fuzzy names', async () => {
    const { resolver } = setup([{ ...ward, status: 0 }]);
    await expect(
      resolver.resolve(address, AbortSignal.timeout(1000)),
    ).rejects.toThrow();
    const active = setup().resolver;
    for (const input of [
      { ...address, ward: '' },
      { ...address, province: 'Ho Chi Minh' },
      { ...address, ward: 'Sai Gon' },
    ])
      await expect(
        active.resolve(input, AbortSignal.timeout(1000)),
      ).rejects.toThrow();
  });
  it('does not cache provider failures', async () => {
    const { resolver, masterData } = setup();
    masterData.mockRejectedValueOnce(new Error('temporary provider failure'));
    await expect(
      resolver.resolve(address, AbortSignal.timeout(1000)),
    ).rejects.toThrow();
    await expect(
      resolver.resolve(address, AbortSignal.timeout(1000)),
    ).resolves.toMatchObject({ ward: ward.name });
    expect(masterData).toHaveBeenCalledTimes(3);
  });
});
