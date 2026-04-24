import * as SQLite from 'expo-sqlite';

import { runMigrations } from '@/lib/db/migrations';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openDatabase() {
  const db = await SQLite.openDatabaseAsync('ecofy-mobile.db');
  await runMigrations(db);
  return db;
}

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabase();
  }

  return databasePromise;
}

export async function withTransaction<T>(
  callback: (db: SQLite.SQLiteDatabase) => Promise<T>,
) {
  const db = await getDatabase();
  let result: T | undefined;
  await db.withTransactionAsync(async () => {
    result = await callback(db);
  });
  return result as T;
}
