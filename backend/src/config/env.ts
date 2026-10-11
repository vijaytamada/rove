import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    /** Most database connections this process keeps open (Postgres allows 100 in total by default, shared by every process). */
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),

    JWT_ACCESS_SECRET: z.string().min(16, 'must be at least 16 characters'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    OTP_PROVIDER: z.enum(['mock']).default('mock'),
    KYC_PROVIDER: z.enum(['mock']).default('mock'),
    PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
    /** Signs the identity provider's webhook (HMAC-SHA256). A real provider's secret goes here in production. */
    KYC_WEBHOOK_SECRET: z.string().min(16, 'must be at least 16 characters').default('dev-only-kyc-webhook-secret'),
    /** The mock only logs. In-app notifications work with any value; a real SMS or push sender is added later. */
    NOTIFICATION_PROVIDER: z.enum(['mock']).default('mock'),
    /** `mock`: readings only arrive through POST /telemetry. `simulator`: made-up trackers for development. */
    TELEMETRY_PROVIDER: z.enum(['mock', 'simulator']).default('mock'),
    /** The key a tracker (or its gateway) sends in the x-device-key header. */
    TELEMETRY_INGEST_KEY: z.string().min(16, 'must be at least 16 characters').default('dev-only-telemetry-ingest-key'),
    /** How long readings are kept. */
    TELEMETRY_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
    /** Turns the per-IP request limits on or off (leave on; off only for load tests). */
    RATE_LIMIT_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    /** Scales every per-IP request limit (2 = twice as many). Raise it when many real users share one address, e.g. mobile carriers. */
    RATE_LIMIT_MULTIPLIER: z.coerce.number().min(0.1).max(100).default(1),
    /** Dashboards may show numbers this many seconds old, and a crowd opening one shares a single computation. 0 = always fresh. */
    DASHBOARD_CACHE_SECONDS: z.coerce.number().min(0).max(300).default(10),
    /** How many reverse proxies sit in front of the API (0 = none, clients connect directly). Decides which address is "the client's IP". */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    /** The Swagger UI at /api/docs. Off in production unless set to true. */
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    /** `json` = one JSON object per log line (for log collectors). Default: json in production, readable otherwise. */
    LOG_FORMAT: z.enum(['json', 'pretty']).optional(),
    /** Runs the background job (expire unpaid holds, send reminders) every minute. Turned off in tests. */
    JOBS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    /** Total OTP sends per day across all phones (guards against SMS pumping and runaway cost). */
    OTP_DAILY_SEND_CAP: z.coerce.number().int().positive().default(5000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.JWT_ACCESS_SECRET.startsWith('dev-only')) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'a dev-only secret must not be used in production',
      });
    }
    if (/localhost|127\.0\.0\.1/.test(env.CORS_ORIGIN)) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'set CORS_ORIGIN to the real website address in production',
      });
    }
    if (env.KYC_WEBHOOK_SECRET.startsWith('dev-only')) {
      ctx.addIssue({
        code: 'custom',
        path: ['KYC_WEBHOOK_SECRET'],
        message: 'a dev-only secret must not be used in production',
      });
    }
    if (env.TELEMETRY_INGEST_KEY.startsWith('dev-only')) {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEMETRY_INGEST_KEY'],
        message: 'a dev-only key must not be used in production',
      });
    }
    if (env.TELEMETRY_PROVIDER === 'simulator') {
      ctx.addIssue({
        code: 'custom',
        path: ['TELEMETRY_PROVIDER'],
        message: 'the simulator must not be used in production',
      });
    }
    for (const key of ['OTP_PROVIDER', 'KYC_PROVIDER', 'PAYMENT_PROVIDER'] as const) {
      if (env[key] === 'mock') {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `the mock ${key.replace('_PROVIDER', '')} provider must not be used in production`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
