export interface ExceptionResponse {
  statusCode: number;
  message: string;
  error: string;
  errors?: unknown;
}

export interface HttpExceptionResponseBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  errors?: unknown;
}
