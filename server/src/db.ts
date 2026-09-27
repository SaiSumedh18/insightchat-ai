import pg from 'pg';
import { config } from './config.js';
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
// Small, idempotent schema: one user owns datasets; each dataset owns its chat messages.
export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS datasets (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, columns JSONB NOT NULL, rows JSONB NOT NULL,
      analytics JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS datasets_owner ON datasets(user_id);
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY, dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')), content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS messages_dataset ON messages(dataset_id, id);
  `);
}
