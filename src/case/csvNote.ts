export const REJECT_CSV_NOTE = 'строка не попадёт в results.csv'
export function editCsvNote(input: string, was: string): string {
  const v = parseFloat(input.replace(',', '.').replace('−', '-').trim())
  if (!Number.isFinite(v)) return ''
  return `в results.csv: normalized_value ${+v.toFixed(6)}${was ? ` (было ${was})` : ''}, исходное — в note`
}
