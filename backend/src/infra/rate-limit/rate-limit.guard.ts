import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AppException } from '../../common/app-exception.js';
import { RateLimitService } from './rate-limit.service.js';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitRule {
  /** Part of the counter's name, so each rule counts separately. */
  name: string;
  limit: number;
  windowSeconds: number;
}

/** At most `limit` calls per `windowSeconds` per client IP on this route (or every route of this controller). */
export const RateLimit = (name: string, limit: number, windowSeconds: number) =>
  SetMetadata(RATE_LIMIT_KEY, { name, limit, windowSeconds } satisfies RateLimitRule);

/** Applies the @RateLimit rule of the route, if it has one. The IP is `req.ip` (see TRUST_PROXY in docs/DEV_SETUP.md). */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!rule) return true;
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const result = await this.limiter.hit(rule.name, req.ip ?? 'unknown', rule.limit, rule.windowSeconds);
    if (result.allowed) return true;
    http.getResponse<Response>().setHeader('Retry-After', String(result.retryAfterSeconds));
    throw new AppException(429, 'RATE_LIMITED', 'Too many requests. Please slow down and try again shortly.');
  }
}
