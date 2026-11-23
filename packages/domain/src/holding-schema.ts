import { z } from 'zod'
import { MESSAGES } from './messages.ts'
import { oneOf } from './fields.ts'
import { rejectUnknownKeys } from './stock-schema.ts'

const SHARES_PATTERN = /^\d{1,14}(\.\d{1,4})?$/
const RATE_PATTERN = /^\d{1,12}(\.\d{1,6})?$/
const isPositive = (s: string) => /[1-9]/.test(s)

const decimalText = z.string({ error: () => MESSAGES.decimalString })

const holdingShape = {
  shares: decimalText
    .refine((s) => SHARES_PATTERN.test(s) && isPositive(s), { error: MESSAGES.sharesFormat })
    .nullish(),
  averageCost: decimalText.refine((s) => SHARES_PATTERN.test(s), { error: MESSAGES.averageCostFormat }).nullish(),
  costCurrency: oneOf(['USD', 'THB']).optional(),
}

/** One holding. Decimal strings only, so a float never enters; omitted amounts mean "held, amount unknown". */
export const HoldingInput = z.looseObject(holdingShape).superRefine((v, ctx) => {
  rejectUnknownKeys(v, Object.keys(holdingShape), ctx)
})
export type HoldingInput = z.output<typeof HoldingInput>

const settingsShape = {
  concentrationThreshold: z
    .number({ error: () => MESSAGES.thresholdRange })
    .int({ error: MESSAGES.thresholdRange })
    .min(1, { error: MESSAGES.thresholdRange })
    .max(100, { error: MESSAGES.thresholdRange })
    .optional(),
  usdThbRate: decimalText
    .refine((s) => RATE_PATTERN.test(s) && isPositive(s), { error: MESSAGES.usdThbRateFormat })
    .nullish(),
}

/** Absent = unchanged; usdThbRate null clears the rate. */
export const SettingsPatch = z.looseObject(settingsShape).superRefine((v, ctx) => {
  rejectUnknownKeys(v, Object.keys(settingsShape), ctx)
})
export type SettingsPatch = z.output<typeof SettingsPatch>
