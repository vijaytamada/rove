import { HttpException } from '@nestjs/common';

/** HTTP error with a stable machine-readable `code` (see docs/API.md → Errors). */
export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
