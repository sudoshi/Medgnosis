import { sql } from '@medgnosis/db';
import crypto from 'node:crypto';

type HandshakeKind = 'state' | 'exchange';
type HandshakePayload = Record<string, unknown>;

function token(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function sha256Base64Url(value: string): string {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

export async function storeHandshake(
  kind: HandshakeKind,
  payload: HandshakePayload,
  ttlSeconds: number,
): Promise<string> {
  const id = token();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await sql`
    INSERT INTO public.oidc_handshakes (id, kind, payload, expires_at)
    VALUES (${id}, ${kind}, ${sql.json(payload as Parameters<typeof sql.json>[0])}::jsonb, ${expiresAt.toISOString()})
  `;

  return id;
}

function parsePayload<T extends HandshakePayload>(payload: unknown): T | null {
  if (!payload) return null;

  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return parsePayload<T>(parsed);
    } catch {
      return null;
    }
  }

  if (typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as T;
  }

  return null;
}

export async function consumeHandshake<T extends HandshakePayload>(
  id: string,
  kind: HandshakeKind,
): Promise<T | null> {
  const [row] = await sql<{ payload: unknown }[]>`
    DELETE FROM public.oidc_handshakes
    WHERE id = ${id}
      AND kind = ${kind}
      AND expires_at > NOW()
    RETURNING payload
  `;

  return parsePayload<T>(row?.payload);
}

export function generatePkceVerifier(): string {
  return token();
}

export function generateNonce(): string {
  return token();
}
