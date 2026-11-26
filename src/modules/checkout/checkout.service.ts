import { enqueueOrderNotification } from '@/modules/notifications/notification-intents';
import { signalOrderChange } from '@/modules/orders/order-change-signal';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlashSaleOffersService } from '@/modules/flash-sales/flash-sale-offers.service';
import {
  CouponsService,
  type ResolvedCoupon,
} from '@/modules/coupons/coupons.service';
import {
  allocateCouponDiscount,
  couponRuleVersion,
} from '@/modules/coupons/coupon-pricing';
import type { CheckoutCouponDto } from '@/modules/coupons/coupons.dto';
import { createHash } from 'crypto';
import { ulid } from 'ulid';
import {
  DeliveryAddressSource,
  InventoryMovementSourceType,
  InventoryMovementType,
  OrderStatus,
  OrderStatusActorType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionStatus,
  Prisma,
  UserType,
  type MembershipTier,
} from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { CartItemStatus } from '@/modules/cart/dto';
import { CartValidationService } from '@/modules/cart/cart-validation.service';
import type {
  VietMapLocationResponseDto,
  VietMapReverseQueryDto,
} from '@/modules/integrations/vietmap/dto/vietmap.dto';
import { VietMapService } from '@/modules/integrations/vietmap/vietmap.service';
import { VnpayService } from '@/modules/integrations/vnpay/vnpay.service';
import type {
  ShippingDestinationType,
  ShippingPricingQuote,
} from '@/modules/shipping/policies/shipping-policy.types';
import { ShippingPricingService } from '@/modules/shipping/shipping-pricing.service';
import { StorefrontPriceService } from '@/modules/storefront-catalog/storefront-price.service';
import { recordInventoryMovement } from '@/modules/inventory/inventory-movement';
import {
  CheckoutRepository,
  type CheckoutCartRecord,
} from './checkout.repository';
import { CheckoutLocationProofService } from './checkout-location-proof.service';
import { ShippingProvider } from '@/modules/shipping/shipping-provider';
import { GhnQuoteService } from '@/modules/integrations/ghn/ghn-quote.service';
import { GhnQuoteError } from '@/modules/integrations/ghn/ghn.error';
import type { GhnQuote } from '@/modules/integrations/ghn/ghn.types';
import type { GhnShippingOptionDto } from './dto/ghn-quote.dto';
import { toGhnShippingQuoteDto } from './dto/ghn-quote.dto';
import { checkoutAmounts } from './checkout-amounts';
import {
  calculateTotalProductWeightGram,
  INVALID_PRODUCT_WEIGHT_MESSAGE,
  ProductWeightCalculationError,
} from './product-weight.util';
import type {
  CheckoutPreviewResponseDto,
  CurrentLocationAddressDto,
  CurrentLocationResolveDto,
  PlaceOrderDto,
  PreviewCheckoutDto,
  SavedAddressInputDto,
} from './dto';

interface ResolvedCheckoutItem {
  catalogEffectivePrice: number;
  flashSaleItemId: string | null;
  regularPrice: boolean;
  id: string;
  cartItemId: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
  variantOptions: Array<{ name: string; value: string }>;
  imageUrl: string | null;
  sku: string | null;
  weightGram: number;
  quantity: number;
  availableQuantity: number;
  unitPrice: number;
  originalPrice: number;
  discountAmount: number;
  lineTotal: number;
  couponDiscountAmount: number;
  isCheckoutEligible: boolean;
  issues: CartItemStatus[];
}

interface ResolvedCheckoutAddress {
  source: DeliveryAddressSource;
  sourceCustomerAddressId: string | null;
  receiverName: string;
  receiverPhone: string;
  formattedAddress: string;
  addressLine: string;
  provinceCode: number;
  provinceName: string;
  wardName: string;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyMeters: number | null;
  locationProvider: string | null;
  locationPlaceId: string | null;
  destinationType: ShippingDestinationType;
}

interface CheckoutState {
  shippingProvider: ShippingProvider;
  shippingFee: number | null;
  ghnQuote: GhnQuote | null;
  membershipTier: MembershipTier;
  cart: CheckoutCartRecord;
  items: ResolvedCheckoutItem[];
  eligibleItems: ResolvedCheckoutItem[];
  address: ResolvedCheckoutAddress | null;
  quote: ShippingPricingQuote | null;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  subtotalAmount: number;
  discountAmount: number;
  totalProductWeightGram: number;
  totalAmount: number;
  previewReference: string;
  blockingIssues: string[];
  coupons: ResolvedCoupon[];
  availableCoupons: CheckoutCouponDto[];
  orderCouponDiscountAmount: number;
  shippingCouponDiscountAmount: number;
}

const ISSUE_CODE: Record<CartItemStatus, string> = {
  [CartItemStatus.AVAILABLE]: 'AVAILABLE',
  [CartItemStatus.PRICE_CHANGED]: 'PRICE_CHANGED',
  [CartItemStatus.BRANCH_INACTIVE]: 'CHECKOUT_BRANCH_INACTIVE',
  [CartItemStatus.PRODUCT_INACTIVE]: 'CHECKOUT_PRODUCT_INACTIVE',
  [CartItemStatus.VARIANT_INACTIVE]: 'CHECKOUT_VARIANT_INACTIVE',
  [CartItemStatus.OUT_OF_STOCK]: 'CHECKOUT_OUT_OF_STOCK',
  [CartItemStatus.INSUFFICIENT_STOCK]: 'CHECKOUT_INSUFFICIENT_STOCK',
};

