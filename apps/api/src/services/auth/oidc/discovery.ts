export interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

interface CacheEntry {
  document: OidcDiscoveryDocument;
  expiresAt: number;
}

const discoveryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function isDiscoveryDocument(value: unknown): value is OidcDiscoveryDocument {
  const doc = value as Partial<OidcDiscoveryDocument>;
  return Boolean(
    doc &&
    typeof doc.issuer === 'string' &&
    typeof doc.authorization_endpoint === 'string' &&
    typeof doc.token_endpoint === 'string' &&
    typeof doc.jwks_uri === 'string',
  );
}

export async function fetchOidcDiscovery(discoveryUrl: string): Promise<OidcDiscoveryDocument> {
  const cached = discoveryCache.get(discoveryUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.document;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(discoveryUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Discovery request failed with status ${response.status}`);
    }

    const body = await response.json() as unknown;
    if (!isDiscoveryDocument(body)) {
      throw new Error('OIDC discovery document is missing required endpoints');
    }

    discoveryCache.set(discoveryUrl, {
      document: body,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export function clearOidcDiscoveryCache(): void {
  discoveryCache.clear();
}
