import { createHmac, randomInt } from 'node:crypto';

// No 0/O/1/I so a code read out loud or typed at a counter is hard to get wrong.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const PREFIX = 'RV-';

/** A new booking code such as RV-K7M2Q9. Uniqueness is enforced by the database. */
export function generateBookingCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return PREFIX + code;
}

/** Accepts what a person types ("rv k7m2q9", "K7M2Q9") and returns the stored form, or null if it cannot be a code. */
export function normalizeBookingCode(input: string): string | null {
  const typed = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const shape = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);
  // The prefix is optional, and a code's own letters may happen to start with RV, so try both readings.
  const body = [typed, typed.replace(/^RV/, '')].find((c) => shape.test(c));
  return body ? PREFIX + body : null;
}

/**
 * The 6-digit pickup PIN. It is derived from the booking and a server secret instead of being stored, so the customer
 * can see it again later and a database leak does not reveal any PIN. Staff verify by deriving it the same way.
 */
export function derivePin(secret: string, bookingId: string): string {
  const digest = createHmac('sha256', secret).update(`booking-pin:${bookingId}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}