const ITEM_REASON_MESSAGE: Record<CartItemStatus, string> = {
  [CartItemStatus.AVAILABLE]: '',
  [CartItemStatus.PRICE_CHANGED]:
    'Giá sản phẩm đã thay đổi và đơn hàng đã được cập nhật.',
  [CartItemStatus.BRANCH_INACTIVE]: 'Chi nhánh hiện không nhận đơn hàng.',
  [CartItemStatus.PRODUCT_INACTIVE]: 'Sản phẩm hiện không còn được kinh doanh.',
  [CartItemStatus.VARIANT_INACTIVE]:
    'Phiên bản sản phẩm hiện không còn khả dụng.',
  [CartItemStatus.OUT_OF_STOCK]: 'Sản phẩm đã hết hàng tại chi nhánh này.',
  [CartItemStatus.INSUFFICIENT_STOCK]:
    'Số lượng tồn kho không đủ. Vui lòng giảm số lượng.',
};

function assertVnpayCheckoutAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new UnprocessableEntityException({
      code: 'VNPAY_INVALID_AMOUNT',
      message:
        'VNPAY yêu cầu số tiền thanh toán lớn hơn 0đ. Vui lòng chọn phương thức thanh toán khác hoặc điều chỉnh voucher.',
    });
  }
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly repository: CheckoutRepository,
    private readonly prices: StorefrontPriceService,
    private readonly validation: CartValidationService,
    private readonly shippingPricing: ShippingPricingService,
    private readonly locationProof: CheckoutLocationProofService,
    private readonly vietmap: VietMapService,
    private readonly vnpay: VnpayService,
    private readonly config: ConfigService,
    private readonly coupons: CouponsService,
    private readonly flashSales: FlashSaleOffersService,
    @Optional() private readonly ghn?: GhnQuoteService,
  ) {}

  async preview(
    actor: AuthenticatedUser,
    branchId: string | undefined,
    dto: PreviewCheckoutDto,
  ): Promise<CheckoutPreviewResponseDto> {
    this.assertCustomer(actor);
    const state = await this.resolveCheckout(actor.id, branchId, dto);
    return this.toResponse(state);
  }

  async resolveCurrentLocation(
    actor: AuthenticatedUser,
    dto: CurrentLocationResolveDto,
  ) {
    this.assertCustomer(actor);
    const location = await this.vietmap.reverse({
      latitude: dto.latitude,
      longitude: dto.longitude,
    });
    return {
      ...this.currentLocationResponse(location),
      accuracyMeters: dto.accuracyMeters ?? null,
    };
  }

  async ghnShippingOption(
    actor: AuthenticatedUser,
    branchId: string | undefined,
    dto: PreviewCheckoutDto,
  ): Promise<GhnShippingOptionDto> {
    this.assertCustomer(actor);
    if (!this.ghn?.enabled)
      return {
        enabled: false,
        quote: null,
        unavailableCode: null,
        message: null,
      };
    try {
      const state = await this.resolveCheckout(actor.id, branchId, {
        ...dto,
        shippingProvider: ShippingProvider.GHN,
      });
      return {
        enabled: true,
        quote: toGhnShippingQuoteDto(state.ghnQuote),
        unavailableCode: null,
        message: null,
      };
    } catch (error: unknown) {
      if (!(error instanceof GhnQuoteError)) throw error;
      const response = error.getResponse() as { message: string };
      return {
        enabled: true,
        quote: null,
        unavailableCode: error.errorCode,
        message: response.message,
      };
    }
  }

  async reverseCurrentLocation(
    actor: AuthenticatedUser,
    query: VietMapReverseQueryDto,
  ) {
    this.assertCustomer(actor);
    const location = await this.vietmap.reverse(query);
    this.ensureCurrentHierarchy(location);
    return this.currentLocationResponse(location);
  }

  async placeCod(
    actor: AuthenticatedUser,
    branchId: string | undefined,
    dto: PlaceOrderDto,
  ) {
    this.assertCustomer(actor);
    const existing = await this.findIdempotentOrder(
      actor.id,
      dto.idempotencyKey,
    );
    if (existing) return this.orderResult(existing);

    const state = await this.resolveCheckout(actor.id, branchId, {
      ...dto,
      paymentMethod: PaymentMethod.COD,
    });
    this.ensureReadyForOrder(
      state,
      dto.previewReference,
      dto.shippingQuoteReference,
    );

    const order = await this.repository.transaction(async (tx) => {
      const idempotent = await tx.order.findFirst({
        where: { userId: actor.id, idempotencyKey: dto.idempotencyKey },
        include: { payment: true },
      });
      if (idempotent) return idempotent;
      const now = new Date();
      const orderId = ulid();
      const orderCode = `BK-${ulid()}`;
      await this.flashSales.revalidate(tx, actor.id, state.eligibleItems);
      await this.revalidateCouponCheckout(tx, state);
      await this.deductStock(tx, state, {
        sourceId: orderId,
        sourceCode: orderCode,
        actorId: actor.id,
        reason: 'Đặt đơn hàng COD',
      });
      const created = await tx.order.create({
        data: {
          id: orderId,
          ...this.orderData(
            actor.id,
            state,
            dto.idempotencyKey,
            OrderStatus.PENDING,
            orderCode,
          ),
          stockDeductedAt: now,
          items: {
            create: state.eligibleItems.map((item) => this.orderItemData(item)),
          },
          statusHistories: {
            create: {
              fromStatus: null,
              toStatus: OrderStatus.PENDING,
              actorType: OrderStatusActorType.CUSTOMER,
              actorUserId: actor.id,
              actorDisplayNameSnapshot: actor.fullName,
              actorRoleSnapshot: 'CUSTOMER',
              branchId: state.cart.branchId,
              note: 'Khách hàng đặt đơn COD',
              createdAt: now,
            },
          },
          payment: {
            create: {
              method: PaymentMethod.COD,
              status: PaymentStatus.UNPAID,
              amount: state.totalAmount,
            },
          },
        },
        include: { payment: true },
      });
      await this.clearSelectedCartItems(tx, state.cart.id, state.eligibleItems);
      await enqueueOrderNotification(tx, {
        eventKey: `COD:${created.id}`,
        kind: 'ORDER_NEW_COD',
        orderId: created.id,
        branchId: created.branchId,
        actorUserId: actor.id,
      });
      await this.flashSales.allocate(tx, created.id, actor.id, null);
      await this.coupons.redeem(
        tx,
        created.id,
        {
          userId: actor.id,
          subtotal: state.subtotalAmount,
          shippingFee: state.shippingFee!,
        },
        state.coupons,
        null,
      );
      await signalOrderChange(tx, created.id);
      return created;
    });
    return this.orderResult(order);
  }

  async placeVnpay(
    actor: AuthenticatedUser,
    branchId: string | undefined,
    dto: PlaceOrderDto,
    ipAddress: string,
  ) {
    this.assertCustomer(actor);
    const existing = await this.findIdempotentOrder(
      actor.id,
      dto.idempotencyKey,
    );
    if (existing?.payment?.transactions[0]) {
      return this.vnpayOrderResult(
        existing,
        existing.payment.transactions[0],
        ipAddress,
      ).response;
    }

    const state = await this.resolveCheckout(actor.id, branchId, {
      ...dto,
      paymentMethod: PaymentMethod.VNPAY,
    });
    this.ensureReadyForOrder(
      state,
      dto.previewReference,
      dto.shippingQuoteReference,
    );
    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() +
        this.config.getOrThrow<number>('payment.vnpay.expireMinutes') * 60_000,
    );

    const order = await this.repository.transaction(async (tx) => {
      const idempotent = await tx.order.findFirst({
        where: { userId: actor.id, idempotencyKey: dto.idempotencyKey },
        include: {
          payment: {
            include: { transactions: { orderBy: { createdAt: 'asc' } } },
          },
        },
      });
      if (idempotent) return idempotent;
      const orderId = ulid();
      const orderCode = `BK-${ulid()}`;
      const transactionId = ulid();
      await this.flashSales.revalidate(tx, actor.id, state.eligibleItems);
      await this.revalidateCouponCheckout(tx, state);
      if (!Number.isSafeInteger(state.totalAmount) || state.totalAmount <= 0) {
        const latestCoupons = await this.coupons.resolve(
          {
            userId: actor.id,
            subtotal: state.subtotalAmount,
            shippingFee: state.shippingFee!,
          },
          dto,
          tx,
        );
        if (
          latestCoupons.length !== state.coupons.length ||
          latestCoupons.some(
            ({ coupon, discountAmount }, index) =>
              couponRuleVersion(coupon) !==
                couponRuleVersion(state.coupons[index].coupon) ||
              discountAmount !== state.coupons[index].discountAmount,
          )
        ) {
          throw new ConflictException({
            code: 'CHECKOUT_PREVIEW_CHANGED',
            message: 'Ưu đãi đã thay đổi. Vui lòng xác nhận lại đơn hàng.',
          });
        }
        assertVnpayCheckoutAmount(state.totalAmount);
      }
      await this.deductStock(tx, state, {
        sourceId: transactionId,
        sourceCode: orderCode,
        actorId: actor.id,
        reason: 'Đặt đơn hàng thanh toán VNPAY',
      });
      const created = await tx.order.create({
        data: {
          id: orderId,
          ...this.orderData(
            actor.id,
            state,
            dto.idempotencyKey,
            OrderStatus.PENDING_PAYMENT,
            orderCode,
          ),
          items: {
            create: state.eligibleItems.map((item) => this.orderItemData(item)),
          },
          statusHistories: {
            create: {
              fromStatus: null,
              toStatus: OrderStatus.PENDING_PAYMENT,
              actorType: OrderStatusActorType.CUSTOMER,
              actorUserId: actor.id,
              actorDisplayNameSnapshot: actor.fullName,
              actorRoleSnapshot: 'CUSTOMER',
              branchId: state.cart.branchId,
              note: 'Khách hàng đặt đơn thanh toán VNPAY',
              createdAt,
            },
          },
          payment: {
            create: {
              method: PaymentMethod.VNPAY,
              status: PaymentStatus.PENDING,
              amount: state.totalAmount,
              transactions: {
                create: {
                  id: transactionId,
                  provider: PaymentProvider.VNPAY,
                  status: PaymentTransactionStatus.PENDING,
                  amount: state.totalAmount,
                  idempotencyKey: dto.idempotencyKey,
                  merchantTxnRef: `BK${ulid()}`,
                  expiresAt,
                  stockReservedAt: createdAt,
                },
              },
            },
          },
        },
        include: {
          payment: {
            include: { transactions: { orderBy: { createdAt: 'asc' } } },
          },
        },
      });
      // Four payment windows form the fixed order retry deadline. Retry never extends it.
      const couponExpiresAt = new Date(
        createdAt.getTime() +
          this.config.getOrThrow<number>('payment.vnpay.expireMinutes') *
            4 *
            60_000,
      );
      await this.flashSales.allocate(tx, created.id, actor.id, couponExpiresAt);
      await this.coupons.redeem(
        tx,
        created.id,
        {
          userId: actor.id,
          subtotal: state.subtotalAmount,
          shippingFee: state.shippingFee!,
        },
        state.coupons,
        couponExpiresAt,
      );
      await signalOrderChange(tx, created.id);
      return created;
    });
    const transaction = order.payment!.transactions[0];
    const result = this.vnpayOrderResult(order, transaction, ipAddress);
    await this.repository.client.paymentTransaction.update({
      where: { id: transaction.id },
      data: { requestPayloadSanitized: result.sanitizedRequest },
    });
    return result.response;
  }

  private async resolveCheckout(
    userId: string,
    branchId: string | undefined,
    dto: PreviewCheckoutDto,
  ): Promise<CheckoutState> {
    if (!branchId) {
      throw new BadRequestException({
        code: 'BRANCH_CONTEXT_REQUIRED',
        message: 'Vui lòng chọn chi nhánh.',
      });
    }
    if (dto.selectedCartItemIds.length === 0) {
      throw new BadRequestException({
        code: 'CHECKOUT_ITEMS_REQUIRED',
        message: 'Vui lòng chọn ít nhất một sản phẩm để thanh toán.',
      });
    }
    const cart = await this.repository.findCart(userId);
    if (!cart) {
      throw new BadRequestException({
        code: 'CHECKOUT_ITEMS_REQUIRED',
        message: 'Giỏ hàng đang trống.',
      });
    }
    if (cart.branchId !== branchId) {
      throw new ConflictException({
        code: 'CHECKOUT_BRANCH_MISMATCH',
        message: 'Chi nhánh của giỏ hàng không khớp chi nhánh đang chọn.',
        details: {
          requestBranchId: branchId,
          cartBranchId: cart.branchId,
        },
      });
    }

    const selectedIds = [...new Set(dto.selectedCartItemIds)];
    const selectedSet = new Set(selectedIds);
    const found = cart.items.filter((item) => selectedSet.has(item.id));
    if (found.length !== selectedIds.length) {
      const foundIds = new Set(found.map((item) => item.id));
      throw new NotFoundException({
        code: 'CHECKOUT_CART_ITEM_NOT_FOUND',
        message:
          'Một CartItem đã chọn không tồn tại hoặc không thuộc giỏ hàng của bạn.',
        details: {
          missingCartItemIds: selectedIds.filter((id) => !foundIds.has(id)),
        },
      });
    }

    const items = await Promise.all(
      found.map(async (item): Promise<ResolvedCheckoutItem> => {
        const availableQuantity =
          item.variant.stocks.find((stock) => stock.branchId === cart.branchId)
            ?.quantity ?? 0;
        const price = this.prices.resolve(item.variant);
        const regularPrice =
          dto.regularPriceCartItemIds?.includes(item.id) ?? false;
        const offer = regularPrice
          ? null
          : await this.flashSales.resolve(item.variant, userId);
        if (offer)
          this.flashSales.assertQuantity(offer, item.quantity, item.id);
        const unitPrice = offer?.flashPrice ?? price.current;
        const result = this.validation.evaluate({
          branchActive: cart.branch.isActive,
          productStatus: item.variant.product.status,
          variantActive: item.variant.isActive,
          quantity: item.quantity,
          availableQuantity,
          currentUnitPrice: unitPrice,
          lastKnownUnitPrice: Number(item.lastKnownUnitPrice),
        });
        return {
          id: item.id,
          cartItemId: item.id,
          variantId: item.variantId,
          productId: item.variant.productId,
          productName: item.variant.product.name,
          productSlug: item.variant.product.slug,
          variantLabel: item.variant.name,
          variantOptions: item.variant.optionValues.map((link) => ({
            name: link.option.name,
            value: link.optionValue.label,
          })),
          imageUrl:
            item.variant.media[0]?.url ??
            item.variant.product.media[0]?.url ??
            null,
          sku: item.variant.sku,
          weightGram: item.variant.weightGram,
          quantity: item.quantity,
          availableQuantity,
          unitPrice,
          catalogEffectivePrice: price.current,
          flashSaleItemId: offer?.itemId ?? null,
          regularPrice,
          originalPrice: price.original,
          discountAmount: (price.original - unitPrice) * item.quantity,
          lineTotal: unitPrice * item.quantity,
          couponDiscountAmount: 0,
          isCheckoutEligible: result.isCheckoutEligible,
          issues: result.issues,
        };
      }),
    );
    const eligibleItems = items.filter((item) => item.isCheckoutEligible);
    if (eligibleItems.length === 0) {
      const issue =
        items
          .flatMap((item) => item.issues)
          .find((item) => {
            return item !== CartItemStatus.PRICE_CHANGED;
          }) ?? CartItemStatus.OUT_OF_STOCK;
      throw new ConflictException({
        code: ISSUE_CODE[issue],
        message: 'Sản phẩm đã chọn không còn đủ điều kiện thanh toán.',
        details: {
          items: items.map((item) => ({
            cartItemId: item.cartItemId,
            issues: item.issues.map((itemIssue) => ISSUE_CODE[itemIssue]),
          })),
        },
      });
    }

    const subtotalAmount = eligibleItems.reduce(
      (sum, item) => sum + item.lineTotal,
      0,
    );
    const discountAmount = eligibleItems.reduce(
      (sum, item) => sum + item.discountAmount,
      0,
    );
    let totalProductWeightGram: number;
    try {
      totalProductWeightGram = calculateTotalProductWeightGram(eligibleItems);
    } catch (error) {
      if (!(error instanceof ProductWeightCalculationError)) throw error;
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_PRODUCT_WEIGHT_INVALID',
        message: INVALID_PRODUCT_WEIGHT_MESSAGE,
      });
    }
    const totalItemQuantity = eligibleItems.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    const paymentMethod = dto.paymentMethod ?? null;
    const address = dto.address
      ? await this.resolveAddress(userId, dto.address)
      : null;
    const quote =
      address && paymentMethod
        ? this.shippingPricing.calculate({
            originProvinceCode: this.shippingPricing.resolveProvinceCode(
              cart.branch.province,
            ),
            destinationProvinceCode: address.provinceCode,
            destinationType: address.destinationType,
            totalItemQuantity,
            productWeightGram: totalProductWeightGram,
          })
        : null;
    const shippingProvider = dto.shippingProvider ?? ShippingProvider.INTERNAL;
    let ghnQuote: GhnQuote | null = null;
    if (
      shippingProvider === ShippingProvider.GHN &&
      address &&
      paymentMethod &&
      quote
    ) {
      if (!this.ghn) throw new GhnQuoteError('GHN_UNAVAILABLE');
      const seedCoupons = await this.coupons.resolve(
        { userId, subtotal: subtotalAmount, shippingFee: quote.shippingFee },
        dto,
      );
      const netMerchandise =
        subtotalAmount -
        checkoutAmounts(subtotalAmount, quote.shippingFee, seedCoupons)
          .orderCouponDiscountAmount;
      ghnQuote = await this.ghn.quote(
        {
          userId,
          cartId: cart.id,
          branchId: cart.branchId,
          origin: {
            address: cart.branch.address,
            province: cart.branch.province ?? '',
            ward: cart.branch.ward ?? '',
          },
          destination: {
            address: address.addressLine,
            province: address.provinceName,
            ward: address.wardName,
          },
          receiverName: address.receiverName,
          receiverPhone: address.receiverPhone,
          items: eligibleItems.map(
            ({ variantId, quantity, unitPrice, weightGram }) => ({
              variantId,
              quantity,
              unitPrice,
              weightGram,
              packageSize: cart.items.find(
                (item) => item.variantId === variantId,
              )?.variant.packageSize,
            }),
          ),
          subtotal: subtotalAmount,
          paymentMethod,
          packaging: {
            packagingType: quote.packagingType,
            grossWeightGram: quote.grossWeightGram,
          },
        },
        async (fee) =>
          checkoutAmounts(
            subtotalAmount,
            fee,
            await this.coupons.resolve(
              { userId, subtotal: subtotalAmount, shippingFee: fee },
              dto,
            ),
          ).totalAmount,
        netMerchandise,
        dto.shippingQuoteReference,
      );
    }
    const shippingFee =
      shippingProvider === ShippingProvider.GHN
        ? (ghnQuote?.shippingFee ?? null)
        : (quote?.shippingFee ?? null);
    const couponContext = {
      userId,
      subtotal: subtotalAmount,
      shippingFee,
    };
    const coupons = await this.coupons.resolve(couponContext, dto);
    const availableCoupons = dto.includeCoupons
      ? await this.coupons.publicList(couponContext, coupons)
      : [];
    const {
      orderCouponDiscountAmount,
      shippingCouponDiscountAmount,
      totalAmount,
    } = checkoutAmounts(subtotalAmount, shippingFee, coupons);
    const allocations = allocateCouponDiscount(
      eligibleItems,
      orderCouponDiscountAmount,
    );
    for (const item of eligibleItems)
      item.couponDiscountAmount = allocations.get(item.id) ?? 0;
    const note = dto.note?.trim() || null;
    const blockingIssues: string[] = [];
    const membership =
      await this.repository.client.customerMembership.findUnique({
        where: { userId },
      });
    const membershipTier = membership?.currentTier ?? 'BRONZE';
    const previewReference = this.createPreviewReference({
      membershipTier,
      branchId,
      items: eligibleItems.map((item) => ({
        cartItemId: item.cartItemId,
        variantId: item.variantId,
        quantity: item.quantity,
        weightGram: item.weightGram,
        unitPrice: item.unitPrice,
        flashSaleItemId: item.flashSaleItemId,
        regularPrice: item.regularPrice,
        originalPrice: item.originalPrice,
        availableQuantity: item.availableQuantity,
      })),
      address,
      paymentMethod,
      shippingFee,
      shippingQuoteReference:
        ghnQuote?.materialFingerprint ?? quote?.requestFingerprint ?? null,
      shippingQuote: ghnQuote
        ? { provider: 'GHN', fingerprint: ghnQuote.materialFingerprint }
        : (quote?.breakdown ?? null),
      totalProductWeightGram,
      coupons: coupons.map(({ coupon, discountAmount }) => ({
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        version: couponRuleVersion(coupon),
        discountAmount,
      })),
    });
    return {
      shippingProvider,
      shippingFee,
      ghnQuote,
      membershipTier,
      cart,
      items,
      eligibleItems,
      address,
      quote,
      paymentMethod,
      note,
      subtotalAmount,
      discountAmount,
      totalProductWeightGram,
      totalAmount,
      previewReference,
      blockingIssues,
      coupons,
      availableCoupons,
      orderCouponDiscountAmount,
      shippingCouponDiscountAmount,
    };
  }

  private async revalidateCouponCheckout(
    tx: Prisma.TransactionClient,
    state: CheckoutState,
  ): Promise<void> {
    const membership = await tx.customerMembership.findUnique({
      where: { userId: state.cart.userId },
    });
    if ((membership?.currentTier ?? 'BRONZE') !== state.membershipTier)
      throw new ConflictException({
        code: 'CHECKOUT_PREVIEW_CHANGED',
        message:
          'Hạng thành viên đã thay đổi. Vui lòng cập nhật và xác nhận lại đơn hàng.',
      });
    if (
      !state.coupons.length &&
      !state.eligibleItems.some((item) => item.flashSaleItemId) &&
      state.shippingProvider !== ShippingProvider.GHN
    )
      return;
    const changed = (): never => {
      throw new ConflictException({
        code: 'CHECKOUT_PREVIEW_CHANGED',
        message:
          'Thông tin đơn hàng đã thay đổi. Vui lòng cập nhật và xác nhận lại voucher.',
      });
    };
    const branch = await tx.branch.findUnique({
      where: { id: state.cart.branchId },
    });
    const cart = await tx.cart.findUnique({ where: { id: state.cart.id } });
    if (
      !branch?.isActive ||
      branch.province !== state.cart.branch.province ||
      branch.address !== state.cart.branch.address ||
      (state.shippingProvider === ShippingProvider.GHN &&
        (branch.ward !== state.cart.branch.ward ||
          !state.ghnQuote ||
          Date.parse(state.ghnQuote.expiresAt) <= Date.now())) ||
      cart?.branchId !== state.cart.branchId
    )
      changed();
    const address = state.address!;
    if (address.sourceCustomerAddressId) {
      const saved = await tx.userAddress.findFirst({
        where: {
          id: address.sourceCustomerAddressId,
          userId: state.cart.userId,
        },
      });
      if (
        !saved ||
        saved.receiverName !== address.receiverName ||
        saved.receiverPhone !== address.receiverPhone ||
        saved.detail !== address.addressLine ||
        saved.provinceCode !== address.provinceCode ||
        saved.province !== address.provinceName ||
        saved.ward !== address.wardName
      )
        changed();
    }
    for (const item of state.eligibleItems) {
      const variant = await tx.productVariant.findUnique({
        where: { id: item.variantId },
        include: { product: { select: { status: true } } },
      });
      const cartItem = await tx.cartItem.findUnique({
        where: { id: item.cartItemId },
      });
      if (
        !variant ||
        !variant.isActive ||
        variant.product.status !== 'ACTIVE' ||
        variant.weightGram !== item.weightGram ||
        (state.ghnQuote !== null &&
          variant.packageSize !==
            state.cart.items.find((entry) => entry.variantId === item.variantId)
              ?.variant.packageSize) ||
        !cartItem ||
        cartItem.quantity !== item.quantity ||
        cartItem.variantId !== item.variantId
      )
        changed();
      const price = this.prices.resolve(variant!);
      if (
        price.current !== item.catalogEffectivePrice ||
        price.original !== item.originalPrice
      )
        changed();
    }
  }

  private async resolveAddress(
    userId: string,
    address: SavedAddressInputDto | CurrentLocationAddressDto,
  ): Promise<ResolvedCheckoutAddress> {
    if (address.source === DeliveryAddressSource.SAVED_ADDRESS) {
      const saved = await this.repository.findOwnedAddress(
        userId,
        address.customerAddressId,
      );
      if (!saved) {
        throw new NotFoundException({
          code: 'CHECKOUT_ADDRESS_NOT_FOUND',
          message:
            'Địa chỉ đã chọn không tồn tại hoặc không thuộc tài khoản của bạn.',
        });
      }
      return {
        source: DeliveryAddressSource.SAVED_ADDRESS,
        sourceCustomerAddressId: saved.id,
        receiverName: saved.receiverName,
        receiverPhone: saved.receiverPhone,
        formattedAddress: [saved.detail, saved.ward, saved.province]
          .filter(Boolean)
          .join(', '),
        addressLine: saved.detail,
        provinceCode: saved.provinceCode,
        provinceName: saved.province,
        wardName: saved.ward,
        latitude: saved.latitude === null ? null : Number(saved.latitude),
        longitude: saved.longitude === null ? null : Number(saved.longitude),
        locationAccuracyMeters: null,
        locationProvider: null,
        locationPlaceId: null,
        destinationType: this.shippingPricing.resolveDestinationType(
          saved.ward,
        ),
      };
    }

    const proof = this.locationProof.verify(address.locationProof);
    if (
      address.provinceCode !== proof.provinceCode ||
      this.shippingPricing.normalizeProvinceName(address.provinceName) !==
        proof.provinceName ||
      this.normalizeAdministrativeName(address.wardName) !== proof.wardName ||
      address.latitude !== proof.latitude ||
      address.longitude !== proof.longitude
    ) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_LOCATION_PROOF_MISMATCH',
        message:
          'Thông tin vị trí không khớp xác nhận. Vui lòng lấy lại vị trí hiện tại.',
      });
    }
    return {
      source: DeliveryAddressSource.CURRENT_LOCATION,
      sourceCustomerAddressId: null,
      receiverName: address.receiverName,
      receiverPhone: address.receiverPhone,
      formattedAddress: [
        address.addressLine,
        address.wardName,
        address.provinceName,
      ].join(', '),
      addressLine: address.addressLine,
      provinceCode: proof.provinceCode,
      provinceName: address.provinceName,
      wardName: address.wardName,
      latitude: address.latitude,
      longitude: address.longitude,
      locationAccuracyMeters: address.locationAccuracyMeters ?? null,
      locationProvider: address.locationProvider ?? 'VIETMAP',
      locationPlaceId: address.locationPlaceId ?? null,
      destinationType: proof.destinationType,
    };
  }

  private ensureReadyForOrder(
    state: CheckoutState,
    previewReference: string,
    shippingQuoteReference?: string,
  ): void {
    if (
      state.shippingProvider === ShippingProvider.GHN &&
      (!shippingQuoteReference || !state.ghnQuote)
    ) {
      throw new GhnQuoteError('SHIPPING_QUOTE_CONTEXT_MISMATCH');
    }
    if (
      !state.address ||
      !state.quote ||
      !state.paymentMethod ||
      state.blockingIssues.length > 0
    ) {
      throw new ConflictException({
        code: 'CHECKOUT_PREVIEW_REQUIRED',
        message: 'Vui lòng xác nhận lại thông tin thanh toán.',
      });
    }
    if (state.previewReference !== previewReference) {
      throw new ConflictException({
        code: 'CHECKOUT_PREVIEW_CHANGED',
        message:
          'Thông tin giá, vận chuyển hoặc voucher đã thay đổi. Vui lòng kiểm tra và xác nhận lại đơn hàng.',
        details: {
          oldPreviewReference: previewReference,
          newPreviewReference: state.previewReference,
          preview: this.toResponse(state),
        },
      });
    }
  }

  private async deductStock(
    tx: Prisma.TransactionClient,
    state: CheckoutState,
    movement: {
      sourceId: string;
      sourceCode: string;
      actorId: string | null;
      reason: string;
    },
  ): Promise<void> {
    for (const item of [...state.eligibleItems].sort((left, right) =>
      left.variantId.localeCompare(right.variantId),
    )) {
      const current = await tx.branchProductStock.findUnique({
        where: {
          branchId_variantId: {
            branchId: state.cart.branchId,
            variantId: item.variantId,
          },
        },
        select: { quantity: true },
      });
      const beforeQuantity = current?.quantity ?? 0;
      if (state.coupons.length && beforeQuantity !== item.availableQuantity) {
        throw new ConflictException({
          code: 'CHECKOUT_PREVIEW_CHANGED',
          message:
            'Tồn kho đã thay đổi. Vui lòng cập nhật và xác nhận lại đơn hàng.',
        });
      }
      const result = await tx.branchProductStock.updateMany({
        where: {
          branchId: state.cart.branchId,
          variantId: item.variantId,
          quantity: { equals: beforeQuantity, gte: item.quantity },
        },
        data: { quantity: { decrement: item.quantity } },
      });
      if (result.count !== 1) {
        throw new ConflictException({
          code: 'ORDER_STOCK_CONFLICT',
          message: 'Không thể đặt hàng do tồn kho vừa thay đổi.',
          details: { cartItemId: item.cartItemId },
        });
      }
      await recordInventoryMovement(tx, {
        branchId: state.cart.branchId,
        variantId: item.variantId,
        type: InventoryMovementType.ORDER_STOCK_DEDUCTED,
        quantityChange: -item.quantity,
        beforeQuantity,
        afterQuantity: beforeQuantity - item.quantity,
        reason: movement.reason,
        sourceType: InventoryMovementSourceType.ORDER,
        sourceId: movement.sourceId,
        sourceCode: movement.sourceCode,
        actorId: movement.actorId,
      });
    }
  }

  private orderData(
    userId: string,
    state: CheckoutState,
    idempotencyKey: string,
    status: OrderStatus,
    orderCode: string,
  ): Prisma.OrderUncheckedCreateWithoutItemsInput {
    const address = state.address!;
    const quote = state.quote!;
    return {
      orderCode,
      userId,
      branchId: state.cart.branchId,
      couponId:
        state.coupons.find(({ coupon }) => coupon.type === 'ORDER')?.coupon
          .id ?? null,
      sourceCustomerAddressId: address.sourceCustomerAddressId,
      idempotencyKey,
      status,
      subtotalAmount: state.subtotalAmount,
      discountAmount: state.discountAmount,
      orderCouponDiscountAmount: state.orderCouponDiscountAmount,
      shippingCouponDiscountAmount: state.shippingCouponDiscountAmount,
      shippingFee: state.shippingFee!,
      estimatedDeliveryAt: state.ghnQuote
        ? new Date(state.ghnQuote.estimatedDeliveryAt)
        : null,
      totalAmount: state.totalAmount,
      deliveryAddressSource: address.source,
      receiverName: address.receiverName,
      receiverPhone: address.receiverPhone,
      shippingAddress: address.formattedAddress,
      shippingAddressLine: address.addressLine,
      shippingProvinceName: address.provinceName,
      shippingWardName: address.wardName,
      shippingLatitude: address.latitude,
      shippingLongitude: address.longitude,
      shippingLocationAccuracyMeters: address.locationAccuracyMeters,
      shippingLocationProvider: address.locationProvider,
      shippingLocationPlaceId: address.locationPlaceId,
      branchNameSnapshot: state.cart.branch.name,
      branchAddressSnapshot: state.cart.branch.address,
      shippingFeeBreakdownSnapshot: (state.ghnQuote
        ? { ...state.ghnQuote }
        : quote.breakdown) as unknown as Prisma.InputJsonObject,
      shippingQuoteReference:
        state.ghnQuote?.quoteReference ?? quote.requestFingerprint,
      note: state.note,
    };
  }

  private orderItemData(
    item: ResolvedCheckoutItem,
  ): Prisma.OrderItemUncheckedCreateWithoutOrderInput {
    return {
      sourceCartItemId: item.cartItemId,
      catalogEffectivePrice: item.catalogEffectivePrice,
      flashSaleItemId: item.flashSaleItemId,
      flashPrice: item.flashSaleItemId ? item.unitPrice : null,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      productSlug: item.productSlug,
      variantLabel: item.variantLabel,
      variantOptions: item.variantOptions,
      imageUrl: item.imageUrl,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      originalPrice: item.originalPrice,
      discountAmount: item.discountAmount,
      couponDiscountAmount: item.couponDiscountAmount,
      lineTotal: item.lineTotal,
    };
  }

  private async clearSelectedCartItems(
    tx: Prisma.TransactionClient,
    cartId: string,
    items: ResolvedCheckoutItem[],
  ): Promise<void> {
    await tx.cartItem.deleteMany({
      where: {
        cartId,
        id: { in: items.map((item) => item.cartItemId) },
      },
    });
  }

  private findIdempotentOrder(userId: string, idempotencyKey: string) {
    return this.repository.client.order.findFirst({
      where: { userId, idempotencyKey },
      include: {
        payment: {
          include: {
            transactions: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
  }

  private vnpayOrderResult(
    order: Awaited<ReturnType<CheckoutService['findIdempotentOrder']>> & {},
    transaction: NonNullable<
      NonNullable<
        Awaited<ReturnType<CheckoutService['findIdempotentOrder']>>
      >['payment']
    >['transactions'][number],
    ipAddress: string,
  ) {
    assertVnpayCheckoutAmount(Number(transaction.amount));
    const payment = this.vnpay.buildPaymentUrl({
      merchantTxnRef: transaction.merchantTxnRef,
      amount: Number(transaction.amount),
      orderCode: order.orderCode,
      ipAddress,
      createdAt: transaction.createdAt,
      expiresAt: transaction.expiresAt!,
    });
    return {
      sanitizedRequest: payment.sanitizedRequest,
      response: {
        ...this.orderResult(order),
        paymentId: order.payment!.id,
        paymentTransactionId: transaction.id,
        paymentUrl: payment.paymentUrl,
      },
    };
  }

  private orderResult(order: {
    id: string;
    orderCode: string;
    status: OrderStatus;
    payment: { status: PaymentStatus } | null;
  }) {
    return {
      orderId: order.id,
      orderCode: order.orderCode,
      paymentStatus: order.payment?.status ?? PaymentStatus.UNPAID,
      orderStatus: order.status,
    };
  }

  private toResponse(state: CheckoutState): CheckoutPreviewResponseDto {
    const response: CheckoutPreviewResponseDto = {
      previewReference: state.previewReference,
      branch: {
        id: state.cart.branch.id,
        name: state.cart.branch.name,
        address: state.cart.branch.address,
        province: state.cart.branch.province,
        ward: state.cart.branch.ward,
      },
      items: state.items.map((item) => {
        const reasonCode =
          item.issues.find(
            (issue) =>
              issue !== CartItemStatus.AVAILABLE &&
              issue !== CartItemStatus.PRICE_CHANGED,
          ) ?? null;
        return {
          ...item,
          eligible: item.isCheckoutEligible,
          reasonCode,
          reasonMessage: reasonCode ? ITEM_REASON_MESSAGE[reasonCode] : null,
        };
      }),
      address: {
        source: state.address?.source ?? null,
        sourceCustomerAddressId: state.address?.sourceCustomerAddressId ?? null,
        receiverName: state.address?.receiverName ?? null,
        receiverPhone: state.address?.receiverPhone ?? null,
        formattedAddress: state.address?.formattedAddress ?? null,
        latitude: state.address?.latitude ?? null,
        longitude: state.address?.longitude ?? null,
      },
      shippingQuote: state.quote
        ? {
            shippingFee: state.quote.shippingFee,
            serviceFee: state.quote.serviceFee,
            insuranceFee: state.quote.insuranceFee,
            codFee: state.quote.codFee,
            remoteAreaFee: state.quote.remoteAreaFee,
            quotedAt: state.quote.quotedAt.toISOString(),
            expiresAt: state.quote.expiresAt.toISOString(),
            requestFingerprint: state.quote.requestFingerprint,
            shippingFeeRule: state.quote.routeType,
            policyCode: state.quote.policyCode,
            policyVersion: state.quote.policyVersion,
            routeType: state.quote.routeType,
            destinationType: state.quote.destinationType,
            destinationTypeResolution: state.quote.destinationTypeResolution,
            totalItemQuantity: state.quote.totalItemQuantity,
            productWeightGram: state.quote.productWeightGram,
            packagingType: state.quote.packagingType,
            packagingWeightGram: state.quote.packagingWeightGram,
            grossWeightGram: state.quote.grossWeightGram,
            chargeableWeightGram: state.quote.chargeableWeightGram,
            fuelSurcharge: state.quote.fuelSurcharge,
            ruleCode: state.quote.ruleCode,
          }
        : null,
      paymentMethod: state.paymentMethod,
      subtotalAmount: state.subtotalAmount,
      discountAmount: state.discountAmount,
      orderCouponDiscountAmount: state.orderCouponDiscountAmount,
      shippingCouponDiscountAmount: state.shippingCouponDiscountAmount,
      appliedCoupons: state.coupons.map(({ coupon, discountAmount }) => ({
        code: coupon.code,
        type: coupon.type,
        discountAmount,
      })),
      availableCoupons: state.availableCoupons,
      totalProductWeightGram: state.totalProductWeightGram,
      shippingFee: state.shippingFee,
      shippingFeeRule:
        state.shippingProvider === ShippingProvider.INTERNAL
          ? (state.quote?.routeType ?? null)
          : null,
      shippingMethodCode: 'STANDARD',
      totalAmount: state.totalAmount,
      note: state.note,
      canPlaceOrder:
        Boolean(
          state.address &&
          state.quote &&
          state.paymentMethod &&
          state.shippingFee !== null,
        ) && state.blockingIssues.length === 0,
      blockingIssues: state.blockingIssues,
    };
    return {
      ...response,
      shippingProvider: state.shippingProvider,
      ghnEnabled: this.ghn?.enabled ?? false,
      internalShippingQuote: response.shippingQuote,
      shippingQuote:
        state.shippingProvider === ShippingProvider.INTERNAL
          ? response.shippingQuote
          : null,
      ghnShippingQuote: toGhnShippingQuoteDto(state.ghnQuote),
      shippingMethodCode:
        state.shippingProvider === ShippingProvider.GHN ? 'GHN' : 'STANDARD',
    };
  }

  private createPreviewReference(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private assertCustomer(actor: AuthenticatedUser): void {
    if (actor.type !== UserType.CUSTOMER) {
      throw new ForbiddenException({
        code: 'CHECKOUT_CUSTOMER_REQUIRED',
        message: 'Chỉ khách hàng được thanh toán.',
      });
    }
  }

  private currentLocationResponse(location: VietMapLocationResponseDto) {
    this.ensureCurrentHierarchy(location);
    const provinceCode = this.shippingPricing.resolveProvinceCode(
      location.province,
    );
    const wardName = location.ward!;
    const destinationType =
      this.shippingPricing.resolveDestinationType(wardName);
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      province: location.province,
      provinceCode,
      ward: wardName,
      address: location.address,
      displayAddress: location.displayAddress,
      placeId: null,
      destinationType,
      locationProof: this.locationProof.issue({
        provinceCode,
        provinceName: this.shippingPricing.normalizeProvinceName(
          location.province!,
        ),
        wardName: this.normalizeAdministrativeName(wardName),
        destinationType,
        latitude: location.latitude,
        longitude: location.longitude,
      }),
    };
  }

  private normalizeAdministrativeName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/đ/gi, 'd')
      .toLocaleLowerCase('vi-VN')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private ensureCurrentHierarchy(location: VietMapLocationResponseDto): void {
    if (!location.province || !location.ward) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_CURRENT_LOCATION_INCOMPLETE',
        message: 'Không thể xác định tỉnh và phường/xã từ vị trí hiện tại.',
      });
    }
    this.shippingPricing.resolveProvinceCode(location.province);
  }
}
