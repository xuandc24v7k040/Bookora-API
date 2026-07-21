export const PRODUCT_GENERAL_MEDIA_LIMIT = 12;
export const PRODUCT_VARIANT_MEDIA_LIMIT = 8;
export const PRODUCT_MEDIA_ALT_TEXT_MAX_LENGTH = 200;
export const IMAGE_UPLOAD_TRANSPORT_MAX_BYTES = 6 * 1024 * 1024;

export const PRODUCT_MEDIA_MESSAGES: Record<string, string> = {
  PRODUCT_MEDIA_NOT_FOUND: 'Không tìm thấy ảnh của sản phẩm',
  PRODUCT_MEDIA_VARIANT_SCOPE_MISMATCH:
    'Biến thể không thuộc sản phẩm hiện tại',
  PRODUCT_MEDIA_GALLERY_LIMIT_EXCEEDED:
    'Bộ sưu tập ảnh đã đạt giới hạn cho phép',
  PRODUCT_MEDIA_REORDER_INVALID:
    'Danh sách sắp xếp không còn khớp bộ sưu tập hiện tại',
  PRODUCT_MEDIA_PRIMARY_REQUIRED:
    'Mỗi bộ sưu tập có ảnh phải có đúng một ảnh đại diện',
  PRODUCT_MEDIA_DELETE_BLOCKED_ACTIVE:
    'Không thể xóa ảnh chung cuối cùng khi sản phẩm đang hoạt động',
  PRODUCT_OPTION_VALUE_IMAGE_SCOPE_MISMATCH:
    'Giá trị lựa chọn không thuộc sản phẩm hiện tại',
};

export class ProductMediaDomainError extends Error {
  constructor(
    readonly code: string,
    message = PRODUCT_MEDIA_MESSAGES[code] ??
      'Dữ liệu ảnh sản phẩm không hợp lệ',
  ) {
    super(message);
  }
}
