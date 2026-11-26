import { UnprocessableEntityException } from '@nestjs/common';

export type GhnErrorCode =
  | 'GHN_UNAVAILABLE'
  | 'GHN_ADDRESS_UNRESOLVED'
  | 'GHN_ROUTE_UNSUPPORTED'
  | 'GHN_PARCEL_UNSUPPORTED'
  | 'GHN_VALUE_UNSUPPORTED'
  | 'SHIPPING_QUOTE_CONTEXT_MISMATCH'
  | 'SHIPPING_QUOTE_EXPIRED';
const messages: Record<GhnErrorCode, string> = {
  GHN_UNAVAILABLE:
    'Chưa thể lấy báo giá Giao Hàng Nhanh. Vui lòng thử lại hoặc chọn giao hàng tiêu chuẩn.',
  GHN_ADDRESS_UNRESOLVED:
    'GHN chưa xác định được địa chỉ gửi hoặc nhận. Bạn vẫn có thể chọn giao hàng tiêu chuẩn.',
  GHN_ROUTE_UNSUPPORTED: 'GHN hiện chưa hỗ trợ tuyến giao hàng này.',
  GHN_PARCEL_UNSUPPORTED:
    'Kiện hàng chưa đủ điều kiện báo giá GHN. Vui lòng chọn giao hàng tiêu chuẩn.',
  GHN_VALUE_UNSUPPORTED:
    'Giá trị khai báo hoặc tiền thu hộ vượt giới hạn GHN hiện cho phép. Vui lòng chọn giao hàng tiêu chuẩn.',
  SHIPPING_QUOTE_CONTEXT_MISMATCH:
    'Báo giá vận chuyển không khớp đơn hàng hiện tại. Vui lòng lấy lại báo giá.',
  SHIPPING_QUOTE_EXPIRED:
    'Báo giá vận chuyển đã thay đổi hoặc hết hạn. Vui lòng kiểm tra và xác nhận lại.',
};
export class GhnQuoteError extends UnprocessableEntityException {
  constructor(readonly errorCode: GhnErrorCode) {
    super({ code: errorCode, message: messages[errorCode] });
  }
}
