import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

async function loadConfig(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/test',
    JWT_SECRET: 'unit-test-secret',
    NODE_ENV: 'test',
    ...env,
  };
  const module = await import('./config.js');
  return module.config;
}

describe('environment configuration policy', () => {
  it('keeps public registration disabled by default', async () => {
    const config = await loadConfig({
      PUBLIC_REGISTRATION_ENABLED: undefined,
      PUBLIC_REGISTRATION_ALLOW_PRODUCTION: undefined,
    });

    expect(config.publicRegistrationEnabled).toBe(false);
    expect(config.publicRegistrationAllowProduction).toBe(false);
  });

  it('keeps demo quick-fill disabled by default', async () => {
    const config = await loadConfig({ DEMO_QUICK_FILL_ENABLED: undefined });

    expect(config.demoQuickFillEnabled).toBe(false);
  });

  it('keeps local auth enabled by default as the fallback path', async () => {
    const config = await loadConfig({ LOCAL_AUTH_ENABLED: undefined });

    expect(config.localAuthEnabled).toBe(true);
  });

  it('defaults Swagger off in production and on outside production', async () => {
    await expect(loadConfig({ NODE_ENV: 'production', SWAGGER_ENABLED: undefined }))
      .resolves.toMatchObject({ swaggerEnabled: false });
    await expect(loadConfig({ NODE_ENV: 'development', SWAGGER_ENABLED: undefined }))
      .resolves.toMatchObject({ swaggerEnabled: true });
  });

  it('still requires explicit opt-in for public registration', async () => {
    const config = await loadConfig({
      PUBLIC_REGISTRATION_ENABLED: 'true',
      PUBLIC_REGISTRATION_ALLOW_PRODUCTION: 'true',
      DEMO_QUICK_FILL_ENABLED: 'true',
    });

    expect(config.publicRegistrationEnabled).toBe(true);
    expect(config.publicRegistrationAllowProduction).toBe(true);
    expect(config.demoQuickFillEnabled).toBe(true);
  });
});
