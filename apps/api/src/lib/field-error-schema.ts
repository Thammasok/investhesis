import { z } from 'zod'

/** OpenAPI shape of `FieldError`: English `message` plus the rule id and params clients translate from. */
export const FieldErrorOut = z.object({
  path: z.string(),
  message: z.string(),
  rule: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
})
