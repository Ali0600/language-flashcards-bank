import { open } from '@op-engineering/op-sqlite';
import { drizzle } from 'drizzle-orm/op-sqlite';

import * as schema from './schema';

const DB_NAME = 'flashcards.db';

const connection = open({ name: DB_NAME });
connection.execute('PRAGMA foreign_keys = ON;');

// drizzle-orm imports OPSQLiteConnection from @op-engineering/op-sqlite, but
// that type isn't re-exported by recent versions. The shapes are compatible
// at runtime; this cast bridges the gap until upstream realigns.
type DrizzleClient = Parameters<typeof drizzle>[0];

export const db = drizzle(connection as unknown as DrizzleClient, {
  schema,
  casing: 'snake_case',
});

export type DB = typeof db;
export { schema };
