import { date, numeric, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

const app = pgSchema('app')

export type ThesisTypeColumn = 'buy' | 'sell' | 'update' | 'review'

// `date` and `numeric` are strings in JS: no Date, no time-zone shift, no float.
export const theses = app.table('theses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  stockId: uuid('stock_id').notNull(),
  type: text('type').$type<ThesisTypeColumn>().notNull(),
  entryDate: date('entry_date', { mode: 'string' }).notNull(),
  note: text('note').notNull(),
  targetPrice: numeric('target_price', { precision: 18, scale: 4 }),
  invalidation: text('invalidation'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
