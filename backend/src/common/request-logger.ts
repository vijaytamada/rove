import { randomUUID } from 'node:crypto';
import type { LoggerService } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** The id of a request: the caller's `x-request-id` if it is a short safe token, else a new one. */
export function requestIdFrom(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && /^[A-Za-z0-9._-]{8,64}$/.test(value) ? value : randomUUID();
}

export interface RequestLogLine {
  msg: 'request';
  requestId: string;
  method: string;
  /** The route pattern ("/bookings/:id/pay"), never the real URL: ids and query strings can identify people. */
  route: string;
  status: number;
  ms: number;
  userId?: string;
}

/** Gives every request an id (echoed in `X-Request-Id`) and logs one line when it finishes. Never logs bodies, headers or query strings. */
export function requestLogger(write: (line: RequestLogLine) => void, skip: (path: string) => boolean = (p) => /\/health(\/|$)/.test(p)) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = requestIdFrom(req.headers['x-request-id']);
    (req as Request & { id?: string }).id = requestId;
    res.setHeader('X-Request-Id', requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (skip(req.path)) return;
      const user = (req as Request & { user?: { id: string } }).user;
      write({
        msg: 'request',
        requestId,
        method: req.method,
        route: req.route?.path ? String(req.route.path) : 'unmatched',
        status: res.statusCode,
        ms: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
        ...(user ? { userId: user.id } : {}),
      });
    });
    next();
  };
}

/** One JSON object per line on stdout (stderr for errors), for log collectors. */
export class JsonLogger implements LoggerService {
  private emit(level: string, message: unknown, context?: string, stack?: string) {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      ...(context ? { context } : {}),
      message: typeof message === 'string' ? message : message instanceof Error ? message.message : JSON.stringify(message),
      ...(stack ? { stack } : {}),
    });
    (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
  }

  log(message: unknown, context?: string) {
    this.emit('info', message, context);
  }
  warn(message: unknown, context?: string) {
    this.emit('warn', message, context);
  }
  error(message: unknown, stackOrContext?: string, context?: string) {
    // Nest calls error(message, stack, context) or error(message, context).
    this.emit('error', message, context ?? stackOrContext, context ? stackOrContext : undefined);
  }
  debug(message: unknown, context?: string) {
    this.emit('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    this.emit('verbose', message, context);
  }
}
