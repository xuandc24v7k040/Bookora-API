export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/gu, ' ').toLowerCase();
}
