export const MAX_VARIANT_COMBINATIONS = 200;

export const PRODUCT_ERROR_MESSAGES: Record<string, string> = {
  PRODUCT_NOT_FOUND: 'Không tìm thấy sản phẩm',
  PRODUCT_NAME_ALREADY_EXISTS_IN_SCOPE:
    'Tên sản phẩm đã tồn tại trong cùng phạm vi nhà xuất bản, nhà cung cấp và ngày phát hành',
  PRODUCT_DELETE_REQUIRES_DRAFT:
    'Chỉ có thể xóa sản phẩm ở trạng thái bản nháp',
  PRODUCT_DELETE_BLOCKED_BY_REFERENCES:
    'Không thể xóa sản phẩm vì đang có dữ liệu nghiệp vụ tham chiếu',
  PRODUCT_MEDIA_REQUIRED:
    'Sản phẩm cần có ảnh chính trước khi kích hoạt; chức năng này được hoàn thiện ở Phase 10C',
  PRODUCT_CONFIGURATION_INVALID: 'Cấu hình sản phẩm không hợp lệ',
  PRODUCT_SIMPLE_VARIANT_REQUIRED:
    'Sản phẩm đơn phải có đúng một biến thể mặc định',
  PRODUCT_DEFAULT_VARIANT_REQUIRED:
    'Sản phẩm phải có đúng một biến thể mặc định đang hoạt động',
  PRODUCT_OPTION_NOT_FOUND: 'Không tìm thấy lựa chọn của sản phẩm',
  PRODUCT_OPTION_CODE_ALREADY_EXISTS: 'Mã lựa chọn đã tồn tại trong sản phẩm',
  PRODUCT_OPTION_CODE_IMMUTABLE_WHEN_USED:
    'Không thể đổi mã lựa chọn khi đã có biến thể sử dụng',
  PRODUCT_OPTION_IN_USE: 'Không thể xóa lựa chọn đang được biến thể sử dụng',
  PRODUCT_OPTION_VALUE_NOT_FOUND: 'Không tìm thấy giá trị lựa chọn',
  PRODUCT_OPTION_VALUE_ALREADY_EXISTS:
    'Giá trị kỹ thuật đã tồn tại trong lựa chọn',
  PRODUCT_OPTION_VALUE_IMMUTABLE_WHEN_USED:
    'Không thể đổi giá trị kỹ thuật khi đã có biến thể sử dụng',
  PRODUCT_OPTION_VALUE_IN_USE:
    'Không thể xóa giá trị đang được biến thể sử dụng',
  PRODUCT_VARIANT_NOT_FOUND: 'Không tìm thấy biến thể',
  PRODUCT_VARIANT_SKU_ALREADY_EXISTS: 'SKU đã tồn tại',
  PRODUCT_VARIANT_COMBINATION_ALREADY_EXISTS: 'Tổ hợp biến thể đã tồn tại',
  PRODUCT_VARIANT_INCOMPLETE_OPTIONS:
    'Biến thể phải chọn đúng một giá trị của mỗi lựa chọn',
  PRODUCT_VARIANT_OPTION_VALUE_SCOPE_MISMATCH:
    'Giá trị lựa chọn không thuộc sản phẩm hiện tại',
  PRODUCT_VARIANT_MATRIX_TOO_LARGE:
    'Số tổ hợp biến thể vượt quá giới hạn cho phép',
  PRODUCT_VARIANT_DELETE_BLOCKED_BY_REFERENCES:
    'Không thể xóa biến thể vì đang có dữ liệu nghiệp vụ tham chiếu',
  PRODUCT_PRICE_INVALID: 'Giá biến thể không hợp lệ',
  PRODUCT_SALE_PERIOD_INVALID: 'Thời gian khuyến mãi không hợp lệ',
  PRODUCT_ATTRIBUTE_VALUE_INVALID: 'Giá trị thuộc tính sản phẩm không hợp lệ',
};

export class ProductDomainError extends Error {
  constructor(
    readonly code: string,
    message = PRODUCT_ERROR_MESSAGES[code] ?? 'Dữ liệu sản phẩm không hợp lệ',
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
