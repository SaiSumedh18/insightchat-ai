import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { migrate, pool } from '../src/db.js';
import { validateConfig } from '../src/config.js';
const answer = vi.fn(
  async (_dataset: unknown, _question: string, _history: unknown[]) =>
    'Books has total Revenue of 30, calculated from all rows.',
);
const app = createApp(answer, true);
const alice = request.agent(app);
const bob = request.agent(app);
const suffix = randomUUID();
const email = `alice-${suffix}@example.com`;
const password = 'test-password-123';
let datasetId = '';
beforeAll(async () => {
  validateConfig();
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Use an isolated test database');
  await migrate();
});
afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email=ANY($1::text[])', [
    [email, `bob-${suffix}@example.com`],
  ]);
  await pool.end();
});
describe('authenticated dataset lifecycle against PostgreSQL', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/datasets')).status).toBe(401);
  });
  it('validates signup and sets an HttpOnly JWT cookie', async () => {
    expect(
      (await alice.post('/api/auth/register').send({ email: 'invalid', password: 'short' })).status,
    ).toBe(400);
    expect(
      (await alice.post('/api/auth/register').send({ email, password: '😀'.repeat(20) })).status,
    ).toBe(400);
    const response = await alice.post('/api/auth/register').send({ email, password });
    expect(response.status).toBe(201);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=Strict');
    expect((await alice.post('/api/auth/register').send({ email, password })).status).toBe(409);
    expect(
      (await bob.post('/api/auth/register').send({ email: `bob-${suffix}@example.com`, password }))
        .status,
    ).toBe(201);
  });
  it('rejects incorrect login and permits valid login', async () => {
    expect(
      (await request(app).post('/api/auth/login').send({ email, password: 'incorrect' })).status,
    ).toBe(401);
    expect((await alice.post('/api/auth/login').send({ email, password })).status).toBe(200);
    expect((await alice.get('/api/auth/me')).body.email).toBe(email);
  });
  it('blocks cross-origin writes and invalid uploads', async () => {
    expect(
      (await alice.post('/api/auth/logout').set('Origin', 'https://evil.example')).status,
    ).toBe(403);
    expect(
      (await alice.post('/api/datasets').attach('file', Buffer.from('a,a\n1,2'), 'bad.csv')).status,
    ).toBe(400);
    expect(
      (await alice.post('/api/datasets').attach('file', Buffer.from('a\n1'), 'bad.txt')).status,
    ).toBe(400);
    expect(
      (
        await alice
          .post('/api/datasets')
          .attach('file', Buffer.alloc(2 * 1024 * 1024 + 1), 'large.csv')
      ).status,
    ).toBe(400);
  });
  it('uploads, stores, and aggregates the complete dataset', async () => {
    const response = await alice
      .post('/api/datasets')
      .attach('file', Buffer.from('Category,Revenue\nBooks,10\nBooks,20\nGames,5'), 'sales.csv');
    expect(response.status).toBe(201);
    datasetId = response.body.id;
    expect(response.body.analytics.rowCount).toBe(3);
    expect(response.body.analytics.stats[1].sum).toBe(35);
    expect((await alice.get('/api/datasets')).body).toHaveLength(1);
    expect((await alice.get(`/api/datasets/${datasetId}`)).body.preview).toHaveLength(3);
    expect(
      (await alice.get(`/api/datasets/${datasetId}/chart?group=Category&metric=Revenue`)).body
        .data[0],
    ).toEqual({ label: 'Books', value: 30, count: 2 });
    expect(
      (await alice.get(`/api/datasets/${datasetId}/chart?group=Category&metric=invalid`)).status,
    ).toBe(400);
  });
  it('isolates every dataset endpoint between accounts', async () => {
    expect((await bob.get('/api/datasets')).body).toEqual([]);
    for (const path of ['', '/chart?group=Category&metric=Revenue', '/messages'])
      expect((await bob.get(`/api/datasets/${datasetId}${path}`)).status).toBe(404);
    expect(
      (await bob.post(`/api/datasets/${datasetId}/messages`).send({ question: 'hi' })).status,
    ).toBe(404);
    expect((await bob.delete(`/api/datasets/${datasetId}`)).status).toBe(404);
    expect(answer).not.toHaveBeenCalled();
  });
  it('stores both messages and supplies history to the next answer', async () => {
    expect(
      (
        await alice
          .post(`/api/datasets/${datasetId}/messages`)
          .send({ question: 'Which category leads?' })
      ).status,
    ).toBe(201);
    let history = (await alice.get(`/api/datasets/${datasetId}/messages`)).body;
    expect(history.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(
      (await alice.post(`/api/datasets/${datasetId}/messages`).send({ question: 'Why?' })).status,
    ).toBe(201);
    expect(answer.mock.calls[1]?.[2]).toHaveLength(2);
  });
  it('handles unavailable AI without saving misleading history', async () => {
    const failed = createApp(async () => {
      throw new Error('secret-upstream-detail');
    }, true);
    const client = request.agent(failed);
    await client.post('/api/auth/login').send({ email, password });
    const response = await client
      .post(`/api/datasets/${datasetId}/messages`)
      .send({ question: 'Fail please' });
    expect(response.status).toBe(502);
    expect(response.text).not.toContain('secret-upstream-detail');
    expect((await alice.get(`/api/datasets/${datasetId}/messages`)).body).toHaveLength(4);
    const disabled = request.agent(createApp(answer, false));
    await disabled.post('/api/auth/login').send({ email, password });
    expect(
      (await disabled.post(`/api/datasets/${datasetId}/messages`).send({ question: 'hello' }))
        .status,
    ).toBe(503);
  });
  it('deletes the dataset and cascades chat history, then logs out', async () => {
    expect((await alice.delete(`/api/datasets/${datasetId}`)).status).toBe(204);
    expect(
      (await pool.query('SELECT * FROM messages WHERE dataset_id=$1', [datasetId])).rows,
    ).toHaveLength(0);
    expect((await alice.get(`/api/datasets/${datasetId}`)).status).toBe(404);
    expect((await alice.post('/api/auth/logout')).status).toBe(204);
    expect((await alice.get('/api/datasets')).status).toBe(401);
  });
});
