// =============================================================================
// Medgnosis API — Solr plugin (graceful degradation)
// Mirrors the redisAvailable pattern from websocket.ts
// =============================================================================

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { SolrClient } from '@medgnosis/solr';
import { config } from '../config.js';

let solrClient: SolrClient | null = null;
let solrAvailable = false;

export function getSolrClient(): SolrClient | null {
  if (!solrAvailable || !solrClient) return null;
  return solrClient;
}

export function isSolrAvailable(): boolean {
  return solrAvailable;
}

async function solrPlugin(fastify: FastifyInstance): Promise<void> {
  if (!config.solrEnabled) {
    fastify.log.info('[solr] Disabled via SOLR_ENABLED=false');
    return;
  }

  try {
    solrClient = new SolrClient({
      baseUrl: config.solrUrl,
      searchCore: config.solrSearchCore,
      clinicalCore: config.solrClinicalCore,
      authUser: config.solrAuthUser,
      authPassword: config.solrAuthPassword,
      timeoutMs: 10000,
    });

    const searchOk = await solrClient.ping('search');
    const clinicalOk = await solrClient.ping('clinical');

    if (searchOk && clinicalOk) {
      solrAvailable = true;
      fastify.log.info('[solr] Connected — both cores healthy');
    } else {
      solrAvailable = false;
      solrClient = null;
      fastify.log.warn(
        `[solr] Cores not healthy (search: ${searchOk}, clinical: ${clinicalOk}) — falling back to PG`,
      );
    }
  } catch (err) {
    solrAvailable = false;
    solrClient = null;
    fastify.log.warn(
      { err },
      '[solr] Connection failed — all queries will use PG',
    );
  }

  // Periodic health check every 30s — re-enable if Solr comes back
  const healthCheckTimer = setInterval(async () => {
    if (solrAvailable || !config.solrEnabled) return;
    try {
      const client = new SolrClient({
        baseUrl: config.solrUrl,
        searchCore: config.solrSearchCore,
        clinicalCore: config.solrClinicalCore,
        authUser: config.solrAuthUser,
        authPassword: config.solrAuthPassword,
        timeoutMs: 5000,
      });
      const ok = await client.ping('search');
      if (ok) {
        solrClient = client;
        solrAvailable = true;
        fastify.log.info('[solr] Reconnected — Solr is healthy again');
      }
    } catch {
      // Still down — no-op
    }
  }, 30_000);

  fastify.addHook('onClose', async () => {
    clearInterval(healthCheckTimer);
    solrAvailable = false;
    solrClient = null;
  });
}

export default fp(solrPlugin, { name: 'solr' });
