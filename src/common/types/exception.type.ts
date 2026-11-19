export interface ExceptionResponse {
  details?: FlashSaleChoiceDetails;
  statusCode: number;
  message: string;
  error: string;
  code?: string;
  errors?: unknown;
}

export interface HttpExceptionResponseBody {
  details?: unknown;
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
  errors?: unknown;
}

export interface FlashSaleChoiceDetails {
  cartItemId: string;
  allowedQuantity: number;
  requestedQuantity: number;
  catalogPrice: number;
}
