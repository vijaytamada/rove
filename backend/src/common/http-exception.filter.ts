import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppException } from './app-exception.js';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
};

/** Errors thrown by Express middleware (body-parser) carry a 4xx `status` but are not HttpExceptions. */
function clientErrorStatus(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null) return undefined;
  const status = (e as { status?: unknown; statusCode?: unknown }).status ?? (e as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

/** Uniform error body: { statusCode, code, message, details? }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      const status = clientErrorStatus(exception);
      if (status) {
        const type = (exception as { type?: string }).type;
        const message =
          type === 'entity.too.large'
            ? 'The request is too large.'
            : type === 'entity.parse.failed'
              ? 'The request body is not valid JSON.'
              : 'The request could not be processed.';
        res.status(status).json({ statusCode: status, code: DEFAULT_CODES[status] ?? 'BAD_REQUEST', message });
        return;
      }
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

    // The JSON body parser reports syntax errors as a plain BadRequest with raw parser text.
    if (status === 400 && !(exception instanceof AppException) && /\bJSON\b/.test(message)) {
      message = 'The request body is not valid JSON.';
    }

    res.status(status).json({ statusCode: status, code, message, ...(details !== undefined && { details }) });
  }
}
