import { eq } from 'drizzle-orm'
import type { DbOrTx } from '../../db/client.ts'
import { userSettings } from '../../db/schema/index.ts'

export type Language = 'en' | 'th'

/** The saved interface language, or null when the user never chose one (no row, or null column). */
export async function findLanguage(db: DbOrTx, userId: string): Promise<Language | null> {
  const [row] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, userId))
  return row?.language ?? null
}
