import type { FieldName } from '../stock-form-model'

/** Radix forbids an empty item value, so "Not set" travels as this and maps back to `''`. */
export const NONE = '__none__'

/** `aria-invalid` and `aria-describedby` for a control whose error is rendered by `FieldMessage`. */
export function errorProps(name: FieldName, error: string | undefined) {
  return error ? { 'aria-invalid': true as const, 'aria-describedby': `stock-${name}-error` } : {}
}
