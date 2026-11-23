import type { SettingsPatch } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import * as repo from './settings.repository.ts'

export const DEFAULT_THRESHOLD = 40

export type SettingsView = {
  concentrationThreshold: number
  usdThbRate: string | null
  usdThbRateUpdatedAt: string | null
}

const view = (r: repo.SettingsRow | undefined): SettingsView => ({
  concentrationThreshold: r?.concentrationThreshold ?? DEFAULT_THRESHOLD,
  usdThbRate: r?.usdThbRate ?? null,
  usdThbRateUpdatedAt: r?.usdThbRateUpdatedAt?.toISOString() ?? null,
})

export async function getSettings(db: Db, userId: string): Promise<SettingsView> {
  return view(await repo.findSettings(db, userId))
}

/** An empty patch changes nothing and creates no row. */
export async function updateSettings(db: Db, userId: string, patch: SettingsPatch): Promise<SettingsView> {
  if (patch.concentrationThreshold === undefined && patch.usdThbRate === undefined) return getSettings(db, userId)
  return view(await repo.upsertSettings(db, userId, patch))
}
