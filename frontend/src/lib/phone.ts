/**
 * Turns what a person types into the strict E.164 form the API expects (`+919876543210`).
 * A bare 10-digit number is treated as Indian (+91). Anything we can't make sense of is returned
 * as typed (spaces removed) so the API's own validation message is shown.
 */
export function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (/^00\d+$/.test(cleaned)) return `+${cleaned.slice(2)}`;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  if (/^0\d{10}$/.test(cleaned)) return `+91${cleaned.slice(1)}`;
  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}

/** "+919876543210" -> "+91 98765 43210" for display. Other countries are shown unchanged. */
export function formatPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}
