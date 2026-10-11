import { swaggerEnabled, useJsonLogs } from './runtime-flags.js';

describe('useJsonLogs', () => {
  it('is json in production and readable elsewhere, unless set', () => {
    expect(useJsonLogs({ NODE_ENV: 'production' })).toBe(true);
    expect(useJsonLogs({ NODE_ENV: 'development' })).toBe(false);
    expect(useJsonLogs({ NODE_ENV: 'test' })).toBe(false);
    expect(useJsonLogs({ NODE_ENV: 'development', LOG_FORMAT: 'json' })).toBe(true);
    expect(useJsonLogs({ NODE_ENV: 'production', LOG_FORMAT: 'pretty' })).toBe(false);
  });
});

describe('swaggerEnabled', () => {
  it('is on outside production', () => {
    expect(swaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(swaggerEnabled({ NODE_ENV: 'test' })).toBe(true);
  });

  it('is off in production unless explicitly turned on', () => {
    expect(swaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(swaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'false' })).toBe(false);
    expect(swaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })).toBe(true);
  });
});
