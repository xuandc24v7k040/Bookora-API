export class BaseResponseDto<T> {
  success!: boolean;
  statusCode!: number;
  message!: string;
  data!: T;
  timestamp!: string;
  path!: string;
}
