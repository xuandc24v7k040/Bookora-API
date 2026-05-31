export function getEnvString(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export function getEnvNumber(key: string, fallback: number): number {
  return getEnvNumberFromKeys([key], fallback);
}

export function getEnvNumberFromKeys(
  keys: readonly string[],
  fallback: number,
): number {
  for (const key of keys) {
    const value = process.env[key];

    if (value !== undefined && value !== '') {
      return Number(value);
    }
  }

  return fallback;
}

export function getEnvBoolean(key: string, fallback: boolean): boolean {
  const value = process.env[key];

  if (value === undefined || value === '') {
    return fallback;
  }

  return value === 'true';
}
