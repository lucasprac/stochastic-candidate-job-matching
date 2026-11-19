import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_SECURITY_POLICY,
  CONTENT_SECURITY_POLICY_META,
  SECURITY_HEADERS,
} from './security-headers';

interface VercelConfig {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
}

describe('security headers', () => {
  it('vercel.json sends exactly the headers defined in security-headers.ts', () => {
    const config = JSON.parse(
      readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
    ) as VercelConfig;
    const catchAll = config.headers?.find((rule) => rule.source === '/(.*)');
    expect(catchAll).toBeDefined();
    const fromVercel = Object.fromEntries(catchAll!.headers.map((h) => [h.key, h.value]));
    expect(fromVercel).toEqual(SECURITY_HEADERS);
  });

  it('CSP blocks inline scripts and framing, and the meta CSP omits frame-ancestors', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self';");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY_META).not.toContain('frame-ancestors');
    expect(CONTENT_SECURITY_POLICY_META).toContain("object-src 'none'");
  });
});
