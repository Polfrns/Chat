import 'dotenv/config';
import express from 'express';
import { loadConfig } from './config';
import { RokoRegistry } from './registry';
import { FilestoreService } from './service';
import { createMcpRouter } from './mcp';
import { createRestRouter } from './rest';

function main(): void {
  const config = loadConfig();
  const registry = new RokoRegistry(config.dbPath);
  const service = new FilestoreService(registry, config);

  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'roko-server' });
  });
  app.use('/mcp', createMcpRouter(service, config));
  app.use('/filestores', createRestRouter(service, config));

  app.listen(config.port, () => {
    console.log(`[roko] listening on http://localhost:${config.port}`);
    console.log(`[roko]   MCP   → POST/GET/DELETE /mcp`);
    console.log(`[roko]   REST  → /filestores`);
    console.log(`[roko]   data  → ${config.filestoreRoot}`);
  });
}

main();
