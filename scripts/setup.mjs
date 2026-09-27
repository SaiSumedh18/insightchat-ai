import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = path.join(root, '.env');
if (!existsSync(env)) {
  writeFileSync(
    env,
    `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\nJWT_SECRET=${randomBytes(32).toString('hex')}\nOPENAI_API_KEY=\nOPENAI_MODEL=gpt-4.1-mini\n`,
    { mode: 0o600 },
  );
}
const values = Object.fromEntries(
  readFileSync(env, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const serverEnv = path.join(root, 'server/.env');
if (!existsSync(serverEnv))
  writeFileSync(
    serverEnv,
    `DATABASE_URL=postgresql://insightchat:${encodeURIComponent(values.POSTGRES_PASSWORD)}@localhost:5437/insightchat\nJWT_SECRET=${values.JWT_SECRET}\nPORT=4300\nAPP_ORIGIN=http://localhost:5177\nOPENAI_API_KEY=${values.OPENAI_API_KEY ?? ''}\nOPENAI_MODEL=${values.OPENAI_MODEL ?? 'gpt-4.1-mini'}\n`,
    { mode: 0o600 },
  );
chmodSync(env, 0o600);
chmodSync(serverEnv, 0o600);
console.log('Local environment files are ready. Existing values were preserved.');
