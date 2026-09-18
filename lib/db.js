import pg from 'pg';

const { Pool } = pg;
let pool;

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

export async function withTransaction(callback) {
  const database = getPool();
  if (!database) throw new Error('DATABASE_URL no está configurada.');
  const client = await database.connect();
  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
