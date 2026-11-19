// Single source of truth for the HTTP security headers.
// - vercel.json must contain the same values (security-headers.test.ts checks this).
// - `vite preview` sends them, so a local production preview behaves like the deploy.
// - The build injects CONTENT_SECURITY_POLICY_META into dist/index.html for static hosts
//   that cannot set headers (for example GitHub Pages).

const CSP_DIRECTIVES: Array<[directive: string, value: string]> = [
  ['default-src', "'self'"],
  ['script-src', "'self'"],
  // React renders inline `style` attributes, so inline styles must stay allowed.
  ['style-src', "'self' 'unsafe-inline'"],
  ['img-src', "'self' data: blob:"],
  ['font-src', "'self' data:"],
  ['connect-src', "'self'"],
  ['object-src', "'none'"],
  ['base-uri', "'self'"],
  ['form-action', "'self'"],
  ['frame-ancestors', "'none'"],
  ['upgrade-insecure-requests', ''],
];

function serializeCsp(directives: Array<[string, string]>): string {
  return directives.map(([name, value]) => (value ? `${name} ${value}` : name)).join('; ');
}

export const CONTENT_SECURITY_POLICY = serializeCsp(CSP_DIRECTIVES);

/** Browsers ignore `frame-ancestors` in a <meta> CSP, so the meta version leaves it out. */
export const CONTENT_SECURITY_POLICY_META = serializeCsp(
  CSP_DIRECTIVES.filter(([name]) => name !== 'frame-ancestors'),
);

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
