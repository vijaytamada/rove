/**
 * Row actions redirect back with `?error=<API error code>`. The page shows a message from this
 * fixed list, never text taken from the URL, so a crafted link can't display arbitrary messages.
 */
const MESSAGES: Record<string, string> = {
  VEHICLE_BUSY: "This scooter is part of a booking or ride and can't be changed right now.",
  VEHICLE_CHANGED: "This scooter was just updated by someone else. Reload and try again.",
  INVALID_STATUS_CHANGE: "That status is set automatically by bookings and rides.",
  STATION_FULL: "This station is at capacity.",
  CANNOT_DISABLE_SELF: "You can't disable your own account.",
  INVALID_ASSIGNMENT: "Check the city or station assignments.",
  FORBIDDEN_SCOPE: "You don't have access to that city or station.",
  FORBIDDEN_ROLE: "You don't have permission to do that.",
  NETWORK_ERROR: "Can't reach the server. Check your connection and try again.",
  CITY_NOT_FOUND: "That city no longer exists.",
  STATION_NOT_FOUND: "That station no longer exists.",
  VEHICLE_NOT_FOUND: "That scooter no longer exists.",
  MODEL_NOT_FOUND: "That vehicle model no longer exists.",
  USER_NOT_FOUND: "That account no longer exists.",
};

export function messageForCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return MESSAGES[code] ?? "Something went wrong. Try again.";
}
