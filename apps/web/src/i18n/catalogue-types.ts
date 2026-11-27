type OtherKeys<T> = { [K in keyof T as K extends `${string}_one` ? never : K]: T[K] extends string ? string : Catalogue<T[K]> }
type OneKeys<T> = { [K in keyof T as K extends `${string}_one` ? K : never]?: string }

/**
 * The shape a Thai catalogue must have, derived from the English one: same keys, string leaves.
 * Plural `_one` keys are optional (Thai has only `_other`). A missing or extra key fails typecheck.
 */
export type Catalogue<T> = OtherKeys<T> & OneKeys<T>
