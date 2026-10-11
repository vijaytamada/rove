import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Checks a webhook's HMAC-SHA256 signature (hex) over the exact bytes received. Constant-time, and false (never a
 * throw) for a missing, malformed or wrong signature. Shared by every provider that signs its webhooks this way.
 */
export function verifyHmacSha256Hex(rawBody: Buffer | undefined, signature: string | undefined, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  // Only whole bytes of hex are a valid signature; anything else cannot match.
  if (!/^[0-9a-f]+$/i.test(signature) || signature.length !== expected.length * 2) return false;
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function signHmacSha256Hex(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
