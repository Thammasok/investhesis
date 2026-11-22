import { jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

const app = pgSchema('app')

export type LensSource = 'manual' | 'default'

const stamp = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const stocks = app.table('stocks', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  market: text('market').notNull(),
  ticker: text('ticker').notNull(),
  exchange: text('exchange').notNull(),
  currency: text('currency').notNull(),
  name: text('name').notNull(),
  indexMembership: text('index_membership').array().notNull().default([]),
  gicsSector: text('gics_sector'),
  setIndustryGroup: text('set_industry_group'),
  valueChain: text('value_chain'),
  valueChainPosition: text('value_chain_position'),
  size: text('size'),
  style: text('style'),
  economicCycle: text('economic_cycle'),
  lynchType: text('lynch_type'),
  lifeCycle: text('life_cycle'),
  customers: text('customers').array().notNull().default([]),
  revenueTypes: text('revenue_types').array().notNull().default([]),
  moat: text('moat'),
  themes: text('themes').array().notNull().default([]),
  volatility: text('volatility'),
  lensSources: jsonb('lens_sources').$type<Record<string, LensSource>>().notNull().default({}),
  createdAt: stamp(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const lists = app.table('lists', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  createdAt: stamp(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const listStocks = app.table('list_stocks', {
  listId: uuid('list_id').notNull(),
  stockId: uuid('stock_id').notNull(),
  userId: uuid('user_id').notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
})
