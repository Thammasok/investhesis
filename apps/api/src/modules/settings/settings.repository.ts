import { eq, sql } from 'drizzle-orm'
import type { Db, DbOrTx } from '../../db/client.ts'
import { userSettings } from '../../db/schema/index.ts'

export type SettingsRow = {
  concentrationThreshold: number
  usdThbRate: string | null
  usdThbRateUpdatedAt: Date | null
  language: 'en' | 'th' | null
}

export type SettingsChange = { concentrationThreshold?: number; usdThbRate?: string | null; language?: 'en' | 'th' }

const columns = {
  concentrationThreshold: userSettings.concentrationThreshold,
  usdThbRate: userSettings.usdThbRate,
  usdThbRateUpdatedAt: userSettings.usdThbRateUpdatedAt,
  language: userSettings.language,
}

export async function findSettings(db: DbOrTx, userId: string): Promise<SettingsRow | undefined> {
  const [row] = await db.select(columns).from(userSettings).where(eq(userSettings.userId, userId))
  return row
}

/** One statement, so concurrent first saves cannot collide on the primary key. */
export async function upsertSettings(db: Db, userId: string, change: SettingsChange): Promise<SettingsRow> {
  const set = {
    ...(change.concentrationThreshold !== undefined && { concentrationThreshold: change.concentrationThreshold }),
    ...(change.usdThbRate !== undefined && {
      usdThbRate: change.usdThbRate,
      usdThbRateUpdatedAt: change.usdThbRate === null ? null : sql`now()`,
    }),
    ...(change.language !== undefined && { language: change.language }),
    updatedAt: sql`now()`,
  }
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: userSettings.userId, set })
    .returning(columns)
  if (!row) throw new Error('settings upsert returned no row')
  return row
}
