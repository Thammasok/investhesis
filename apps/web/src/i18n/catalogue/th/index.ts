import type { Catalogue } from '../../catalogue-types'
import type { en } from '../en/index'
import { auth_th } from './auth'
import { chains_th } from './chains'
import { common_th } from './common'
import { concentration_th } from './concentration'
import { errors_th } from './errors'
import { exports_th } from './exports'
import { fields_th } from './fields'
import { filters_th } from './filters'
import { holdings_th } from './holdings'
import { imports_th } from './imports'
import { language_th } from './language'
import { lists_th } from './lists'
import { nav_th } from './nav'
import { placeholder_th } from './placeholder'
import { shell_th } from './shell'
import { stocks_th } from './stocks'
import { theses_th } from './theses'

export const th: Catalogue<typeof en> = {
  auth: auth_th,
  chains: chains_th,
  common: common_th,
  concentration: concentration_th,
  errors: errors_th,
  exports: exports_th,
  fields: fields_th,
  filters: filters_th,
  holdings: holdings_th,
  imports: imports_th,
  language: language_th,
  lists: lists_th,
  nav: nav_th,
  placeholder: placeholder_th,
  shell: shell_th,
  stocks: stocks_th,
  theses: theses_th,
}
