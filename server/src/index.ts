import { createApp } from './app.js';
import { config, validateConfig } from './config.js';
import { migrate, pool } from './db.js';
validateConfig();
await migrate();
const server = createApp().listen(config.port, () =>
  console.log(
    `InsightChat API listening on ${config.port}; AI ${config.apiKey ? 'enabled' : 'not configured'}`,
  ),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await pool.end();
      process.exit(0);
    }),
  );
