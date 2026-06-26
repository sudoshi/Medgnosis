import { describe, expect, it } from 'vitest';
import { buildAuthExposurePolicy } from './authPolicy.js';

describe('auth exposure policy', () => {
  it('keeps public registration disabled unless explicitly enabled', () => {
    expect(buildAuthExposurePolicy({
      nodeEnv: 'development',
      publicRegistrationEnabled: false,
      publicRegistrationAllowProduction: false,
      demoQuickFillEnabled: false,
    }).publicRegistrationEnabled).toBe(false);
  });

  it('allows public registration outside production when enabled', () => {
    expect(buildAuthExposurePolicy({
      nodeEnv: 'development',
      publicRegistrationEnabled: true,
      publicRegistrationAllowProduction: false,
      demoQuickFillEnabled: false,
    }).publicRegistrationEnabled).toBe(true);
  });

  it('requires the second production key for public registration in production', () => {
    expect(buildAuthExposurePolicy({
      nodeEnv: 'production',
      publicRegistrationEnabled: true,
      publicRegistrationAllowProduction: false,
      demoQuickFillEnabled: false,
    }).publicRegistrationEnabled).toBe(false);

    expect(buildAuthExposurePolicy({
      nodeEnv: 'production',
      publicRegistrationEnabled: true,
      publicRegistrationAllowProduction: true,
      demoQuickFillEnabled: false,
    }).publicRegistrationEnabled).toBe(true);
  });

  it('never exposes demo quick-fill in production', () => {
    expect(buildAuthExposurePolicy({
      nodeEnv: 'production',
      publicRegistrationEnabled: false,
      publicRegistrationAllowProduction: false,
      demoQuickFillEnabled: true,
    }).demoQuickFillEnabled).toBe(false);
  });
});
