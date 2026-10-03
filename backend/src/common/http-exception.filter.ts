import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

/** Uniform error body: { statusCode, code, message, details? }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Try again.',
      });
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    let code = DEFAULT_CODES[status] ?? 'ERROR';
    let message = exception.message;
    let details: unknown;

    if (typeof body === 'object' && body !== null) {
      const b = body as { code?: string; message?: string | string[]; details?: unknown };
      if (b.code) code = b.code;
      if (Array.isArray(b.message)) {
        // class-validator output
        code = status === 400 ? 'VALIDATION_ERROR' : code;
        message = 'Validation failed';
        details = b.message;
      } else if (typeof b.message === 'string') {
        message = b.message;
      }
      if (b.details !== undefined) details = b.details;
    }

    res.status(status).json({ statusCode: status, code, message, ...(details !== undefined && { details }) });
  }
}
