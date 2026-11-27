import type { Catalogue } from '../../catalogue-types'
import type { en } from '../en/index'
import { common_th } from './common'
import { errors_th } from './errors'
import { fields_th } from './fields'
import { nav_th } from './nav'
import { placeholder_th } from './placeholder'

export const th: Catalogue<typeof en> = {
  common: common_th,
  errors: errors_th,
  fields: fields_th,
  nav: nav_th,
  placeholder: placeholder_th,
}
