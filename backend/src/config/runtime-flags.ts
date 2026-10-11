// Switches that decide how the running API behaves in each environment. Pure, so they are easy to test.

/** `json` = one JSON object per log line. The default is json in production and readable text otherwise. */
export function useJsonLogs(env: { NODE_ENV: string; LOG_FORMAT?: 'json' | 'pretty' }): boolean {
  return (env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'pretty')) === 'json';
}

/** The Swagger UI lists every route, so it is off in production unless SWAGGER_ENABLED=true. */
export function swaggerEnabled(env: { NODE_ENV: string; SWAGGER_ENABLED?: 'true' | 'false' }): boolean {
  return env.NODE_ENV !== 'production' || env.SWAGGER_ENABLED === 'true';
}
