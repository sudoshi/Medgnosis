import type { FastifyHelmetOptions } from '@fastify/helmet';

interface HttpSecurityConfig {
  isProd: boolean;
  swaggerEnabled: boolean;
}

export const PRODUCTION_CSP_DIRECTIVES = {
  defaultSrc: ["'none'"],
  baseUri: ["'self'"],
  connectSrc: ["'self'"],
  fontSrc: ["'self'", 'data:'],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  imgSrc: ["'self'", 'data:'],
  objectSrc: ["'none'"],
  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'"],
};

export function buildHelmetOptions(config: Pick<HttpSecurityConfig, 'isProd'>): FastifyHelmetOptions {
  return {
    hsts: config.isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    noSniff: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    contentSecurityPolicy: config.isProd
      ? { directives: PRODUCTION_CSP_DIRECTIVES }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  };
}

export function shouldRegisterSwagger(config: HttpSecurityConfig): boolean {
  return config.swaggerEnabled && !config.isProd;
}
