// =============================================================================
// Medgnosis API — WebSocket plugin
// Real-time alert delivery to clinician dashboard clients via Redis pub/sub.
//
// Channel naming:
//   medgnosis:alerts:{orgId}   — all alerts for an org
// =============================================================================

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import fastifyWebSocket from '@fastify/websocket';
import { Redis } from 'ioredis';
import { config } from '../config.js';
import { WS_EVENTS } from '@medgnosis/shared';

// ---------------------------------------------------------------------------
// Redis clients
// ---------------------------------------------------------------------------

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let redisAvailable = false;

function parseRedisOpts(): { host: string; port: number; lazyConnect: boolean; maxRetriesPerRequest: null } {
  try {
    const url = new URL(config.redisUrl);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      lazyConnect: true,
      maxRetriesPerRequest: null,
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    };
  }
}

export function getPublisher(): Redis | null {
  if (!redisAvailable) return null;
  if (!publisher) {
    publisher = new Redis(parseRedisOpts());
  }
  return publisher;
}


// ---------------------------------------------------------------------------
// Alert publish helpers — called by rules engine and alert routes
// ---------------------------------------------------------------------------

export interface AlertEventPayload {
  alertId: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  ruleKey: string;
  patientId?: string;
}

export async function publishAlert(
  patientId: string,
  orgId: string,
  event: AlertEventPayload,
): Promise<void> {
  const pub = getPublisher();
  if (!pub) return;
  const payload = JSON.stringify({
    type: WS_EVENTS.ALERT_CREATED,
    data: { ...event, patientId },
  });
  try {
    await pub.publish(`medgnosis:alerts:${orgId}`, payload);
  } catch {
    // Redis unavailable — alert still saved to DB, just not broadcast
  }
}

export async function publishCareGapClosed(
  patientId: string,
  orgId: string,
  gapId: string,
): Promise<void> {
  const pub = getPublisher();
  if (!pub) return;
  const payload = JSON.stringify({
    type: WS_EVENTS.CARE_GAP_CLOSED,
    data: { patientId, gapId },
  });
  try {
    await pub.publish(`medgnosis:alerts:${orgId}`, payload);
  } catch {
    // Redis unavailable — care gap closure still saved to DB, just not broadcast
  }
}

// ---------------------------------------------------------------------------
// Connection registry
// ---------------------------------------------------------------------------

type WsConnection = {
  socket: import('ws').WebSocket;
  userId: string;
  orgId: string;
};

const connections = new Map<string, Set<WsConnection>>();

function addConnection(conn: WsConnection): void {
  let set = connections.get(conn.orgId);
  if (!set) {
    set = new Set();
    connections.set(conn.orgId, set);
  }
  set.add(conn);
}

function removeConnection(conn: WsConnection): void {
  connections.get(conn.orgId)?.delete(conn);
}

function broadcast(orgId: string, message: string): void {
  const set = connections.get(orgId);
  if (!set) return;
  for (const conn of set) {
    if (conn.socket.readyState === 1 /* OPEN */) {
      conn.socket.send(message);
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

async function websocketPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyWebSocket, {
    options: { maxPayload: 4096 },
  });

  // Try to connect to Redis — degrade gracefully if unavailable
  try {
    const opts = parseRedisOpts();
    subscriber = new Redis(opts);
    publisher = new Redis(opts);

    await subscriber.connect();

    subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const parts = channel.split(':');
      const orgId = parts[2];
      if (orgId) broadcast(orgId, message);
    });

    await subscriber.psubscribe('medgnosis:alerts:*');
    await publisher.connect();

    redisAvailable = true;
    fastify.log.info('[ws] Redis pub/sub connected');
  } catch (err) {
    redisAvailable = false;
    // Clean up any partially-created clients
    if (subscriber) { try { subscriber.disconnect(); } catch { /* ignore */ } subscriber = null; }
    if (publisher) { try { publisher.disconnect(); } catch { /* ignore */ } publisher = null; }
    fastify.log.warn(
      { err },
      '[ws] Redis unavailable — WebSocket broadcast disabled, API continues without real-time alerts',
    );
  }

  // GET /ws — WebSocket upgrade endpoint (authenticated users only)
  fastify.get(
    '/ws',
    { websocket: true, preHandler: [fastify.authenticate] },
    (socket, request) => {
      const user = request.user;
      const conn: WsConnection = {
        socket,
        userId: user.sub,
        orgId: user.org_id,
      };
      addConnection(conn);

      fastify.log.info(`[ws] User ${user.sub} connected (org ${user.org_id})`);

      socket.send(
        JSON.stringify({ type: WS_EVENTS.PONG, data: { ts: Date.now() } }),
      );

      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type: string };
          if (msg.type === WS_EVENTS.PING) {
            socket.send(
              JSON.stringify({ type: WS_EVENTS.PONG, data: { ts: Date.now() } }),
            );
          }
        } catch {
          // ignore malformed frames
        }
      });

      socket.on('close', () => {
        removeConnection(conn);
        fastify.log.info(`[ws] User ${user.sub} disconnected`);
      });

      socket.on('error', (err) => {
        fastify.log.warn({ err }, '[ws] Socket error');
        removeConnection(conn);
      });
    },
  );

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    if (subscriber) {
      try {
        await subscriber.punsubscribe();
        subscriber.disconnect();
      } catch {
        // already disconnected
      }
    }
    if (publisher) {
      try {
        publisher.disconnect();
      } catch {
        // already disconnected
      }
    }
  });
}

export default fp(websocketPlugin, { name: 'websocket-plugin' });
