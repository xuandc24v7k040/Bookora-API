import { Injectable } from '@nestjs/common';
import { GhnClient } from './ghn.client';
import { GhnQuoteError } from './ghn.error';
import type { GhnAddress, GhnMasterRow } from './ghn.types';

interface MasterEntry {
  rows: GhnMasterRow[];
  expiresAt: number;
}
/** Administrative names only; neither customer addresses nor coordinates are cached here. */
@Injectable()
export class GhnAddressResolver {
  private readonly cache = new Map<string, MasterEntry>();
  private readonly flights = new Map<string, Promise<GhnMasterRow[]>>();
  constructor(private readonly client: GhnClient) {}

  async resolve(address: GhnAddress, signal: AbortSignal): Promise<GhnAddress> {
    if (
      !address.address?.trim() ||
      !address.province?.trim() ||
      !address.ward?.trim()
    )
      throw new GhnQuoteError('GHN_ADDRESS_UNRESOLVED');
    const province = this.match(
      await this.rows(undefined, signal),
      address.province,
      'province',
    );
    const ward = this.match(
      await this.rows(province._id, signal),
      address.ward,
      'ward',
    );
    return {
      address: address.address.trim(),
      province: province.name,
      ward: ward.name,
    };
  }

  private normalize(value: string, kind: 'province' | 'ward'): string {
    const normalized = value
      .normalize('NFC')
      .toLocaleLowerCase('vi-VN')
      .trim()
      .replace(/\s+/g, ' ');
    // Preserve diacritics and ward type. A bare ward name is accepted only when unique in its parent.
    return kind === 'province'
      ? normalized.replace(/^(?:tỉnh|thành phố|tp\.?)\s+/, '')
      : normalized;
  }

  private match(
    rows: GhnMasterRow[],
    value: string,
    kind: 'province' | 'ward',
  ): GhnMasterRow {
    const name = this.normalize(value, kind);
    const aliases = (row: GhnMasterRow) =>
      [row.name, ...row.extension_names].map((alias) =>
        this.normalize(alias, kind),
      );
    const active = rows.filter((row) => row.status === 1);
    const exact = active.filter(
      (row) => this.normalize(row.name, kind) === name,
    );
    if (exact.length === 1) return exact[0];
    const matches = active.filter((row) =>
      aliases(row).some(
        (alias) =>
          alias === name ||
          (kind === 'ward' &&
            !/^(phường|xã|đặc khu)\s/.test(name) &&
            alias.replace(/^(phường|xã|đặc khu)\s+/, '') === name),
      ),
    );
    if (matches.length !== 1) throw new GhnQuoteError('GHN_ADDRESS_UNRESOLVED');
    return matches[0];
  }

  private async rows(
    provinceId: number | undefined,
    signal: AbortSignal,
  ): Promise<GhnMasterRow[]> {
    const settings = this.client.settings();
    if (!settings.enabled || !settings.valid)
      throw new GhnQuoteError('GHN_UNAVAILABLE');
    const key = `${settings.scope}:${provinceId ?? 'provinces'}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;
    const pending = this.flights.get(key);
    if (pending) return pending;
    const flight = this.client
      .masterData(provinceId, signal)
      .then((rows) => {
        if (this.cache.size >= 64)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { rows, expiresAt: Date.now() + 86400000 });
        return rows;
      })
      .finally(() => this.flights.delete(key));
    this.flights.set(key, flight);
    return flight;
  }
}
