import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { settings } from '@/db/schema';

export const SettingKeys = {
  dailyNewCardLimit: 'dailyNewCardLimit',
  playInSilentMode: 'playInSilentMode',
  studyClozeMode: 'studyClozeMode',
} as const;

export type SettingKey = (typeof SettingKeys)[keyof typeof SettingKeys];

export const DEFAULT_SETTINGS = {
  dailyNewCardLimit: 10,
  playInSilentMode: true,
  studyClozeMode: false,
} as const satisfies Record<SettingKey, unknown>;

export async function getSetting<T>(key: SettingKey, fallback: T): Promise<T> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1).all();
  const row = rows[0];
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: SettingKey, value: T): Promise<void> {
  const serialized = JSON.stringify(value);
  const now = Date.now();
  const existing = await db
    .select({ key: settings.key })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1)
    .all();
  if (existing.length === 0) {
    await db.insert(settings).values({ key, value: serialized, updatedAt: now });
  } else {
    await db.update(settings).set({ value: serialized, updatedAt: now }).where(eq(settings.key, key));
  }
}
