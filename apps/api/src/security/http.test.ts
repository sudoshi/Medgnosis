import { describe, expect, it } from 'vitest';
import {
  buildHelmetOptions,
  PRODUCTION_CSP_DIRECTIVES,
  shouldRegisterSwagger,
} from './http.js';

describe('HTTP security policy', () => {
  it('builds explicit production CSP and header hardening options', () => {
    const options = buildHelmetOptions({ isProd: true });

    expect(options).toMatchObject({
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      noSniff: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      contentSecurityPolicy: {
        directives: PRODUCTION_CSP_DIRECTIVES,
      },
    });
    expect(PRODUCTION_CSP_DIRECTIVES.defaultSrc).toEqual(["'none'"]);
    expect(PRODUCTION_CSP_DIRECTIVES.scriptSrc).toEqual(["'self'"]);
    expect(PRODUCTION_CSP_DIRECTIVES.connectSrc).toEqual(["'self'"]);
    expect(PRODUCTION_CSP_DIRECTIVES.imgSrc).toEqual(["'self'", 'data:']);
    expect(PRODUCTION_CSP_DIRECTIVES.fontSrc).toEqual(["'self'", 'data:']);
    expect(PRODUCTION_CSP_DIRECTIVES.frameAncestors).toEqual(["'none'"]);
    expect(PRODUCTION_CSP_DIRECTIVES.objectSrc).toEqual(["'none'"]);
  });

  it('keeps CSP and HSTS disabled outside production for local tooling', () => {
    expect(buildHelmetOptions({ isProd: false })).toMatchObject({
      hsts: false,
      contentSecurityPolicy: false,
    });
  });

  it('allows Swagger only outside production', () => {
    expect(shouldRegisterSwagger({ isProd: false, swaggerEnabled: true })).toBe(true);
    expect(shouldRegisterSwagger({ isProd: false, swaggerEnabled: false })).toBe(false);
    expect(shouldRegisterSwagger({ isProd: true, swaggerEnabled: false })).toBe(false);
    expect(shouldRegisterSwagger({ isProd: true, swaggerEnabled: true })).toBe(false);
  });
});
