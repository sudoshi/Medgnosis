// =============================================================================
// Medgnosis API — Server entrypoint
// =============================================================================

import { buildApp } from './app.js';
import { config } from './config.js';

async function main(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    console.info(`[server] Medgnosis API listening on ${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.info(`[server] ${signal} received — shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main();
