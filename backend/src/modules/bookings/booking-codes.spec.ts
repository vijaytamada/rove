import { derivePin, generateBookingCode, normalizeBookingCode } from './booking-codes.js';

describe('booking codes', () => {
  it('generates RV- codes that normalize to themselves', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateBookingCode();
      expect(code).toMatch(/^RV-[A-HJ-NP-Z2-9]{6}$/);
      expect(normalizeBookingCode(code)).toBe(code);
    }
  });

  it('accepts casual input and rejects lookalikes', () => {
    expect(normalizeBookingCode('rv k7m2q9')).toBe('RV-K7M2Q9');
    expect(normalizeBookingCode('k7m2q9')).toBe('RV-K7M2Q9');
    expect(normalizeBookingCode('RV-K7M2Q')).toBeNull();
    expect(normalizeBookingCode('RV-K7M2Q0')).toBeNull();
    expect(normalizeBookingCode('')).toBeNull();
  });

  it('derives a stable 6-digit PIN per booking and secret', () => {
    const a = derivePin('secret-one', 'booking-1');
    expect(a).toMatch(/^\d{6}$/);
    expect(derivePin('secret-one', 'booking-1')).toBe(a);
    expect(derivePin('secret-two', 'booking-1')).not.toBe(a);
    const pins = new Set(Array.from({ length: 50 }, (_, i) => derivePin('secret-one', `b-${i}`)));
    expect(pins.size).toBeGreaterThan(40);
  });
});
