import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { ulid } from 'ulid';
import {
  DeliveryAddressSource,
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionStatus,
  Prisma,
  UserType,
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
import {
  InternalShippingFeeService,
  type InternalShippingFeeRule,
} from '@/modules/shipping/internal-shipping-fee.service';
import { StorefrontPriceService } from '@/modules/storefront-catalog/storefront-price.service';
import {
  CheckoutRepository,
  type CheckoutCartRecord,
} from './checkout.repository';
import type {
  CheckoutPreviewResponseDto,
  CurrentLocationAddressDto,
  CurrentLocationResolveDto,
  PlaceOrderDto,
  PreviewCheckoutDto,
  SavedAddressInputDto,
} from './dto';

interface ResolvedCheckoutItem {
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
  quantity: number;
  availableQuantity: number;
  unitPrice: number;
  originalPrice: number;
  discountAmount: number;
  lineTotal: number;
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
  districtName: string;
  wardName: string;
  ghnProvinceId: number | null;
  ghnDistrictId: number | null;
  ghnWardCode: string | null;
  ghnMappingVerifiedAt: Date | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyMeters: number | null;
  locationProvider: string | null;
  locationPlaceId: string | null;
}

interface InternalCheckoutShippingQuote {
  provider: 'GHN';
  serviceId: 0;
  serviceTypeId: 0;
  serviceName: 'GHN Tiêu chuẩn';
  shippingFee: number;
  serviceFee: number;
  insuranceFee: 0;
  codFee: 0;
  remoteAreaFee: 0;
  quotedAt: Date;
  expiresAt: Date;
  requestFingerprint: string;
  breakdown: Prisma.InputJsonObject;
  rule: InternalShippingFeeRule;
}

interface CheckoutState {
  cart: CheckoutCartRecord;
  items: ResolvedCheckoutItem[];
  eligibleItems: ResolvedCheckoutItem[];
  address: ResolvedCheckoutAddress | null;
  quote: InternalCheckoutShippingQuote | null;
  paymentMethod: PaymentMethod | null;
  note: string | null;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  previewReference: string;
  blockingIssues: string[];
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

@Injectable()
export class CheckoutService {
  constructor(
    private readonly repository: CheckoutRepository,
    private readonly prices: StorefrontPriceService,
    private readonly validation: CartValidationService,
    private readonly internalShippingFee: InternalShippingFeeService,
    private readonly vietmap: VietMapService,
    private readonly vnpay: VnpayService,
    private readonly config: ConfigService,
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
    this.ensureReadyForOrder(state, dto.previewReference);

    const order = await this.repository.transaction(async (tx) => {
      const idempotent = await tx.order.findFirst({
        where: { userId: actor.id, idempotencyKey: dto.idempotencyKey },
        include: { payment: true },
      });
      if (idempotent) return idempotent;
      const now = new Date();
      await this.deductStock(tx, state);
      const created = await tx.order.create({
        data: {
          ...this.orderData(
            actor.id,
            state,
            dto.idempotencyKey,
            OrderStatus.PENDING,
          ),
          stockDeductedAt: now,
          items: {
            create: state.eligibleItems.map((item) => this.orderItemData(item)),
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
      );
    }

    const state = await this.resolveCheckout(actor.id, branchId, {
      ...dto,
      paymentMethod: PaymentMethod.VNPAY,
    });
    this.ensureReadyForOrder(state, dto.previewReference);
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

      await this.deductStock(tx, state);
      return tx.order.create({
        data: {
          ...this.orderData(
            actor.id,
            state,
            dto.idempotencyKey,
            OrderStatus.PENDING_PAYMENT,
          ),
          items: {
            create: state.eligibleItems.map((item) => this.orderItemData(item)),
          },
          payment: {
            create: {
              method: PaymentMethod.VNPAY,
              status: PaymentStatus.PENDING,
              amount: state.totalAmount,
              transactions: {
                create: {
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

    const items = found.map((item): ResolvedCheckoutItem => {
      const availableQuantity =
        item.variant.stocks.find((stock) => stock.branchId === cart.branchId)
          ?.quantity ?? 0;
      const price = this.prices.resolve(item.variant);
      const result = this.validation.evaluate({
        branchActive: cart.branch.isActive,
        productStatus: item.variant.product.status,
        variantActive: item.variant.isActive,
        quantity: item.quantity,
        availableQuantity,
        currentUnitPrice: price.current,
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
        quantity: item.quantity,
        availableQuantity,
        unitPrice: price.current,
        originalPrice: price.original,
        discountAmount: (price.original - price.current) * item.quantity,
        lineTotal: price.current * item.quantity,
        isCheckoutEligible: result.isCheckoutEligible,
        issues: result.issues,
      };
    });
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
    const paymentMethod = dto.paymentMethod ?? null;
    const address = dto.address
      ? await this.resolveAddress(userId, dto.address)
      : null;
    const quote =
      address && paymentMethod
        ? this.quote(
            this.internalShippingFee.resolveProvinceCode(cart.branch.province),
            address,
          )
        : null;
    const totalAmount = subtotalAmount + (quote?.shippingFee ?? 0);
    const note = dto.note?.trim() || null;
    const blockingIssues: string[] = [];
    const previewReference = this.createPreviewReference({
      branchId,
      items: eligibleItems.map((item) => ({
        cartItemId: item.cartItemId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        availableQuantity: item.availableQuantity,
      })),
      address,
      paymentMethod,
      note,
      shippingFee: quote?.shippingFee ?? null,
      shippingQuoteReference: quote?.requestFingerprint ?? null,
    });
    return {
      cart,
      items,
      eligibleItems,
      address,
      quote,
      paymentMethod,
      note,
      subtotalAmount,
      discountAmount,
      totalAmount,
      previewReference,
      blockingIssues,
    };
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
      this.internalShippingFee.calculate({
        branchProvinceCode: saved.provinceCode,
        destinationProvinceCode: saved.provinceCode,
      });
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
        districtName: '',
        wardName: saved.ward,
        ghnProvinceId: saved.ghnProvinceId,
        ghnDistrictId: saved.ghnDistrictId,
        ghnWardCode: saved.ghnWardCode,
        ghnMappingVerifiedAt: saved.ghnMappingVerifiedAt,
        latitude: saved.latitude === null ? null : Number(saved.latitude),
        longitude: saved.longitude === null ? null : Number(saved.longitude),
        locationAccuracyMeters: null,
        locationProvider: null,
        locationPlaceId: null,
      };
    }

    this.internalShippingFee.calculate({
      branchProvinceCode: address.provinceCode,
      destinationProvinceCode: address.provinceCode,
    });
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
      provinceCode: address.provinceCode,
      provinceName: address.provinceName,
      districtName: '',
      wardName: address.wardName,
      ghnProvinceId: null,
      ghnDistrictId: null,
      ghnWardCode: null,
      ghnMappingVerifiedAt: null,
      latitude: address.latitude,
      longitude: address.longitude,
      locationAccuracyMeters: address.locationAccuracyMeters ?? null,
      locationProvider: address.locationProvider ?? 'VIETMAP',
      locationPlaceId: address.locationPlaceId ?? null,
    };
  }

  private quote(
    branchProvinceCode: number,
    address: ResolvedCheckoutAddress,
  ): InternalCheckoutShippingQuote {
    const result = this.internalShippingFee.calculate({
      branchProvinceCode,
      destinationProvinceCode: address.provinceCode,
    });
    const shippingFee = result.fee.toNumber();
    const quotedAt = new Date();
    return {
      provider: 'GHN',
      serviceId: 0,
      serviceTypeId: 0,
      serviceName: 'GHN Tiêu chuẩn',
      shippingFee,
      serviceFee: shippingFee,
      insuranceFee: 0,
      codFee: 0,
      remoteAreaFee: 0,
      quotedAt,
      expiresAt: new Date(quotedAt.getTime() + 24 * 60 * 60 * 1_000),
      requestFingerprint: this.createPreviewReference({
        branchProvinceCode,
        destinationProvinceCode: address.provinceCode,
        rule: result.rule,
        shippingFee,
      }),
      breakdown: {
        policy: 'INTERNAL_PROVINCE_REGION',
        rule: result.rule,
        branchRegion: result.branchRegion,
        destinationRegion: result.destinationRegion,
      },
      rule: result.rule,
    };
  }

  private ensureReadyForOrder(
    state: CheckoutState,
    previewReference: string,
  ): void {
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
          'Giá, phí vận chuyển hoặc tồn kho đã thay đổi. Vui lòng xác nhận lại.',
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
  ): Promise<void> {
    for (const item of [...state.eligibleItems].sort((left, right) =>
      left.variantId.localeCompare(right.variantId),
    )) {
      const result = await tx.branchProductStock.updateMany({
        where: {
          branchId: state.cart.branchId,
          variantId: item.variantId,
          quantity: { gte: item.quantity },
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
    }
  }

  private orderData(
    userId: string,
    state: CheckoutState,
    idempotencyKey: string,
    status: OrderStatus,
  ): Prisma.OrderUncheckedCreateWithoutItemsInput {
    const address = state.address!;
    const quote = state.quote!;
    return {
      orderCode: `BK-${ulid()}`,
      userId,
      branchId: state.cart.branchId,
      couponId: null,
      sourceCustomerAddressId: address.sourceCustomerAddressId,
      idempotencyKey,
      status,
      subtotalAmount: state.subtotalAmount,
      discountAmount: state.discountAmount,
      shippingFee: quote.shippingFee,
      totalAmount: state.totalAmount,
      deliveryAddressSource: address.source,
      receiverName: address.receiverName,
      receiverPhone: address.receiverPhone,
      shippingAddress: address.formattedAddress,
      shippingAddressLine: address.addressLine,
      shippingProvinceName: address.provinceName,
      shippingDistrictName: address.districtName,
      shippingWardName: address.wardName,
      shippingGhnProvinceId: address.ghnProvinceId ?? 0,
      shippingGhnDistrictId: address.ghnDistrictId ?? 0,
      shippingGhnWardCode: address.ghnWardCode ?? '',
      shippingGhnMappingVerifiedAt: address.ghnMappingVerifiedAt,
      shippingLatitude: address.latitude,
      shippingLongitude: address.longitude,
      shippingLocationAccuracyMeters: address.locationAccuracyMeters,
      shippingLocationProvider: address.locationProvider,
      shippingLocationPlaceId: address.locationPlaceId,
      branchNameSnapshot: state.cart.branch.name,
      branchAddressSnapshot: state.cart.branch.address,
      shippingProviderSnapshot: quote.provider,
      shippingServiceId: quote.serviceId,
      shippingServiceTypeId: quote.serviceTypeId,
      shippingServiceName: quote.serviceName,
      shippingFeeBreakdownSnapshot: quote.breakdown,
      shippingQuoteReference: quote.requestFingerprint,
      note: state.note,
    };
  }

  private orderItemData(
    item: ResolvedCheckoutItem,
  ): Prisma.OrderItemUncheckedCreateWithoutOrderInput {
    return {
      sourceCartItemId: item.cartItemId,
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
    return {
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
        isGhnMapped: Boolean(state.address),
      },
      shippingQuote: state.quote
        ? {
            provider: state.quote.provider,
            serviceId: state.quote.serviceId,
            serviceTypeId: state.quote.serviceTypeId,
            serviceName: state.quote.serviceName,
            shippingFee: state.quote.shippingFee,
            serviceFee: state.quote.serviceFee,
            insuranceFee: state.quote.insuranceFee,
            codFee: state.quote.codFee,
            remoteAreaFee: state.quote.remoteAreaFee,
            quotedAt: state.quote.quotedAt.toISOString(),
            expiresAt: state.quote.expiresAt.toISOString(),
            requestFingerprint: state.quote.requestFingerprint,
            shippingFeeRule: state.quote.rule,
          }
        : null,
      paymentMethod: state.paymentMethod,
      subtotalAmount: state.subtotalAmount,
      discountAmount: state.discountAmount,
      shippingFee: state.quote?.shippingFee ?? null,
      shippingFeeRule: state.quote?.rule ?? null,
      shippingMethodCode: 'STANDARD',
      shippingProviderCode: 'GHN',
      totalAmount: state.totalAmount,
      note: state.note,
      canPlaceOrder:
        Boolean(state.address && state.quote && state.paymentMethod) &&
        state.blockingIssues.length === 0,
      blockingIssues: state.blockingIssues,
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
    const provinceCode = this.internalShippingFee.resolveProvinceCode(
      location.province,
    );
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      province: location.province,
      provinceCode,
      ward: location.ward,
      address: location.address,
      displayAddress: location.displayAddress,
      placeId: null,
    };
  }

  private ensureCurrentHierarchy(location: VietMapLocationResponseDto): void {
    if (!location.province || !location.ward) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_CURRENT_LOCATION_INCOMPLETE',
        message: 'Không thể xác định tỉnh và phường/xã từ vị trí hiện tại.',
      });
    }
    this.internalShippingFee.resolveProvinceCode(location.province);
  }
}
