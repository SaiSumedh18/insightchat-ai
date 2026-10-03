import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { pool, migrate } from '../src/db.js';
import type { StreamAnswer } from '../src/assistant.js';
const emails: string[] = [];
beforeAll(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Use an isolated test database');
  await migrate();
});
afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email=ANY($1::text[])', [emails]);
  await pool.end();
});
async function fixture(stream: StreamAnswer) {
  const app = createApp(async () => 'Non-stream answer', true, stream);
  const agent = request.agent(app),
    email = randomUUID() + '@example.invalid';
  emails.push(email);
  expect(
    (await agent.post('/api/auth/register').send({ email, password: 'TestPassword123!' })).status,
  ).toBe(201);
  const upload = await agent
    .post('/api/datasets')
    .attach('file', Buffer.from('Category,Revenue\nBooks,10\nBooks,20'), 'data.csv');
  return { app, agent, id: upload.body.id };
}
it('streams SSE deltas then saves both messages atomically', async () => {
  const { agent, id } = await fixture(async (_d, _q, _h, emit) => {
    await emit('Books ');
    await emit('total 30.');
    return 'Books total 30.';
  });
  const r = await agent.post(`/api/datasets/${id}/messages/stream`).send({ question: 'Revenue?' });
  expect(r.status).toBe(200);
  expect(r.headers['content-type']).toContain('text/event-stream');
  expect(r.headers['x-accel-buffering']).toBe('no');
  expect(r.text).toContain('event: delta');
  expect(r.text).toContain('event: done');
  const saved = await agent.get(`/api/datasets/${id}/messages`);
  expect(saved.body.map((m: any) => m.role)).toEqual(['user', 'assistant']);
  expect(saved.body[1].content).toBe('Books total 30.');
});
it('provider errors after a delta leave no partial turn', async () => {
  const { agent, id } = await fixture(async (_d, _q, _h, emit) => {
    await emit('Partial');
    throw new Error('Private provider diagnostic');
  });
  const r = await agent.post(`/api/datasets/${id}/messages/stream`).send({ question: 'Revenue?' });
  expect(r.text).toContain('event: error');
  expect(r.text).not.toContain('Private provider');
  expect((await agent.get(`/api/datasets/${id}/messages`)).body).toEqual([]);
});
it('rejects unauthenticated and foreign dataset streaming without calling AI', async () => {
  const stream = vi.fn(async () => 'Answer');
  const { app, id } = await fixture(stream);
  expect(
    (await request(app).post(`/api/datasets/${id}/messages/stream`).send({ question: 'hi' }))
      .status,
  ).toBe(401);
  const other = request.agent(app),
    email = randomUUID() + '@example.invalid';
  emails.push(email);
  await other.post('/api/auth/register').send({ email, password: 'TestPassword123!' });
  expect(
    (await other.post(`/api/datasets/${id}/messages/stream`).send({ question: 'hi' })).status,
  ).toBe(404);
  expect(stream).not.toHaveBeenCalled();
});
it('enforces a shared per-user chat rate limit', async () => {
  const { agent, id } = await fixture(async () => 'Answer');
  for (let i = 0; i < 10; i++)
    expect(
      (await agent.post(`/api/datasets/${id}/messages/stream`).send({ question: 'hi' })).status,
    ).toBe(200);
  expect((await agent.post(`/api/datasets/${id}/messages`).send({ question: 'hi' })).status).toBe(
    429,
  );
});
it('keeps the legacy non-stream endpoint working', async () => {
  const { agent, id } = await fixture(async () => 'Answer');
  expect((await agent.post(`/api/datasets/${id}/messages`).send({ question: 'hi' })).status).toBe(
    201,
  );
});
it('cancels provider work when the HTTP client disconnects', async () => {
  let aborted = false;
  const { app, agent, id } = await fixture(async (_d, _q, _h, emit, signal) => {
    await emit('Partial');
    await new Promise<void>((resolve) =>
      signal!.addEventListener(
        'abort',
        () => {
          aborted = true;
          resolve();
        },
        { once: true },
      ),
    );
    throw new Error('Cancelled');
  });
  const server = app.listen(0);
  try {
    const cookie = (
      await agent
        .post('/api/auth/login')
        .send({ email: emails.at(-1), password: 'TestPassword123!' })
    ).headers['set-cookie'][0].split(';')[0];
    const address = server.address() as { port: number };
    const controller = new AbortController();
    const r = await fetch(`http://127.0.0.1:${address.port}/api/datasets/${id}/messages/stream`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'hi' }),
      signal: controller.signal,
    });
    await r.body!.getReader().read();
    controller.abort();
    for (let i = 0; i < 50 && !aborted; i++) await new Promise((r) => setTimeout(r, 10));
    expect(aborted).toBe(true);
    expect((await agent.get(`/api/datasets/${id}/messages`)).body).toEqual([]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('allows only one active answer per user across different datasets', async () => {
  let start!: () => void, release!: () => void;
  const started = new Promise<void>((r) => (start = r)),
    released = new Promise<void>((r) => (release = r));
  const { agent, id } = await fixture(async () => {
    start();
    await released;
    return 'Completed';
  });
  const other = (
    await agent
      .post('/api/datasets')
      .attach('file', Buffer.from('Category,Revenue\nGames,10'), 'other.csv')
  ).body.id;
  const first = agent
    .post(`/api/datasets/${id}/messages/stream`)
    .send({ question: 'hi' })
    .then((r) => r);
  try {
    await started;
    expect(
      (await agent.post(`/api/datasets/${other}/messages/stream`).send({ question: 'hi' })).status,
    ).toBe(409);
  } finally {
    release();
    await first;
  }
  expect(
    (await agent.post(`/api/datasets/${other}/messages/stream`).send({ question: 'hi' })).status,
  ).toBe(200);
});
