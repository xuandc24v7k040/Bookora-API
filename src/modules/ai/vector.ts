import { AI_DIMENSIONS } from './ai.types';

export function isValidVector(vector: readonly number[]): boolean {
  return (
    vector.length === AI_DIMENSIONS &&
    vector.every(Number.isFinite) &&
    Math.abs(Math.hypot(...vector) - 1) <= 0.001
  );
}

export function cosine(
  left: readonly number[],
  right: readonly number[],
): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}
