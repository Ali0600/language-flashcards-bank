import { open } from '@op-engineering/op-sqlite';
import { drizzle } from 'drizzle-orm/op-sqlite';

import * as schema from './schema';

const DB_NAME = 'flashcards.db';

const connection = open({ name: DB_NAME });
connection.execute('PRAGMA foreign_keys = ON;');

export const db = drizzle(connection as any, { schema, casing: 'snake_case' });

export type DB = typeof db;
export { schema };
