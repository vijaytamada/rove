// Display helpers. Money is integer paise from the API; this is the only place it becomes text.
// Times are shown in the city's time zone (a pickup happens at a station), never in the server's.

/** 4900 -> "₹49", 10050 -> "₹100.50". */
export function formatMoney(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees)}`;
}

const dateTime = (tz: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const dayOnly = (tz: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
const timeOnly = (tz: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });

/** "Fri, 9 Oct, 10:30 am" */
export const formatDateTime = (iso: string, tz: string) => dateTime(tz).format(new Date(iso)).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());

const lower = (s: string) => s.replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());

/** "Fri, 9 Oct · 10:30 am – 12:30 pm", or both full dates when it spans days. */
export function formatRange(startIso: string, endIso: string, tz: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (dayOnly(tz).format(start) === dayOnly(tz).format(end)) {
    return `${dayOnly(tz).format(start)} · ${lower(timeOnly(tz).format(start))} – ${lower(timeOnly(tz).format(end))}`;
  }
  return `${formatDateTime(startIso, tz)} – ${formatDateTime(endIso, tz)}`;
}

function parts(tz: string, ms: number) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const get = (type: string) => Number(dtf.formatToParts(new Date(ms)).find((p) => p.type === type)?.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** How far the zone is ahead of UTC at this instant, in minutes. */
function offsetMinutes(tz: string, ms: number): number {
  const p = parts(tz, ms);
  return (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60_000;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-10-09T10:30" typed on a clock in `tz` -> the real instant as an ISO string, or null if not valid. */
export function localToUtcIso(local: string, tz: string): string | null {
  const m = LOCAL.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - offsetMinutes(tz, guess) * 60_000;
  // Near a daylight-saving change the first guess can be off; one correction settles it.
  utc = guess - offsetMinutes(tz, utc) * 60_000;
  return Number.isNaN(utc) ? null : new Date(utc).toISOString();
}

/** An instant as "YYYY-MM-DDTHH:mm" on the clock of `tz`, for <input type="datetime-local">. */
export function toLocalInput(date: Date, tz: string): string {
  const p = parts(tz, date.getTime());
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${two(p.mo)}-${two(p.d)}T${two(p.h)}:${two(p.mi)}`;
}

/** Hours and minutes left until `iso` as "9:41"; "0:00" once it has passed. */
export function formatCountdown(iso: string, nowMs: number): string {
  const left = Math.max(0, Math.ceil((new Date(iso).getTime() - nowMs) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}
