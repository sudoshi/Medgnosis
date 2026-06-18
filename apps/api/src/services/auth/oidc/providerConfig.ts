import { sql } from '@medgnosis/db';
import { config } from '../../../config.js';

export interface OidcProviderConfig {
  enabled: boolean;
  label: string;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  allowedGroups: string[];
  adminGroups: string[];
  stateTtlSeconds: number;
  exchangeTtlSeconds: number;
}

interface ProviderRow {
  enabled: boolean;
  display_name: string;
  settings: Record<string, unknown> | null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return fallback;
}

async function getProviderRow(): Promise<ProviderRow | null> {
  const [row] = await sql<ProviderRow[]>`
    SELECT enabled, display_name, settings
    FROM public.auth_provider_settings
    WHERE provider_type = 'oidc'
  `.catch(() => []);

  return row ?? null;
}

export async function getOidcProviderConfig(): Promise<OidcProviderConfig> {
  const row = await getProviderRow();
  const settings = row?.settings ?? {};
  const clientSecretRef = asString(settings.client_secret_ref, config.oidcClientSecretRef);
  const clientSecret = clientSecretRef ? process.env[clientSecretRef] ?? '' : config.oidcClientSecret;

  return {
    enabled: row?.enabled ?? config.oidcEnabled,
    label: asString(settings.label, row?.display_name ?? config.oidcLabel),
    discoveryUrl: asString(settings.discovery_url, config.oidcDiscoveryUrl),
    clientId: asString(settings.client_id, config.oidcClientId),
    clientSecret,
    redirectUri: asString(settings.redirect_uri, config.oidcRedirectUri),
    scopes: asList(settings.scopes, config.oidcScopes),
    allowedGroups: asList(settings.allowed_groups, config.oidcAllowedGroups),
    adminGroups: asList(settings.admin_groups, config.oidcAdminGroups),
    stateTtlSeconds: config.oidcStateTtlSeconds,
    exchangeTtlSeconds: config.oidcExchangeTtlSeconds,
  };
}

export function isOidcPubliclyAvailable(provider: OidcProviderConfig): boolean {
  return Boolean(
    provider.enabled &&
    provider.discoveryUrl &&
    provider.clientId &&
    provider.redirectUri,
  );
}
