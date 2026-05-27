export function parseDuration(value: string, fallbackMs = 15 * 60 * 1000) {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) {
    return fallbackMs;
  }

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof multipliers;

  return amount * multipliers[unit];
}

export function isDevelopment(nodeEnv: string | undefined) {
  return nodeEnv !== 'production';
}

export function getWindowMinutes(value: number | undefined, fallback = 1) {
  return value ?? fallback;
}

export function getWindowMs(windowMinutes: number) {
  return windowMinutes * 60 * 1000;
}

export function getWindowStart(windowMinutes: number) {
  return new Date(Date.now() - getWindowMs(windowMinutes));
}

export function getWindowEnd(windowMinutes: number) {
  return new Date(Date.now() + getWindowMs(windowMinutes));
}

export function formatRetryAt(date: Date) {
  return date.toLocaleString('vi-VN', { hour12: false });
}
