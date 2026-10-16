import pg from 'pg';
import { config } from './config.js';
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
// Arbitrary app-wide key for the migration advisory lock.
const MIGRATION_LOCK_KEY = 7_412_903;

// Small, idempotent schema: one user owns datasets; each dataset owns its chat messages.
// Concurrent callers (parallel test files, several server instances starting together) can
// still collide on CREATE TABLE IF NOT EXISTS in the system catalog, so each run takes a
// transaction-scoped advisory lock first; it is released on COMMIT or ROLLBACK.
export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
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
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
