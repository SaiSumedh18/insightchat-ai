import { createApp } from '../server/src/app.js';
import { pool, migrate } from '../server/src/db.js';
import { config } from '../server/src/config.js';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
if (!new URL(config.databaseUrl).pathname.endsWith('_benchmark'))
  throw new Error('Use an isolated _benchmark database');
await migrate();
const server = createApp().listen(0, '127.0.0.1');
await new Promise<void>((r) => server.on('listening', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
const email = `benchmark-${randomUUID()}@example.invalid`;
try {
  const signup = await fetch(base + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'benchmark-password-123' }),
  });
  if (signup.status !== 201) throw new Error('Benchmark signup failed');
  const cookie = signup.headers.get('set-cookie')!.split(';')[0];
  const csv =
    'Category,Revenue,Month\n' +
    Array.from({ length: 10000 }, (_, i) => `Category-${i % 10},${i % 1000},Month-${i % 6}`).join(
      '\n',
    );
  const headers = { Cookie: cookie };
  let datasetId = '';
  const summaries = [];
  for (const mode of ['upload', 'summary', 'chart']) {
    const samples: number[] = [];
    let errors = 0;
    const start = performance.now();
    const count = mode === 'upload' ? 15 : 100;
    for (let i = 0; i < count; i++) {
      const form = new FormData();
      if (mode === 'upload')
        form.append('file', new Blob([csv], { type: 'text/csv' }), 'synthetic-10000.csv');
      const before = performance.now();
      const response = await fetch(
        base +
          (mode === 'upload'
            ? '/datasets'
            : `/datasets/${datasetId}${mode === 'chart' ? '/chart?group=Category&metric=Revenue' : ''}`),
        {
          method: mode === 'upload' ? 'POST' : 'GET',
          headers,
          body: mode === 'upload' ? form : undefined,
        },
      );
      const body = await response.json();
      samples.push(performance.now() - before);
      if (response.status !== (mode === 'upload' ? 201 : 200)) errors++;
      if (mode === 'upload' && response.ok) {
        if (datasetId) await fetch(base + '/datasets/' + datasetId, { method: 'DELETE', headers });
        datasetId = body.id;
        if (body.analytics.rowCount !== 10000) throw new Error('Unexpected row count');
      }
    }
    const wallMs = performance.now() - start;
    samples.sort((a, b) => a - b);
    const percentile = (p: number) => samples[Math.ceil(p * samples.length) - 1];
    summaries.push({
      operation: mode,
      rows: 10000,
      concurrency: 1,
      requests: count,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      throughputRequestsPerSecond: count / (wallMs / 1000),
      errorRate: errors / count,
      wallMs,
    });
  }
  const report = {
    method:
      'Local HTTP fetch to one running Express server; isolated native PostgreSQL 16.3, Node 24.11.0, macOS arm64. 10,000-row/3-column synthetic CSV. Sequential requests, no warmup. Upload: 15 samples (20/min production limit), deleting prior uploads between requests; throughput includes cleanup. Summary/chart: 100 samples each on final upload; timings include full response body decoding. Nearest-rank p50/p95. No model calls; no before/after latency speedup claimed.',
    summaries,
  };
  writeFileSync('benchmarks/results/http.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
} finally {
  await pool.query('DELETE FROM users WHERE email=$1', [email]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
}
