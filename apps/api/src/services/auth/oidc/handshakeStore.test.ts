import { beforeEach, describe, expect, it, vi } from 'vitest';

type SqlRow = Record<string, unknown>;

const mockJson = vi.fn((value: unknown) => ({ __json: value }));
const mockSql = vi.fn<(strings: TemplateStringsArray, ...values: unknown[]) => Promise<SqlRow[]>>();

vi.mock('@medgnosis/db', () => ({
  sql: Object.assign(mockSql, {
    json: mockJson,
  }),
}));

const {
  consumeHandshake,
  sha256Base64Url,
  storeHandshake,
} = await import('./handshakeStore.js');

describe('OIDC handshake store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
  });

  it('stores structured payloads through the postgres JSON helper', async () => {
    const payload = { nonce: 'nonce-1', codeVerifier: 'verifier-1' };

    await storeHandshake('state', payload, 300);

    expect(mockJson).toHaveBeenCalledWith(payload);
    expect(mockSql).toHaveBeenCalledOnce();
    expect(mockSql.mock.calls[0]?.[3]).toEqual({ __json: payload });
  });

  it('parses JSONB payloads returned as strings before using the verifier', async () => {
    const payload = { nonce: 'nonce-1', codeVerifier: 'verifier-1' };
    mockSql.mockResolvedValueOnce([{ payload: JSON.stringify(payload) }]);

    const consumed = await consumeHandshake<typeof payload>('state-1', 'state');

    expect(consumed).toEqual(payload);
    expect(sha256Base64Url(consumed!.codeVerifier)).toBe(sha256Base64Url(payload.codeVerifier));
  });

  it('returns null for malformed JSONB payloads', async () => {
    mockSql.mockResolvedValueOnce([{ payload: '{not-json' }]);

    await expect(consumeHandshake('state-1', 'state')).resolves.toBeNull();
  });
});
