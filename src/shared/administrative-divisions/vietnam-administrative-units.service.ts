import { Injectable, ServiceUnavailableException } from '@nestjs/common';

interface ProvinceSource {
  code: number;
  name: string;
}

interface WardSource extends ProvinceSource {
  province_code: number;
}

const BASE_URL = 'https://provinces.open-api.vn/api/v2';
const CACHE_MS = 24 * 60 * 60 * 1_000;
const TIMEOUT_MS = 8_000;

@Injectable()
export class VietnamAdministrativeUnitsService {
  private provincesCache: {
    expiresAt: number;
    items: ProvinceSource[];
  } | null = null;
  private readonly wardsCache = new Map<
    number,
    { expiresAt: number; items: WardSource[] }
  >();

  async resolve(provinceCode: number, wardCode: number) {
    const [province, wards] = await Promise.all([
      this.findProvince(provinceCode),
      this.listWards(provinceCode),
    ]);
    const ward = wards.find((item) => item.code === wardCode) ?? null;
    return { province, ward };
  }

  private async findProvince(code: number) {
    const provinces = await this.listProvinces();
    return provinces.find((item) => item.code === code) ?? null;
  }

  private async listProvinces(): Promise<ProvinceSource[]> {
    if (this.provincesCache && this.provincesCache.expiresAt > Date.now()) {
      return this.provincesCache.items;
    }
    const items = this.parseProvinces(await this.request('/p/'));
    this.provincesCache = { items, expiresAt: Date.now() + CACHE_MS };
    return items;
  }

  private async listWards(provinceCode: number): Promise<WardSource[]> {
    const cached = this.wardsCache.get(provinceCode);
    if (cached && cached.expiresAt > Date.now()) return cached.items;
    const params = new URLSearchParams({ province: String(provinceCode) });
    const items = this.parseWards(await this.request(`/w/?${params}`));
    this.wardsCache.set(provinceCode, {
      items,
      expiresAt: Date.now() + CACHE_MS,
    });
    return items;
  }

  private async request(path: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch {
      throw new ServiceUnavailableException({
        code: 'ADMINISTRATIVE_UNITS_UNAVAILABLE',
        message: 'Không thể kiểm tra dữ liệu Tỉnh/Thành phố và Phường/Xã',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseProvinces(value: unknown): ProvinceSource[] {
    if (!Array.isArray(value)) return this.invalidResponse();
    const items = value.filter(this.isProvinceSource);
    if (items.length !== value.length) return this.invalidResponse();
    return items;
  }

  private parseWards(value: unknown): WardSource[] {
    if (!Array.isArray(value)) return this.invalidResponse();
    const items = value.filter(this.isWardSource);
    if (items.length !== value.length) return this.invalidResponse();
    return items;
  }

  private readonly isProvinceSource = (
    value: unknown,
  ): value is ProvinceSource =>
    typeof value === 'object' &&
    value !== null &&
    Number.isInteger((value as ProvinceSource).code) &&
    typeof (value as ProvinceSource).name === 'string';

  private readonly isWardSource = (value: unknown): value is WardSource =>
    this.isProvinceSource(value) &&
    Number.isInteger((value as WardSource).province_code);

  private invalidResponse(): never {
    throw new ServiceUnavailableException({
      code: 'ADMINISTRATIVE_UNITS_INVALID_RESPONSE',
      message: 'Dữ liệu địa giới hành chính không hợp lệ',
    });
  }
}
