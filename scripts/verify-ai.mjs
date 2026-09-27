import dotenv from 'dotenv';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
dotenv.config({ path: 'server/.env', quiet: true });
const base = 'http://localhost:4300/api';
const email = `ai-verification-${randomUUID()}@example.com`;
let cookie = '';
async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: { Cookie: cookie, ...options.headers },
  });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}
if (!(await request('/health')).aiEnabled)
  throw new Error('Add OPENAI_API_KEY to the active server environment and restart the API first.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await request('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: randomUUID() }),
  });
  const form = new FormData();
  form.append(
    'file',
    new Blob(['Category,Revenue\nBooks,10\nBooks,20\nGames,5']),
    'verification.csv',
  );
  const dataset = await request('/datasets', { method: 'POST', body: form });
  const answer = await request(`/datasets/${dataset.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'Which Category has the highest total Revenue? Include its total.',
    }),
  });
  if (!/books/i.test(answer.content) || !/(?:\b30\b|thirty)/i.test(answer.content))
    throw new Error(
      'An answer was returned but did not pass the expected Books / 30 check. Review grounding.',
    );
  const history = await request(`/datasets/${dataset.id}/messages`);
  if (history.length !== 2) throw new Error('Chat persistence failed.');
  console.log(
    'Live OpenAI verification passed: correct category and total; both messages persisted.',
  );
} finally {
  await pool.query('DELETE FROM users WHERE email=$1', [email]);
  await pool.end();
}
