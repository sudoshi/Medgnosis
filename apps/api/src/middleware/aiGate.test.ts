import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

const { mockSql } = vi.hoisted(() => ({
  mockSql: vi.fn(),
}));

vi.mock('@medgnosis/db', () => ({ sql: mockSql }));

import { aiGateMiddleware } from './aiGate.js';

const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply & {
    status: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  mockSql.mockReset();
});

describe('aiGateMiddleware', () => {
  it('checks consent using the JWT sub claim', async () => {
    mockSql.mockResolvedValueOnce([{ ai_consent_given_at: '2026-06-15T00:00:00Z' }]);
    const reply = makeReply();

    await aiGateMiddleware(
      { user: { sub: USER_ID } } as FastifyRequest,
      reply,
    );

    expect(mockSql.mock.calls[0]?.[1]).toBe(USER_ID);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('rejects requests without stored AI consent', async () => {
    mockSql.mockResolvedValueOnce([]);
    const reply = makeReply();

    await aiGateMiddleware(
      { user: { sub: USER_ID } } as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'AI_CONSENT_REQUIRED' }),
      }),
    );
  });
});
