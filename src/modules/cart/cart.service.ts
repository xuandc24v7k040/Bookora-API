import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus, UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { StorefrontPriceService } from '@/modules/storefront-catalog/storefront-price.service';
import { CartMapper } from './cart.mapper';
import { CartRepository } from './cart.repository';
import type { AddCartItemDto, UpdateCartItemQuantityDto } from './dto';

@Injectable()
export class CartService {
  constructor(
    private readonly repository: CartRepository,
    private readonly mapper: CartMapper,
    private readonly prices: StorefrontPriceService,
  ) {}

  async get(actor: AuthenticatedUser, branchId?: string) {
    this.assertCustomer(actor);
    const branch = await this.activeBranch(branchId);
    const existing = await this.repository.findCart(actor.id);
    const cart =
      existing && existing.branchId === branch.id
        ? existing
        : await this.repository.syncBranch(actor.id, branch.id);
    return this.mapper.toResponse(cart!);
  }

  async add(
    actor: AuthenticatedUser,
    branchId: string | undefined,
    dto: AddCartItemDto,
  ) {
    this.assertCustomer(actor);
    const branch = await this.activeBranch(branchId);
    const variant = await this.repository.findVariant(
      dto.productVariantId,
      branch.id,
    );
    if (!variant || variant.product.status !== ProductStatus.ACTIVE) {
      throw new NotFoundException({
        code: 'CART_PRODUCT_INACTIVE',
        message: 'Sản phẩm đã ngừng kinh doanh.',
      });
    }
    if (!variant.isActive) {
      throw new BadRequestException({
        code: 'CART_VARIANT_INACTIVE',
        message: 'Phiên bản đã chọn không còn khả dụng.',
      });
    }
    const availableQuantity = variant.stocks[0]?.quantity ?? 0;
    if (availableQuantity <= 0) {
      throw new BadRequestException({
        code: 'CART_OUT_OF_STOCK',
        message: 'Sản phẩm hiện đã hết hàng tại chi nhánh này.',
      });
    }
    const currentPrice = this.prices.resolve(variant).current;
    const result = await this.repository.addItem(
      actor.id,
      branch.id,
      variant.id,
      dto.quantity,
      availableQuantity,
      currentPrice,
    );
    if (result === 'quantity-exceeded') this.quantityExceeded();
    return this.mapper.toResponse((await this.repository.findCart(actor.id))!);
  }

  async update(
    actor: AuthenticatedUser,
    itemId: string,
    dto: UpdateCartItemQuantityDto,
  ) {
    this.assertCustomer(actor);
    const owned = await this.repository.findOwnedItem(actor.id, itemId);
    if (!owned) this.itemNotFound();
    const cart = await this.repository.findCart(actor.id);
    if (!cart) this.itemNotFound();
    const variant = await this.repository.findVariant(
      owned.variantId,
      cart.branchId,
    );
    if (
      !variant ||
      variant.product.status !== ProductStatus.ACTIVE ||
      !variant.isActive
    ) {
      throw new BadRequestException({
        code: 'CART_ITEM_UNAVAILABLE',
        message: 'Sản phẩm hoặc phiên bản không còn khả dụng.',
      });
    }
    if (dto.quantity > (variant.stocks[0]?.quantity ?? 0)) {
      this.quantityExceeded();
    }
    const updated = await this.repository.updateQuantity(
      actor.id,
      itemId,
      dto.quantity,
      this.prices.resolve(variant).current,
    );
    if (!updated) this.itemNotFound();
    return this.mapper.toResponse((await this.repository.findCart(actor.id))!);
  }

  async remove(actor: AuthenticatedUser, itemId: string) {
    this.assertCustomer(actor);
    if (!(await this.repository.deleteItem(actor.id, itemId))) {
      this.itemNotFound();
    }
    return this.mapper.toResponse((await this.repository.findCart(actor.id))!);
  }

  async changeBranch(actor: AuthenticatedUser, branchId: string | undefined) {
    this.assertCustomer(actor);
    const branch = await this.activeBranch(branchId);
    return this.mapper.toResponse(
      (await this.repository.syncBranch(actor.id, branch.id))!,
    );
  }

  private assertCustomer(actor: AuthenticatedUser) {
    if (actor.type !== UserType.CUSTOMER) {
      throw new ForbiddenException({
        code: 'CART_CUSTOMER_REQUIRED',
        message: 'Chỉ khách hàng được sử dụng giỏ hàng.',
      });
    }
  }

  private async activeBranch(branchId?: string) {
    if (!branchId) {
      throw new BadRequestException({
        code: 'BRANCH_CONTEXT_REQUIRED',
        message: 'Vui lòng chọn chi nhánh.',
      });
    }
    const branch = await this.repository.findBranch(branchId);
    if (!branch || !branch.isActive) {
      throw new BadRequestException({
        code: 'CART_BRANCH_INACTIVE',
        message: 'Chi nhánh không còn hoạt động.',
      });
    }
    return branch;
  }

  private quantityExceeded(): never {
    throw new BadRequestException({
      code: 'CART_QUANTITY_EXCEEDS_STOCK',
      message: 'Số lượng vượt quá tồn kho hiện tại.',
    });
  }

  private itemNotFound(): never {
    throw new NotFoundException({
      code: 'CART_ITEM_NOT_FOUND',
      message: 'Không tìm thấy sản phẩm trong giỏ hàng.',
    });
  }
}
