import { auth } from './auth'
import { chains } from './chains'
import { common } from './common'
import { concentration } from './concentration'
import { errors } from './errors'
import { exports } from './exports'
import { fields } from './fields'
import { filters } from './filters'
import { holdings } from './holdings'
import { imports } from './imports'
import { language } from './language'
import { lists } from './lists'
import { nav } from './nav'
import { placeholder } from './placeholder'
import { shell } from './shell'
import { stocks } from './stocks'
import { theses } from './theses'

/** The source of truth for keys and English text. Thai is typed against it. */
export const en = {
  auth,
  chains,
  common,
  concentration,
  errors,
  exports,
  fields,
  filters,
  holdings,
  imports,
  language,
  lists,
  nav,
  placeholder,
  shell,
  stocks,
  theses,
} as const
