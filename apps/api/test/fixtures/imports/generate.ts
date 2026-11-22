// Rewrites the small committed fixtures: `node apps/api/test/fixtures/imports/generate.ts`.
// The large ones (F-06..F-08 and friends) are built in the tests from build.ts.
import { writeFile } from 'node:fs/promises'
import { F } from './build.ts'

const dir = new URL('.', import.meta.url)
const files = {
  'template-bom.csv': F.templateBom,
  'no-bom.csv': F.noBom,
  'thai-names.csv': F.thaiNames,
  'formula.xlsx': F.formulaXlsx,
  'two-sheets.xlsx': F.twoSheets,
  'header-only.csv': F.headerOnly,
  'fake.xlsx': F.fakeXlsx,
  'latin1.csv': F.latin1,
  'report.txt': F.reportTxt,
  'legacy.xls': F.legacyXls,
}
for (const [name, build] of Object.entries(files)) await writeFile(new URL(name, dir), await build())
