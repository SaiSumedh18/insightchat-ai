// Test-only provider. Production entry point never imports this module.
import { createApp } from '../src/app.js';
import { config, validateConfig } from '../src/config.js';
import { migrate, pool } from '../src/db.js';
validateConfig();
if (!new URL(config.databaseUrl).pathname.endsWith('_test'))
  throw new Error('Use an isolated E2E test database');
await migrate();
const server = createApp(
  async () => 'Deterministic test answer',
  true,
  async (_d, _q, _h, emit, signal) => {
    await emit('This is a streamed ');
    await new Promise((r) => setTimeout(r, 300));
    if (signal?.aborted) throw new Error('Aborted');
    await emit('test answer grounded in dataset statistics.');
    return 'This is a streamed test answer grounded in dataset statistics.';
  },
).listen(config.port);
for (const s of ['SIGTERM', 'SIGINT'])
  process.on(s, () =>
    server.close(async () => {
      await pool.end();
      process.exit(0);
    }),
  );
