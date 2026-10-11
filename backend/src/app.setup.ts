import { Logger, ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from './config/env.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { requestLogger } from './common/request-logger.js';
import { useJsonLogs } from './config/runtime-flags.js';

/** Baseline security headers for every API response. */
function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  // Only meaningful over HTTPS; browsers ignore it on plain HTTP.
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/** App-wide HTTP setup shared by main.ts and e2e tests. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  // With N reverse proxies in front, `req.ip` is the address the Nth proxy saw (X-Forwarded-For), not the proxy's own.
  express.set('trust proxy', app.get<ConfigService<Env, true>>(ConfigService).get('TRUST_PROXY', { infer: true }));
  app.use(securityHeaders);
  // Every request gets an id; one log line per request is written when logs are JSON (production), to keep development quiet.
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const json = useJsonLogs({ NODE_ENV: config.get('NODE_ENV', { infer: true }), LOG_FORMAT: config.get('LOG_FORMAT', { infer: true }) });
  const requestLog = new Logger('http');
  app.use(requestLogger((line) => (json ? requestLog.log(JSON.stringify(line)) : undefined)));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
