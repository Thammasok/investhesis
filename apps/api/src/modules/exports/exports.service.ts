import { BACKUP_FORMAT, EXPORT_COLUMNS, exportRow, toDelimited, type BackupV1 } from '@investhesis/domain'
import type { Db } from '../../db/client.ts'
import { listLists, listMembershipsForUser } from '../lists/lists.repository.ts'
import { getSettings } from '../settings/settings.service.ts'
import { listOwnedStocks } from '../stocks/stocks.repository.ts'
import { view, type StockView } from '../stocks/stocks.service.ts'

const BOM = '﻿'

/** Market, then ticker, by code unit (the repository's "C" order), so `TH` comes before `US`. */
const byMarketThenTicker = (a: StockView, b: StockView) =>
  a.market === b.market ? (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0) : a.market < b.market ? -1 : 1

type Snapshot = { stocks: StockView[]; lists: BackupV1['lists']; settings: BackupV1['settings']; listNames: Map<string, string> }

/**
 * Everything the user owns, read in one repeatable-read, read-only transaction so a write that lands
 * mid-export cannot leave a list pointing at a stock the export lacks (ADR-005).
 */
async function snapshot(db: Db, userId: string): Promise<Snapshot> {
  return db.transaction(
    async (tx) => {
      const stocks = (await listOwnedStocks(tx, userId)).map(view).sort(byMarketThenTicker)
      const lists = await listLists(tx, userId)
      const memberships = await listMembershipsForUser(tx, userId)
      const settings = await getSettings(tx, userId)
      const stockIdsByList = new Map<string, string[]>()
      for (const m of memberships) {
        const ids = stockIdsByList.get(m.listId) ?? []
        ids.push(m.stockId)
        stockIdsByList.set(m.listId, ids)
      }
      return {
        stocks,
        lists: lists.map((l) => ({
          id: l.id,
          name: l.name,
          createdAt: l.createdAt.toISOString(),
          updatedAt: l.updatedAt.toISOString(),
          stockIds: stockIdsByList.get(l.id) ?? [],
        })),
        settings,
        listNames: new Map(lists.map((l) => [l.id, l.name])),
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )
}

/** FR-016: the JSON backup. A stock carries no `listIds`; membership is stated once, on the list. */
export async function buildBackup(db: Db, userId: string, now: Date): Promise<BackupV1> {
  const { stocks, lists, settings } = await snapshot(db, userId)
  return {
    format: BACKUP_FORMAT,
    formatVersion: 1,
    exportedAt: now.toISOString(),
    stocks: stocks.map(({ listIds: _listIds, ...stock }) => stock),
    lists,
    settings,
  }
}

/** FR-015: the CSV backup, BOM first, one row per stock, header only when there are none. */
export async function backupCsv(db: Db, userId: string): Promise<string> {
  const { stocks, listNames } = await snapshot(db, userId)
  return BOM + toDelimited([EXPORT_COLUMNS, ...stocks.map((s) => exportRow(s, listNames))], ',')
}

/** `investhesis-backup-YYYY-MM-DD.<ext>` with the UTC date; the web names the saved file by local date. */
export const backupFileName = (now: Date, ext: 'json' | 'csv') =>
  `investhesis-backup-${now.toISOString().slice(0, 10)}.${ext}`
