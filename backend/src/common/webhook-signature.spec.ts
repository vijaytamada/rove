import { signHmacSha256Hex, verifyHmacSha256Hex } from './webhook-signature.js';

const secret = 'a-long-enough-test-secret';
const body = Buffer.from('{"providerRef":"r1","status":"VERIFIED"}');

describe('verifyHmacSha256Hex', () => {
  it('accepts the right signature for the exact bytes', () => {
    expect(verifyHmacSha256Hex(body, signHmacSha256Hex(body, secret), secret)).toBe(true);
    expect(verifyHmacSha256Hex(body, signHmacSha256Hex(body, secret).toUpperCase(), secret)).toBe(true);
  });

  it('rejects another secret, another body, and any change to the signature', () => {
    const sig = signHmacSha256Hex(body, secret);
    expect(verifyHmacSha256Hex(body, signHmacSha256Hex(body, 'another-secret-entirely'), secret)).toBe(false);
    expect(verifyHmacSha256Hex(Buffer.from('{"providerRef":"r1","status":"REJECTED"}'), sig, secret)).toBe(false);
    expect(verifyHmacSha256Hex(body, (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1), secret)).toBe(false);
  });

  it('is false, never a throw, for missing or malformed input', () => {
    const sig = signHmacSha256Hex(body, secret);
    expect(verifyHmacSha256Hex(undefined, sig, secret)).toBe(false);
    expect(verifyHmacSha256Hex(body, undefined, secret)).toBe(false);
    expect(verifyHmacSha256Hex(body, '', secret)).toBe(false);
    expect(verifyHmacSha256Hex(body, 'not hex at all', secret)).toBe(false);
    expect(verifyHmacSha256Hex(body, sig.slice(0, -2), secret)).toBe(false);
    expect(verifyHmacSha256Hex(body, sig + '00', secret)).toBe(false);
    expect(verifyHmacSha256Hex(body, sig, '')).toBe(false);
  });
});
