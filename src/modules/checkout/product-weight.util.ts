export const INVALID_PRODUCT_WEIGHT_MESSAGE =
  'Một số sản phẩm chưa có thông tin trọng lượng. Vui lòng thử lại sau.';

export class ProductWeightCalculationError extends Error {
  constructor() {
    super(INVALID_PRODUCT_WEIGHT_MESSAGE);
    this.name = 'ProductWeightCalculationError';
  }
}

export function calculateTotalProductWeightGram(
  items: ReadonlyArray<{ weightGram: number; quantity: number }>,
): number {
  return items.reduce((total, item) => {
    if (
      !Number.isSafeInteger(item.weightGram) ||
      item.weightGram <= 0 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new ProductWeightCalculationError();
    }

    const lineWeight = item.weightGram * item.quantity;
    const nextTotal = total + lineWeight;
    if (!Number.isSafeInteger(lineWeight) || !Number.isSafeInteger(nextTotal)) {
      throw new ProductWeightCalculationError();
    }
    return nextTotal;
  }, 0);
}
