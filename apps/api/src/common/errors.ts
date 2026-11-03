import { HttpException, HttpStatus } from '@nestjs/common';

/** Error with a stable machine-readable code the front-end can translate. */
export class AppError extends HttpException {
  constructor(code: string, message: string, status: HttpStatus = HttpStatus.BAD_REQUEST, extra?: Record<string, unknown>) {
    super({ code, message, ...extra }, status);
  }
}
