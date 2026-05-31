type EnvSource = Record<string, unknown>;

export function getEnvString(
  key: string,
  fallback = '',
  source: EnvSource = process.env,
): string {
  return readEnvValue(source, key) ?? fallback;
}

export function getEnvNumber(
  key: string,
  fallback: number,
  source: EnvSource = process.env,
): number {
  return getEnvNumberFromKeys([key], fallback, source);
}

export function getEnvNumberFromKeys(
  keys: readonly string[],
  fallback: number,
  source: EnvSource = process.env,
): number {
  for (const key of keys) {
    const value = readEnvValue(source, key);

    if (value !== undefined) {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : fallback;
    }
  }

  return fallback;
}

export function getEnvBoolean(
  key: string,
  fallback: boolean,
  source: EnvSource = process.env,
): boolean {
  const value = readEnvValue(source, key);

  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
}

export function isEnvValuePresent(source: EnvSource, key: string): boolean {
  return readEnvValue(source, key) !== undefined;
}

export function readEnvValue(
  source: EnvSource,
  key: string,
): string | undefined {
  const value = source[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return undefined;
  }

  const stringValue = `${value}`.trim();
  return stringValue === '' ? undefined : stringValue;
}
