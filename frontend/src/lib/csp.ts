/**
 * The Content-Security-Policy for one request. Scripts must carry this request's nonce (Next.js adds it to its own), so an
 * injected script cannot run. Styles allow inline attributes because React and the map set them. Map tiles come from
 * OpenStreetMap. `unsafe-eval` is only for the development server.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
