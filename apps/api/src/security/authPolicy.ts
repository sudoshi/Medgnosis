interface AuthPolicyConfig {
  nodeEnv: string;
  publicRegistrationEnabled: boolean;
  publicRegistrationAllowProduction: boolean;
  demoQuickFillEnabled: boolean;
}

export interface AuthExposurePolicy {
  publicRegistrationEnabled: boolean;
  demoQuickFillEnabled: boolean;
}

export function buildAuthExposurePolicy(config: AuthPolicyConfig): AuthExposurePolicy {
  const isProduction = config.nodeEnv === 'production';

  return {
    publicRegistrationEnabled:
      config.publicRegistrationEnabled &&
      (!isProduction || config.publicRegistrationAllowProduction),
    demoQuickFillEnabled: config.demoQuickFillEnabled && !isProduction,
  };
}
