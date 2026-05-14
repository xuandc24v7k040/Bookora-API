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

export interface MongoServerException {
  code?: number;
  keyValue?: Record<string, unknown>;
  message?: string;
  name?: string;
}
