import type { ShippingPricingQuote } from '@/modules/shipping/policies/shipping-policy.types';

export interface GhnMasterRow {
  _id: number;
  name: string;
  extension_names: string[];
  parent_id: number;
  status: number;
}
export interface GhnAddress {
  address: string;
  province: string;
  ward: string;
}
export interface GhnQuoteContext {
  userId: string;
  cartId: string;
  branchId: string;
  origin: GhnAddress;
  destination: GhnAddress;
  receiverName: string;
  receiverPhone: string;
  items: ReadonlyArray<{
    variantId: string;
    quantity: number;
    unitPrice: number;
    weightGram: number;
    packageSize?: string | null;
  }>;
  subtotal: number;
  paymentMethod: 'COD' | 'VNPAY';
  packaging: Pick<ShippingPricingQuote, 'packagingType' | 'grossWeightGram'>;
}
export interface GhnPreviewPayload {
  from_address: string;
  from_province_name: string;
  from_ward_name: string;
  is_new_from_address: true;
  to_name: string;
  to_phone: string;
  to_address: string;
  to_province_name: string;
  to_ward_name: string;
  is_new_to_address: true;
  weight: number;
  length: number;
  width: number;
  height: number;
  service_type_id: 2;
  payment_type_id: 1;
  required_note: 'KHONGCHOXEMHANG';
  content: string;
  cod_amount: number;
  insurance_value: number;
  order_value: number;
}
export interface GhnPreviewResult {
  shippingFee: number;
  estimatedDeliveryAt: string;
  feeComponents: Record<string, number>;
}
export interface GhnQuote extends GhnPreviewResult {
  provider: 'GHN';
  quoteReference: string;
  expiresAt: string;
  quotedAt: string;
  materialFingerprint: string;
  contextFingerprint: string;
  serviceTypeId: 2;
  parcel: { weightGram: number; length: number; width: number; height: number };
  codAmount: number;
  declaredValue: number;
}
