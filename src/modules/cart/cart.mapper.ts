import { Injectable } from '@nestjs/common';
import type { CartRecord } from './cart.repository';
import { CartItemStatus } from './dto';
import { StorefrontPriceService } from '@/modules/storefront-catalog/storefront-price.service';
import { CartValidationService } from './cart-validation.service';

const MESSAGE: Record<CartItemStatus, string | null> = {
  [CartItemStatus.AVAILABLE]: null,
  [CartItemStatus.PRICE_CHANGED]: 'Giá sản phẩm đã thay đổi.',
  [CartItemStatus.INSUFFICIENT_STOCK]:
    'Số lượng vượt quá tồn kho hiện tại tại chi nhánh này.',
  [CartItemStatus.OUT_OF_STOCK]: 'Sản phẩm hiện đã hết hàng tại chi nhánh này.',
  [CartItemStatus.PRODUCT_INACTIVE]: 'Sản phẩm đã ngừng kinh doanh.',
  [CartItemStatus.VARIANT_INACTIVE]: 'Phiên bản đã chọn không còn khả dụng.',
  [CartItemStatus.BRANCH_INACTIVE]:
    'Chi nhánh đã ngừng hoạt động. Vui lòng chọn chi nhánh khác.',
};

@Injectable()
export class CartMapper {
  constructor(
    private readonly prices: StorefrontPriceService,
    private readonly validation: CartValidationService,
  ) {}

  toResponse(cart: CartRecord) {
    const items = cart.items.map((item) => {
      const price = this.prices.resolve(item.variant);
      const availableQuantity =
        item.variant.stocks.find((stock) => stock.branchId === cart.branchId)
          ?.quantity ?? 0;
      const lastKnownUnitPrice = Number(item.lastKnownUnitPrice);
      const state = this.validation.evaluate({
        branchActive: cart.branch.isActive,
        productStatus: item.variant.product.status,
        variantActive: item.variant.isActive,
        quantity: item.quantity,
        availableQuantity,
        currentUnitPrice: price.current,
        lastKnownUnitPrice,
      });
      const message =
        state.primaryStatus === CartItemStatus.PRICE_CHANGED
          ? `Giá sản phẩm đã thay đổi từ ${lastKnownUnitPrice} thành ${price.current}.`
          : MESSAGE[state.primaryStatus];
      const image =
        item.variant.media[0] ?? item.variant.product.media[0] ?? null;

      return {
        cartItemId: item.id,
        productId: item.variant.product.id,
        productSlug: item.variant.product.slug,
        productName: item.variant.product.name,
        productVariantId: item.variant.id,
        variantLabel: item.variant.name,
        options: item.variant.optionValues.map((link) => ({
          name: link.option.name,
          value: link.optionValue.label,
        })),
        primaryImageUrl: image?.url ?? null,
        quantity: item.quantity,
        availableQuantity,
        currentUnitPrice: price.current,
        previousUnitPrice: lastKnownUnitPrice,
        originalPrice: price.original,
        discount: Math.max(0, price.original - price.current),
        lineSubtotal: price.current * item.quantity,
        ...state,
        isSelectable: state.isCheckoutEligible,
        message,
      };
    });
    const blockingIssues = [
      ...new Set(
        items.flatMap((item) =>
          item.issues.filter((issue) => issue !== CartItemStatus.PRICE_CHANGED),
        ),
      ),
    ];

    return {
      cartId: cart.id,
      branch: {
        id: cart.branch.id,
        code: cart.branch.code,
        name: cart.branch.name,
        address: cart.branch.address,
        province: cart.branch.province,
        ward: cart.branch.ward,
        isActive: cart.branch.isActive,
      },
      items,
      itemCount: items.length,
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotalAllEligible: items
        .filter((item) => item.isCheckoutEligible)
        .reduce((sum, item) => sum + item.lineSubtotal, 0),
      hasBlockingIssues: blockingIssues.length > 0,
      blockingIssues,
      updatedAt: cart.updatedAt.toISOString(),
    };
  }
}
