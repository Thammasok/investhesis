import { numeric, pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core'

const app = pgSchema('app')

export type CostCurrency = 'USD' | 'THB'

// numeric columns are strings in JS: money and shares never pass through a float.
export const holdings = app.table('holdings', {
  stockId: uuid('stock_id').primaryKey(),
  userId: uuid('user_id').notNull(),
  shares: numeric('shares', { precision: 18, scale: 4 }),
  averageCost: numeric('average_cost', { precision: 18, scale: 4 }),
  costCurrency: text('cost_currency').$type<CostCurrency>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userSettings = app.table('user_settings', {
  userId: uuid('user_id').primaryKey(),
  concentrationThreshold: smallint('concentration_threshold').notNull().default(40),
  usdThbRate: numeric('usd_thb_rate', { precision: 18, scale: 6 }),
  usdThbRateUpdatedAt: timestamp('usd_thb_rate_updated_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
